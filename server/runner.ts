/**
 * 进程运行模块
 * 负责启动/停止 dev 脚本子进程，采集日志与本地访问地址
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { exec } from 'node:child_process';
import path from 'node:path';
import { buildTaskSpawnEnv } from './config.js';
import { killByPort, portFromUrl } from './orphans.js';
import type { PackageManager } from './scanner.js';

/** 子进程与日志相关运行时选项（由 runtime 在启动/热重载时注入） */
export interface RunnerOptions {
    taskEnv?: Record<string, string>;
    nodeOptions?: string;
    maxTaskLogLines?: number;
    clearTaskLogsOnStop?: boolean;
    maxRetainedTaskStates?: number;
}

/** 进程运行状态 */
export type ProcessStatus = 'running' | 'stopped' | 'crashed';

/** 正在运行或曾运行的任务元信息 */
export interface RunningTask {
    /** 任务唯一 ID */
    taskId: string;
    /** 工作目录 */
    cwd: string;
    /** 脚本名 */
    scriptName: string;
    /** 包管理器 */
    packageManager: PackageManager;
    /** 子进程 PID */
    pid?: number;
    /** 启动时间戳 */
    startedAt: number;
    /** 当前状态 */
    status: ProcessStatus;
    /** 从日志解析出的本地访问地址（可多端口，如 8888 + 5173） */
    urls?: string[];
    /** 退出码（崩溃时） */
    exitCode?: number | null;
}

/** 启动结果 */
export interface StartTaskResult {
    meta: RunningTask;
    /** 任务已在运行，未重复启动 */
    alreadyRunning?: boolean;
}

/** 日志行回调 */
type LogListener = (taskId: string, line: string) => void;
/** 状态变更回调 */
type StatusListener = (
    taskId: string,
    status: ProcessStatus,
    exitCode?: number | null,
) => void;
/** 访问地址解析回调 */
type UrlListener = (taskId: string, urls: string[]) => void;

/** 匹配本地开发服务器 URL 的正则 */
const URL_RE =
    /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/[^\s)\]'">]*)?/gi;

/**
 * 是否为应在面板展示的应用访问地址（排除 Vite 插件调试路径）
 * Vite 可能打印 /__inspect/ 或 /__inspect__/，devtools 同理
 */
function isAppDevUrl(url: string): boolean {
    try {
        const pathname = new URL(url).pathname;
        return !pathname.includes('/__devtools') && !pathname.includes('/__inspect');
    } catch {
        return true;
    }
}

/**
 * 去除终端 ANSI 颜色控制符
 * @param text - 原始文本
 */
function stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

/**
 * 规范化解析出的 URL
 * @param raw - 原始匹配串
 */
function normalizeUrl(raw: string): string | null {
    const cleaned = raw.replace(/[.,;]+$/, '');
    try {
        const u = new URL(cleaned);
        if (u.hostname === '0.0.0.0') u.hostname = 'localhost';
        const normalized = u.origin + (u.pathname === '/' ? '' : u.pathname);
        return isAppDevUrl(normalized) ? normalized : null;
    } catch {
        return isAppDevUrl(cleaned) ? cleaned : null;
    }
}

/**
 * 从日志行中提取所有本地访问 URL（去重）
 * @param line - 单行日志
 */
export function extractUrls(line: string): string[] {
    const clean = stripAnsi(line);
    const matches = clean.match(URL_RE);
    if (!matches?.length) return [];

    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of matches) {
        const u = normalizeUrl(raw);
        if (u && !seen.has(u)) {
            seen.add(u);
            out.push(u);
        }
    }
    return out;
}

/** @deprecated 使用 extractUrls */
export function extractUrl(line: string): string | null {
    const all = extractUrls(line);
    return all.length ? all[all.length - 1] : null;
}

/**
 * Vite 517x 优先，其余按端口升序
 */
function sortTaskUrls(urls: string[]): string[] {
    return [...urls].sort((a, b) => {
        const pa = portFromUrl(a) ?? 0;
        const pb = portFromUrl(b) ?? 0;
        const aVite = pa >= 5173 && pa <= 5199;
        const bVite = pb >= 5173 && pb <= 5199;
        if (aVite && !bVite) return -1;
        if (!aVite && bVite) return 1;
        return pa - pb;
    });
}

/**
 * 合并新 URL 到任务列表
 */
function mergeTaskUrls(existing: string[] | undefined, incoming: string[]): string[] {
    const set = new Set((existing ?? []).filter(isAppDevUrl));
    for (const u of incoming) {
        if (isAppDevUrl(u)) set.add(u);
    }
    return sortTaskUrls([...set]);
}

/**
 * 追加 URL 并通知前端
 */
function appendTaskUrls(meta: RunningTask, taskId: string, incoming: string[]): void {
    if (!incoming.length) return;
    const merged = mergeTaskUrls(meta.urls, incoming);
    if (merged.length === (meta.urls?.length ?? 0) && merged.every((u, i) => u === meta.urls?.[i])) {
        return;
    }
    meta.urls = merged;
    onUrl(taskId, merged);
}

/** 运行中的子进程映射：taskId -> { proc, meta } */
const processes = new Map<string, { proc: ChildProcess; meta: RunningTask }>();

/** 用户主动停止中的任务（exit 时不应记为 crashed） */
const stoppingTasks = new Set<string>();

/** 进程结束后的最近状态（用于 crashed 展示，下次启动前保留） */
const lastKnownState = new Map<
    string,
    { status: ProcessStatus; exitCode?: number | null }
>();

/** 每个任务保留的日志行数上限（可通过 configureRunner 覆盖） */
let maxTaskLogLines = 500;

/** 停止任务后是否清空日志缓冲 */
let clearTaskLogsOnStop = false;

/** 注入 dev 子进程的环境与 NODE_OPTIONS */
let runnerTaskEnv: Record<string, string> = {};
let runnerNodeOptions: string | undefined;

/** 已结束 stopped 状态在内存中保留条数上限 */
let maxRetainedTaskStates = 200;

/**
 * 应用启动器配置中的任务/日志选项
 * @param opts - 来自 ResolvedConfig
 */
export function configureRunner(opts: RunnerOptions): void {
    if (opts.maxTaskLogLines != null && opts.maxTaskLogLines > 0) {
        maxTaskLogLines = Math.floor(opts.maxTaskLogLines);
    }
    if (opts.clearTaskLogsOnStop != null) {
        clearTaskLogsOnStop = opts.clearTaskLogsOnStop;
    }
    if (opts.maxRetainedTaskStates != null && opts.maxRetainedTaskStates > 0) {
        maxRetainedTaskStates = Math.floor(opts.maxRetainedTaskStates);
    }
    runnerTaskEnv = opts.taskEnv ?? {};
    runnerNodeOptions = opts.nodeOptions;
}

/**
 * 清理 stopped 任务的状态与日志，避免会话内 Map 无限增长
 */
export function pruneRunnerState(): void {
    const running = new Set(processes.keys());

    for (const id of [...taskLogs.keys()]) {
        if (running.has(id)) continue;
        const status = processes.has(id)
            ? 'running'
            : (lastKnownState.get(id)?.status ?? 'stopped');
        if (status === 'stopped') {
            taskLogs.delete(id);
        }
    }

    const stoppedIds: string[] = [];
    for (const [id, state] of lastKnownState) {
        if (state.status === 'stopped' && !running.has(id)) {
            stoppedIds.push(id);
        }
    }

    const overflow = lastKnownState.size - maxRetainedTaskStates;
    if (overflow > 0) {
        const removeCount = Math.min(stoppedIds.length, overflow);
        for (let i = 0; i < removeCount; i++) {
            lastKnownState.delete(stoppedIds[i]);
        }
    }
}

/** 任务日志缓冲（刷新页面后可恢复） */
const taskLogs = new Map<string, string[]>();

/** 日志监听器 */
let onLog: LogListener = () => {};

/**
 * 写入任务日志并广播
 * @param taskId - 任务 ID
 * @param line - 日志行
 */
function recordLog(taskId: string, line: string): void {
    let buf = taskLogs.get(taskId);
    if (!buf) {
        buf = [];
        taskLogs.set(taskId, buf);
    }
    buf.push(line);
    if (buf.length > maxTaskLogLines) {
        buf.splice(0, buf.length - maxTaskLogLines);
    }
    onLog(taskId, line);
}

/**
 * 清空任务日志
 * @param taskId - 任务 ID
 */
export function clearTaskLogs(taskId: string): void {
    taskLogs.delete(taskId);
}

/**
 * 获取单个任务日志副本
 * @param taskId - 任务 ID
 */
export function getTaskLogs(taskId: string): string[] {
    return [...(taskLogs.get(taskId) ?? [])];
}

/**
 * 获取全部任务日志（供刷新后恢复）
 */
export function getAllTaskLogs(): Record<string, string[]> {
    pruneRunnerState();
    const out: Record<string, string[]> = {};
    for (const [id, lines] of taskLogs) {
        if (!lines.length) continue;
        const status = processes.has(id) ? 'running' : (lastKnownState.get(id)?.status ?? 'stopped');
        if (status === 'running' || status === 'crashed') {
            out[id] = [...lines];
        }
    }
    return out;
}
/** 状态监听器 */
let onStatus: StatusListener = () => {};
/** URL 监听器 */
let onUrl: UrlListener = () => {};

/**
 * 注册进程事件监听器（由 HTTP 层转发到 WebSocket）
 * @param listeners - 日志、状态、URL 回调
 */
export function setRunnerListeners(listeners: {
    onLog?: LogListener;
    onStatus?: StatusListener;
    onUrl?: UrlListener;
}): void {
    if (listeners.onLog) onLog = listeners.onLog;
    if (listeners.onStatus) onStatus = listeners.onStatus;
    if (listeners.onUrl) onUrl = listeners.onUrl;
}

/**
 * 根据包管理器构建启动命令
 * @param pm - 包管理器
 * @param scriptName - 脚本名
 */
function buildArgs(pm: PackageManager, scriptName: string): { cmd: string; args: string[] } {
    switch (pm) {
        case 'pnpm':
            return { cmd: 'pnpm', args: ['run', scriptName] };
        case 'yarn':
            return { cmd: 'yarn', args: [scriptName] };
        default:
            return { cmd: 'npm', args: ['run', scriptName] };
    }
}

/**
 * 获取已存在的运行中任务
 * @param taskId - 任务 ID
 */
export function getRunningTask(taskId: string): RunningTask | undefined {
    return processes.get(taskId)?.meta;
}

/**
 * 启动一个 dev/serve 任务；若已在运行则返回现有任务
 * @param taskId - 任务 ID
 * @param cwd - 工作目录
 * @param scriptName - 脚本名
 * @param packageManager - 包管理器
 */
export function startTask(
    taskId: string,
    cwd: string,
    scriptName: string,
    packageManager: PackageManager,
): StartTaskResult {
    const existing = processes.get(taskId);
    if (existing) {
        return { meta: existing.meta, alreadyRunning: true };
    }

    lastKnownState.delete(taskId);
    clearTaskLogs(taskId);

    const resolvedCwd = path.resolve(cwd);
    const { cmd, args } = buildArgs(packageManager, scriptName);
    // macOS/Linux 使用 detached 让子进程成为独立进程组，便于 kill -PID 整树终止；勿 unref，否则无法可靠 stop
    const proc = spawn(cmd, args, {
        cwd: resolvedCwd,
        detached: process.platform !== 'win32',
        env: buildTaskSpawnEnv(process.env, {
            taskEnv: runnerTaskEnv,
            nodeOptions: runnerNodeOptions,
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    const meta: RunningTask = {
        taskId,
        cwd: resolvedCwd,
        scriptName,
        packageManager,
        pid: proc.pid,
        startedAt: Date.now(),
        status: 'running',
    };

    processes.set(taskId, { proc, meta });

    /** 将 stdout/stderr 按行推送，并尝试解析 URL */
    const pushLog = (chunk: Buffer | string) => {
        const text = chunk.toString();
        for (const line of text.split(/\r?\n/)) {
            const visible = stripAnsi(line).trim();
            if (!visible) continue;
            recordLog(taskId, visible);
            const found = extractUrls(line);
            if (found.length) appendTaskUrls(meta, taskId, found);
        }
    };

    proc.stdout?.on('data', pushLog);
    proc.stderr?.on('data', pushLog);

    proc.on('exit', (code, signal) => {
        processes.delete(taskId);
        const intentionalStop = stoppingTasks.delete(taskId);
        const crashed = !intentionalStop && code !== 0 && code !== null;
        meta.status = crashed ? 'crashed' : 'stopped';
        meta.exitCode = crashed ? code : null;
        meta.urls = undefined;
        lastKnownState.set(taskId, {
            status: meta.status,
            exitCode: crashed ? code : undefined,
        });
        onStatus(taskId, meta.status, crashed ? code : undefined);
        if (crashed) {
            const hint = signal ? `信号 ${signal}` : `退出码 ${code}`;
            recordLog(taskId, `[dev-launcher] 进程已异常退出 (${hint})`);
        }
    });

    onStatus(taskId, 'running');
    recordLog(taskId, `[dev-launcher] 已启动: ${cmd} ${args.join(' ')} (cwd: ${cwd})`);

    return { meta };
}

/**
 * 终止进程及其子进程（npm/vite 等）
 * @param pid - 根进程 PID（detached 启动时为进程组组长）
 */
function killProcessTree(pid: number): Promise<void> {
    if (!pid || pid <= 0) return Promise.resolve();

    if (process.platform === 'win32') {
        return new Promise((resolve) => {
            exec(`taskkill /PID ${pid} /T /F`, () => resolve());
        });
    }

    const term = [
        `kill -TERM -${pid} 2>/dev/null`,
        `pkill -TERM -P ${pid} 2>/dev/null`,
        `kill -TERM ${pid} 2>/dev/null`,
    ].join('; ');

    const kill = [
        `kill -KILL -${pid} 2>/dev/null`,
        `pkill -KILL -P ${pid} 2>/dev/null`,
        `kill -KILL ${pid} 2>/dev/null`,
    ].join('; ');

    return new Promise((resolve) => {
        exec(`${term}; true`, () => {
            setTimeout(() => {
                exec(`${kill}; true`, () => resolve());
            }, 450);
        });
    });
}

/**
 * 停止指定任务（进程组 + 已知端口兜底，避免 vite 孤儿占用 3100 等）
 * @param taskId - 任务 ID
 */
export async function stopTask(taskId: string): Promise<boolean> {
    const entry = processes.get(taskId);
    if (!entry) return false;

    // 必须在 kill 之前标记，否则 exit(1) 会与「主动停止」竞态并误报 crashed
    stoppingTasks.add(taskId);

    const { proc, meta } = entry;
    const pid = proc.pid;
    const ports = new Set<number>();
    for (const u of meta.urls ?? []) {
        const p = portFromUrl(u);
        if (p) ports.add(p);
    }

    meta.urls = undefined;
    meta.status = 'stopped';
    processes.delete(taskId);

    try {
        proc.kill('SIGTERM');
    } catch {
        /* killProcessTree / killByPort 兜底 */
    }

    if (pid) await killProcessTree(pid);
    for (const port of ports) {
        const killed = await killByPort(port);
        if (killed) {
            recordLog(taskId, `[dev-launcher] 已释放端口 ${port}`);
        }
    }

    lastKnownState.set(taskId, { status: 'stopped' });
    onStatus(taskId, 'stopped');
    recordLog(taskId, '[dev-launcher] 已停止');
    if (clearTaskLogsOnStop) {
        clearTaskLogs(taskId);
    }
    pruneRunnerState();
    return true;
}

/**
 * 获取所有正在运行的任务列表
 */
export function getRunningTasks(): RunningTask[] {
    return [...processes.values()].map((e) => e.meta);
}

/**
 * 查询单个任务状态
 * @param taskId - 任务 ID
 */
export function getTaskStatus(taskId: string): ProcessStatus {
    if (processes.has(taskId)) return 'running';
    return lastKnownState.get(taskId)?.status ?? 'stopped';
}

/**
 * 获取任务退出码（仅 crashed/stopped 后有值）
 * @param taskId - 任务 ID
 */
export function getTaskExitCode(taskId: string): number | null | undefined {
    return lastKnownState.get(taskId)?.exitCode;
}

/**
 * 批量查询任务状态
 * @param taskIds - 任务 ID 列表
 */
export function getAllStatuses(taskIds: string[]): Record<string, ProcessStatus> {
    const result: Record<string, ProcessStatus> = {};
    for (const id of taskIds) {
        result[id] = getTaskStatus(id);
    }
    return result;
}

/**
 * 收集 Launcher 管理中的监听端口
 */
export function getManagedPorts(): Set<number> {
    const ports = new Set<number>();
    for (const { meta } of processes.values()) {
        for (const u of meta.urls ?? []) {
            const p = portFromUrl(u);
            if (p) ports.add(p);
        }
    }
    return ports;
}

/**
 * 停止所有正在运行的任务
 */
export async function stopAll(): Promise<void> {
    for (const id of [...processes.keys()]) {
        await stopTask(id);
    }
    pruneRunnerState();
}
