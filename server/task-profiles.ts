/**
 * 任务启动配置档：合并全局 taskEnv/nodeOptions 与命名 profile
 */

import type { ResolvedConfig } from './config.js';

/** 单个配置档 */
export interface TaskProfile {
    nodeOptions?: string;
    taskEnv?: Record<string, string>;
}

/**
 * 解析 config.json 中的 taskProfiles
 */
export function parseTaskProfiles(raw: unknown): Record<string, TaskProfile> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

    const out: Record<string, TaskProfile> = {};
    for (const [name, value] of Object.entries(raw)) {
        if (!name.trim() || !value || typeof value !== 'object' || Array.isArray(value)) {
            continue;
        }
        const entry = value as { nodeOptions?: string; taskEnv?: unknown };
        const taskEnv =
            entry.taskEnv && typeof entry.taskEnv === 'object' && !Array.isArray(entry.taskEnv)
                ? Object.fromEntries(
                      Object.entries(entry.taskEnv).filter(([, v]) => typeof v === 'string'),
                  )
                : undefined;
        const nodeOptions = entry.nodeOptions?.trim() || undefined;
        if (taskEnv && Object.keys(taskEnv).length === 0 && !nodeOptions) continue;
        out[name] = { taskEnv, nodeOptions };
    }
    return out;
}

/**
 * 合并全局与子进程 profile，得到 spawn 用的 env 选项
 * @param config - 运行时配置
 * @param profileName - 配置档名，空则用全局默认
 */
export function resolveSpawnOptions(
    config: ResolvedConfig,
    profileName?: string,
): { taskEnv: Record<string, string>; nodeOptions?: string } {
    let taskEnv = { ...config.taskEnv };
    let nodeOptions = config.nodeOptions;

    const name = profileName?.trim();
    if (name && config.taskProfiles[name]) {
        const profile = config.taskProfiles[name];
        taskEnv = { ...taskEnv, ...(profile.taskEnv ?? {}) };
        const extra = profile.nodeOptions?.trim();
        if (extra) {
            nodeOptions = nodeOptions ? `${nodeOptions} ${extra}` : extra;
        }
    }

    return { taskEnv, nodeOptions };
}
