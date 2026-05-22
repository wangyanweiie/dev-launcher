/**
 * Dev Launcher HTTP / WebSocket 服务入口
 * 提供项目扫描 API、任务启停 API、默认配置 API，并通过 WS 推送日志与状态
 */

import path from 'node:path';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { taskId, type ProjectGroup } from './scanner.js';
import {
    applyScanRoot,
    getDefaultScanRoot,
    getWifiIPv4Addresses,
    openBrowser,
    resolveEffectiveScanRoot,
    validateScanRoot,
    isCwdUnderScanRoot,
} from './config.js';
import { getCachedProjects, clearScanCache } from './scan-cache.js';
import { initRuntime, getRuntimeConfig, reloadRuntimeConfig } from './runtime.js';
import { resolveSpawnOptions } from './task-profiles.js';
import { persistScanRoot } from './settings.js';
import { detectOrphanServices, killByPort, portFromUrl } from './orphans.js';
import { readDefaults, setProjectDefault } from './defaults.js';
import { addInstance, readInstances, removeInstance } from './instances.js';
import {
    appendTaskLog,
    getAllStatuses,
    getAllTaskLogs,
    getIdleTaskIds,
    getManagedPorts,
    getRunningTasks,
    getTaskExitCode,
    getTaskLogs,
    setRunnerListeners,
    startTask,
    stopAll,
    stopTask,
} from './runner.js';
import type { OrphanService } from './orphans.js';
import { getModuleDir, getProjectRoot } from './paths.js';

/** 项目根目录（非 dist/） */
const ROOT = getProjectRoot(getModuleDir(import.meta.url));
initRuntime(ROOT);

/** 历史服务（lsof）检测结果缓存，配合 orphanDetectMinIntervalMs */
let orphanDetectCache: { at: number; orphans: OrphanService[] } | null = null;

/**
 * 获取历史服务列表（可关闭检测或按间隔节流）
 */
async function resolveCompanyOrphans(
    groups: ProjectGroup[],
    managedPorts: Set<number>,
): Promise<OrphanService[]> {
    const config = getRuntimeConfig();
    if (!config.detectOrphanServices) {
        return [];
    }

    const minInterval = config.orphanDetectMinIntervalMs;
    const now = Date.now();
    if (
        minInterval > 0 &&
        orphanDetectCache &&
        now - orphanDetectCache.at < minInterval
    ) {
        return orphanDetectCache.orphans;
    }

    const { companyOrphans } = await detectOrphanServices(
        config.scanRoot,
        config.port,
        groups,
        managedPorts,
    );
    orphanDetectCache = { at: now, orphans: companyOrphans };
    return companyOrphans;
}

/**
 * 组装项目列表 API 的公共字段（不含 orphans）
 */
async function buildProjectsCore(force: boolean) {
    const config = getRuntimeConfig();
    syncConfigScanRoot();
    const scanCheck = validateScanRoot(config.scanRoot);

    let groups: ProjectGroup[] = [];
    let skipped: import('./scanner.js').SkippedProject[] = [];
    let scanError: string | undefined;
    let cachedAt: number | undefined;
    let fromCache = false;

    if (scanCheck.ok) {
        const result = await getCachedProjects(config, force);
        groups = result.groups;
        skipped = result.skipped;
        cachedAt = result.cachedAt;
        fromCache = result.fromCache;
    } else {
        scanError = scanCheck.error;
    }

    const allIds = collectTaskIds(groups);
    const statuses = getAllStatuses(allIds);
    const running = getRunningTasks();

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

    const urls: Record<string, string[]> = Object.fromEntries(
        running.filter((t) => t.urls?.length).map((t) => [t.taskId, t.urls!]),
    );

    const managedPorts = getManagedPorts();
    for (const t of running) {
        for (const u of t.urls ?? []) {
            const p = portFromUrl(u);
            if (p) managedPorts.add(p);
        }
    }

    return {
        config,
        scanCheck,
        groups,
        skipped,
        scanError,
        cachedAt,
        fromCache,
        statuses,
        running,
        exitCodes,
        urls,
        managedPorts,
    };
}

/** 清空历史服务缓存（停止外部进程后列表需更新） */
function invalidateOrphanDetectCache(): void {
    orphanDetectCache = null;
}

const app = express();
app.use(express.json());

/** 前端静态资源目录 */
const publicDir = path.join(ROOT, 'public');
app.use(express.static(publicDir));

/** 已连接的 WebSocket 客户端 */
const clients = new Set<WebSocket>();

/** WebSocket 日志订阅：仅 logSubscribeOnly 时使用 */
interface WsMeta {
    subscribedLogTaskId?: string;
}

const wsMeta = new WeakMap<WebSocket, WsMeta>();

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

/**
 * 推送日志行；logSubscribeOnly 时仅发给已 subscribe 该 taskId 的客户端
 */
function broadcastLog(taskId: string, line: string): void {
    const message = { type: 'log', taskId, line };
    if (!getRuntimeConfig().logSubscribeOnly) {
        broadcast(message);
        return;
    }
    const data = JSON.stringify(message);
    for (const ws of clients) {
        if (ws.readyState !== ws.OPEN) continue;
        if (wsMeta.get(ws)?.subscribedLogTaskId === taskId) {
            ws.send(data);
        }
    }
}

setRunnerListeners({
    onLog: broadcastLog,
    onStatus: (taskId, status, exitCode) =>
        broadcast({ type: 'status', taskId, status, exitCode: exitCode ?? undefined }),
    onUrl: (taskId, urls) => broadcast({ type: 'urls', taskId, urls }),
});

/** 空闲自动停止检查间隔（毫秒） */
const IDLE_CHECK_MS = 30_000;

/**
 * 定期检查空闲任务并自动停止
 */
function startIdleAutoStopWatch(): void {
    setInterval(async () => {
        const config = getRuntimeConfig();
        if (config.idleAutoStopMinutes <= 0) return;

        for (const id of getIdleTaskIds()) {
            appendTaskLog(
                id,
                `[dev-launcher] 空闲超过 ${config.idleAutoStopMinutes} 分钟，已自动停止`,
            );
            await stopTask(id);
        }
    }, IDLE_CHECK_MS);
}

startIdleAutoStopWatch();

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

/** 同步内存中的扫描路径（从已保存配置读取） */
function syncConfigScanRoot(): string {
    const config = getRuntimeConfig();
    const scanRoot = resolveEffectiveScanRoot(config);
    applyScanRoot(config, scanRoot);
    return scanRoot;
}

/**
 * 校验任务 cwd 位于当前扫描根目录下
 * @param resolvedCwd - 已 resolve 的任务目录
 */
function assertTaskCwdAllowed(
    resolvedCwd: string,
): { ok: true } | { ok: false; error: string } {
    const scanRoot = syncConfigScanRoot();
    const scanCheck = validateScanRoot(scanRoot);
    if (!scanCheck.ok) return scanCheck;
    if (!isCwdUnderScanRoot(resolvedCwd, scanRoot)) {
        return { ok: false, error: '任务目录不在当前扫描根目录之下' };
    }
    return { ok: true };
}

/** 返回扫描根目录与服务端口 */
app.get('/api/config', (_req, res) => {
    const config = getRuntimeConfig();
    const scanRoot = syncConfigScanRoot();
    const scanCheck = validateScanRoot(scanRoot);
    res.json({
        scanRoot,
        defaultScanRoot: getDefaultScanRoot(),
        port: config.port,
        host: config.host,
        scanOk: scanCheck.ok,
        scanError: scanCheck.ok ? undefined : scanCheck.error,
        scanRootFromEnv: !!process.env.DEV_LAUNCHER_SCAN_ROOT?.trim(),
        localHosts: getWifiIPv4Addresses(config.wifiIp),
        taskProfileNames: Object.keys(config.taskProfiles),
        defaultTaskProfile: config.defaultTaskProfile,
        maxRunningTasks: config.maxRunningTasks,
        idleAutoStopMinutes: config.idleAutoStopMinutes,
        logSubscribeOnly: config.logSubscribeOnly,
        forceColor: config.forceColor,
    });
});

/** 保存默认扫描目录（不触发扫描） */
app.post('/api/settings/scan-root/save', (req, res) => {
    const { scanRoot } = req.body as { scanRoot?: string };

    if (!scanRoot?.trim()) {
        res.status(400).json({ error: '请填写扫描目录' });
        return;
    }

    const resolved = path.resolve(scanRoot.trim());
    const scanCheck = validateScanRoot(resolved);
    if (!scanCheck.ok) {
        res.status(400).json({ error: scanCheck.error });
        return;
    }

    try {
        persistScanRoot(resolved);
    } catch (e) {
        res.status(500).json({ error: (e as Error).message });
        return;
    }
    applyScanRoot(getRuntimeConfig(), resolved);

    res.json({
        ok: true,
        scanRoot: resolved,
        message: '已保存到 config.json 与 launcher-settings.json',
    });
});

/** 使用输入路径执行扫描（不写入默认配置） */
app.post('/api/settings/scan', (req, res) => {
    const { scanRoot } = req.body as { scanRoot?: string };

    if (!scanRoot?.trim()) {
        res.status(400).json({ error: '请填写扫描目录' });
        return;
    }

    const resolved = path.resolve(scanRoot.trim());
    const scanCheck = validateScanRoot(resolved);
    if (!scanCheck.ok) {
        res.status(400).json({ error: scanCheck.error });
        return;
    }

    applyScanRoot(getRuntimeConfig(), resolved);
    clearScanCache();
    invalidateOrphanDetectCache();

    res.json({
        ok: true,
        scanRoot: getRuntimeConfig().scanRoot,
        scanOk: true,
    });
});

/** 从磁盘重新加载 config.json（任务 env、日志上限等立即生效；port/host 需重启） */
app.post('/api/settings/reload', (_req, res) => {
    try {
        const next = reloadRuntimeConfig(ROOT);
        invalidateOrphanDetectCache();
        clearScanCache();
        res.json({
            ok: true,
            message: '已重新加载 config.json',
            port: next.port,
            host: next.host,
        });
    } catch (e) {
        res.status(500).json({ error: (e as Error).message });
    }
});

/** 扫描项目列表；默认不含 orphans，传 includeOrphans=1 与旧版行为一致 */
app.get('/api/projects', async (req, res) => {
    const force = req.query.refresh === '1';
    if (force) invalidateOrphanDetectCache();

    const includeOrphans = req.query.includeOrphans === '1';
    const core = await buildProjectsCore(force);

    let orphans: OrphanService[] = [];
    if (includeOrphans && core.scanCheck.ok) {
        orphans = await resolveCompanyOrphans(core.groups, core.managedPorts);
    }

    res.json({
        groups: core.groups,
        skipped: core.skipped,
        statuses: core.statuses,
        running: core.running,
        urls: core.urls,
        defaults: readDefaults(),
        instances: readInstances(),
        scanError: core.scanError,
        cachedAt: core.cachedAt,
        fromCache: core.fromCache,
        orphans,
        exitCodes: core.exitCodes,
    });
});

/** 历史服务（lsof），按需拉取，减轻 /api/projects 负担 */
app.get('/api/orphans', async (req, res) => {
    const force = req.query.refresh === '1';
    if (force) invalidateOrphanDetectCache();

    const core = await buildProjectsCore(false);
    if (!core.scanCheck.ok) {
        res.json({ orphans: [], scanError: core.scanError });
        return;
    }

    const orphans = await resolveCompanyOrphans(core.groups, core.managedPorts);
    res.json({ orphans, cachedAt: core.cachedAt });
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
    const { cwd, scriptName, packageManager, profile } = req.body as {
        cwd?: string;
        scriptName?: string;
        packageManager?: 'pnpm' | 'npm' | 'yarn';
        profile?: string;
    };

    if (!cwd || !scriptName || !packageManager) {
        res.status(400).json({ error: '缺少参数' });
        return;
    }

    const resolvedCwd = path.resolve(cwd);
    const cwdCheck = assertTaskCwdAllowed(resolvedCwd);
    if (!cwdCheck.ok) {
        res.status(403).json({ error: cwdCheck.error });
        return;
    }

    const id = taskId(resolvedCwd, scriptName);
    const config = getRuntimeConfig();
    const explicitProfile = profile?.trim();
    const profileName = explicitProfile || config.defaultTaskProfile || undefined;
    if (explicitProfile && !config.taskProfiles[explicitProfile]) {
        res.status(400).json({ error: `未知配置档: ${explicitProfile}` });
        return;
    }
    try {
        const effectiveProfile =
            profileName && config.taskProfiles[profileName]
                ? profileName
                : undefined;
        const spawnOpts = resolveSpawnOptions(config, effectiveProfile);
        const result = startTask(
            id,
            resolvedCwd,
            scriptName,
            packageManager,
            spawnOpts,
        );
        res.json({ ok: true, task: result.meta, alreadyRunning: result.alreadyRunning ?? false });
    } catch (e) {
        const msg = (e as Error).message;
        const status = msg.includes('并发上限') ? 429 : 500;
        res.status(status).json({ error: msg });
    }
});

/** 停止指定任务 */
app.post('/api/tasks/stop', async (req, res) => {
    const { cwd, scriptName } = req.body as { cwd?: string; scriptName?: string };
    if (!cwd || !scriptName) {
        res.status(400).json({ error: '缺少参数' });
        return;
    }
    const resolvedCwd = path.resolve(cwd);
    const cwdCheck = assertTaskCwdAllowed(resolvedCwd);
    if (!cwdCheck.ok) {
        res.status(403).json({ error: cwdCheck.error });
        return;
    }
    const ok = await stopTask(taskId(resolvedCwd, scriptName));
    res.json({ ok });
});

/** 停止所有正在运行的任务 */
app.post('/api/tasks/stop-all', async (_req, res) => {
    await stopAll();
    res.json({ ok: true });
});

/** 获取已缓冲的任务日志；?taskId= 仅返回单个任务 */
app.get('/api/tasks/logs', (req, res) => {
    const q = req.query.taskId;
    const one = typeof q === 'string' ? q.trim() : '';
    if (one) {
        res.json({ logs: { [one]: getTaskLogs(one) } });
        return;
    }
    res.json({ logs: getAllTaskLogs() });
});

/** 结束占用端口的外部进程（孤儿服务） */
app.post('/api/orphans/kill', async (req, res) => {
    const { port } = req.body as { port?: number };
    if (!port || port === getRuntimeConfig().port) {
        res.status(400).json({ error: '无效端口' });
        return;
    }
    const ok = await killByPort(port);
    if (ok) invalidateOrphanDetectCache();
    res.json({ ok });
});

/** HTTP 服务，仅监听本机 */
const listenConfig = getRuntimeConfig();
const panelUrl = `http://${listenConfig.host === '0.0.0.0' ? 'localhost' : listenConfig.host}:${listenConfig.port}`;
const server = app.listen(listenConfig.port, listenConfig.host, () => {
    console.log(`\n  Dev Launcher  →  ${panelUrl}`);
    console.log(`  扫描目录      →  ${listenConfig.scanRoot}\n`);
    if (listenConfig.openBrowser) {
        openBrowser(panelUrl);
    }
});

server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n  端口 ${listenConfig.port} 已被占用。请先停止旧实例：`);
        console.error(`  lsof -i :${listenConfig.port}`);
        console.error(`  kill -9 $(lsof -ti :${listenConfig.port})\n`);
        process.exit(1);
    }
    throw err;
});

/** WebSocket 服务，路径 /ws */
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
    clients.add(ws);
    const cfg = getRuntimeConfig();
    if (!cfg.logSubscribeOnly) {
        ws.send(JSON.stringify({ type: 'logs-sync', logs: getAllTaskLogs() }));
    } else {
        ws.send(JSON.stringify({ type: 'logs-sync', logs: {} }));
    }

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(String(raw)) as {
                type?: string;
                taskId?: string;
            };
            if (msg.type !== 'subscribe') return;

            const tid =
                typeof msg.taskId === 'string' && msg.taskId.trim()
                    ? msg.taskId.trim()
                    : undefined;
            wsMeta.set(ws, { subscribedLogTaskId: tid });
            const logs = tid ? { [tid]: getTaskLogs(tid) } : getAllTaskLogs();
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: 'logs-sync', logs }));
            }
        } catch {
            /* 忽略非法消息 */
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        wsMeta.delete(ws);
    });
});
