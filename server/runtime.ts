/**
 * 运行时配置：支持热重载并同步到 runner
 */

import { loadConfig, type ResolvedConfig } from './config.js';
import { configureRunner } from './runner.js';

let runtimeConfig: ResolvedConfig | null = null;

/**
 * 将 ResolvedConfig 中的任务/日志选项应用到 runner
 */
export function applyRunnerFromConfig(config: ResolvedConfig): void {
    configureRunner({
        taskEnv: config.taskEnv,
        nodeOptions: config.nodeOptions,
        maxTaskLogLines: config.maxTaskLogLines,
        clearTaskLogsOnStop: config.clearTaskLogsOnStop,
        maxRetainedTaskStates: config.maxRetainedTaskStates,
        maxRunningTasks: config.maxRunningTasks,
        idleAutoStopMs: config.idleAutoStopMinutes * 60 * 1000,
        forceColor: config.forceColor,
    });
}

/**
 * 启动时加载 config.json
 * @param root - dev-launcher 根目录
 */
export function initRuntime(root: string): ResolvedConfig {
    runtimeConfig = loadConfig(root);
    applyRunnerFromConfig(runtimeConfig);
    return runtimeConfig;
}

/**
 * 获取当前运行时配置
 */
export function getRuntimeConfig(): ResolvedConfig {
    if (!runtimeConfig) {
        throw new Error('Runtime 未初始化，请先调用 initRuntime');
    }
    return runtimeConfig;
}

/**
 * 从磁盘重新加载 config.json 并更新 runner（不重启进程）
 * @param root - dev-launcher 根目录
 */
export function reloadRuntimeConfig(root: string): ResolvedConfig {
    runtimeConfig = loadConfig(root);
    applyRunnerFromConfig(runtimeConfig);
    return runtimeConfig;
}
