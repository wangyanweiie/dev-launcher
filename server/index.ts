/**
 * Dev Launcher HTTP / WebSocket 服务入口
 * 提供项目扫描 API、任务启停 API、默认配置 API，并通过 WS 推送日志与状态
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import {
    scanProjects,
    taskId,
    type ProjectGroup,
} from './scanner.js';
import { loadConfig, openBrowser, validateScanRoot } from './config.js';
import { getCachedProjects } from './scan-cache.js';
import { detectOrphanServices, killByPort, portFromUrl } from './orphans.js';
import { readDefaults, setProjectDefault } from './defaults.js';
import { addInstance, readInstances, removeInstance } from './instances.js';
import {
    getAllStatuses,
    getAllTaskLogs,
    getManagedPorts,
    getRunningTasks,
    getTaskExitCode,
    setRunnerListeners,
    startTask,
    stopAll,
    stopTask,
} from './runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** 项目根目录 */
const ROOT = path.join(__dirname, '..');
/** 启动器运行时配置 */
const config = loadConfig(ROOT);

const app = express();
app.use(express.json());

/** 前端静态资源目录 */
const publicDir = path.join(ROOT, 'public');
app.use(express.static(publicDir));

/** 已连接的 WebSocket 客户端 */
const clients = new Set<WebSocket>();

/**
 * 向所有 WebSocket 客户端广播消息
 * @param message - 可序列化为 JSON 的对象
 */
function broadcast(message: object): void {
    const data = JSON.stringify(message);
    for (const ws of clients) {
        if (ws.readyState === ws.OPEN) ws.send(data);
    }
}

setRunnerListeners({
    onLog: (taskId, line) => broadcast({ type: 'log', taskId, line }),
    onStatus: (taskId, status, exitCode) =>
        broadcast({ type: 'status', taskId, status, exitCode: exitCode ?? undefined }),
    onUrl: (taskId, url) => broadcast({ type: 'url', taskId, url }),
});

/**
 * 收集所有可运行任务 ID，用于批量查询状态
 * @param groups - 扫描得到的项目分组
 */
function collectTaskIds(groups: ProjectGroup[]): string[] {
    const ids: string[] = [];
    for (const g of groups) {
        if (g.root) {
            for (const s of g.root.scripts) ids.push(taskId(g.root.cwd, s.name));
        }
        for (const child of g.children) {
            for (const s of child.scripts) ids.push(taskId(child.cwd, s.name));
        }
    }
    return ids;
}

/** 返回扫描根目录与服务端口 */
app.get('/api/config', (_req, res) => {
    const scanCheck = validateScanRoot(config.scanRoot);
    res.json({
        scanRoot: config.scanRoot,
        port: config.port,
        host: config.host,
        scanOk: scanCheck.ok,
        scanError: scanCheck.ok ? undefined : scanCheck.error,
    });
});

/** 扫描项目列表，附带运行状态、URL、默认配置、外部监听 */
app.get('/api/projects', async (req, res) => {
    const scanCheck = validateScanRoot(config.scanRoot);
    const force = req.query.refresh === '1';

    let groups: ProjectGroup[] = [];
    let scanError: string | undefined;
    let cachedAt: number | undefined;
    let fromCache = false;

    if (scanCheck.ok) {
        const result = getCachedProjects(config, force);
        groups = result.groups;
        cachedAt = result.cachedAt;
        fromCache = result.fromCache;
    } else {
        scanError = scanCheck.error;
    }

    const allIds = collectTaskIds(groups);
    const statuses = getAllStatuses(allIds);
    const running = getRunningTasks();

    // 合并内存中正在运行的任务（避免 taskId 与扫描列表略有不一致时丢失状态）
    for (const t of running) {
        statuses[t.taskId] = 'running';
    }

    const exitCodes: Record<string, number> = {};
    for (const id of [...allIds, ...running.map((t) => t.taskId)]) {
        if (statuses[id] === 'crashed') {
            const code = getTaskExitCode(id);
            if (code !== undefined && code !== null) exitCodes[id] = code;
        }
    }

    const urls: Record<string, string> = Object.fromEntries(
        running.filter((t) => t.url).map((t) => [t.taskId, t.url!]),
    );
    const defaults = readDefaults();
    const instances = readInstances();

    const managedPorts = getManagedPorts();
    for (const t of running) {
        if (t.url) {
            const p = portFromUrl(t.url);
            if (p) managedPorts.add(p);
        }
    }

    const { companyOrphans } = await detectOrphanServices(
        config.scanRoot,
        config.port,
        groups,
        managedPorts,
    );

    res.json({
        groups,
        statuses,
        running,
        urls,
        defaults,
        instances,
        scanError,
        cachedAt,
        fromCache,
        orphans: companyOrphans,
        exitCodes,
    });
});

/** 读取全部默认配置 */
app.get('/api/defaults', (_req, res) => {
    res.json(readDefaults());
});

/** 保存单个项目实例的默认子项目与脚本 */
app.post('/api/defaults', (req, res) => {
    const { groupId, instanceId, subKey, script } = req.body as {
        groupId?: string;
        instanceId?: string;
        subKey?: string;
        script?: string;
    };

    if (!groupId || !subKey || !script) {
        res.status(400).json({ error: '缺少参数' });
        return;
    }

    const defaults = setProjectDefault(
        groupId,
        { subKey, script },
        instanceId ?? '',
    );
    res.json({ ok: true, defaults });
});

/** 创建项目副本 */
app.post('/api/instances', (req, res) => {
    const { groupId } = req.body as { groupId?: string };
    if (!groupId) {
        res.status(400).json({ error: '缺少参数' });
        return;
    }

    const instance = addInstance(groupId);
    const instances = readInstances();
    res.json({ ok: true, instance, instances });
});

/** 删除项目副本 */
app.delete('/api/instances', (req, res) => {
    const { groupId, instanceId } = req.body as {
        groupId?: string;
        instanceId?: string;
    };

    if (!groupId || !instanceId) {
        res.status(400).json({ error: '缺少参数' });
        return;
    }

    const ok = removeInstance(groupId, instanceId);
    if (!ok) {
        res.status(404).json({ error: '副本不存在' });
        return;
    }

    res.json({ ok: true, instances: readInstances(), defaults: readDefaults() });
});

/** 启动指定 cwd 下的脚本 */
app.post('/api/tasks/start', (req, res) => {
    const { cwd, scriptName, packageManager } = req.body as {
        cwd?: string;
        scriptName?: string;
        packageManager?: 'pnpm' | 'npm' | 'yarn';
    };

    if (!cwd || !scriptName || !packageManager) {
        res.status(400).json({ error: '缺少参数' });
        return;
    }

    const resolvedCwd = path.resolve(cwd);
    const id = taskId(resolvedCwd, scriptName);
    try {
        const result = startTask(id, resolvedCwd, scriptName, packageManager);
        res.json({ ok: true, task: result.meta, alreadyRunning: result.alreadyRunning ?? false });
    } catch (e) {
        res.status(500).json({ error: (e as Error).message });
    }
});

/** 停止指定任务 */
app.post('/api/tasks/stop', (req, res) => {
    const { cwd, scriptName } = req.body as { cwd?: string; scriptName?: string };
    if (!cwd || !scriptName) {
        res.status(400).json({ error: '缺少参数' });
        return;
    }
    const ok = stopTask(taskId(path.resolve(cwd), scriptName));
    res.json({ ok });
});

/** 停止所有正在运行的任务 */
app.post('/api/tasks/stop-all', (_req, res) => {
    stopAll();
    res.json({ ok: true });
});

/** 获取已缓冲的任务日志（页面刷新后恢复） */
app.get('/api/tasks/logs', (_req, res) => {
    res.json({ logs: getAllTaskLogs() });
});

/** 结束占用端口的外部进程（孤儿服务） */
app.post('/api/orphans/kill', async (req, res) => {
    const { port } = req.body as { port?: number };
    if (!port || port === config.port) {
        res.status(400).json({ error: '无效端口' });
        return;
    }
    const ok = await killByPort(port);
    res.json({ ok });
});

/** HTTP 服务，仅监听本机 */
const panelUrl = `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`;
const server = app.listen(config.port, config.host, () => {
    console.log(`\n  Dev Launcher  →  ${panelUrl}`);
    console.log(`  扫描目录      →  ${config.scanRoot}\n`);
    if (config.openBrowser) {
        openBrowser(panelUrl);
    }
});

server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n  端口 ${config.port} 已被占用。请先停止旧实例：`);
        console.error(`  lsof -i :${config.port}`);
        console.error(`  kill -9 $(lsof -ti :${config.port})\n`);
        process.exit(1);
    }
    throw err;
});

/** WebSocket 服务，路径 /ws */
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: 'logs-sync', logs: getAllTaskLogs() }));
    ws.on('close', () => clients.delete(ws));
});
