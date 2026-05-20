/**
 * 项目扫描结果缓存，避免频繁全量扫描
 */

import type { ProjectGroup } from './scanner.js';
import { scanProjects } from './scanner.js';
import type { ResolvedConfig } from './config.js';

interface ScanCacheEntry {
    groups: ProjectGroup[];
    cachedAt: number;
}

let cache: ScanCacheEntry | null = null;

/**
 * 获取扫描结果（带 TTL 缓存）
 * @param config - 启动器配置
 * @param force - 是否强制重新扫描
 */
export function getCachedProjects(
    config: ResolvedConfig,
    force = false,
): { groups: ProjectGroup[]; cachedAt: number; fromCache: boolean } {
    const ttl = config.scanCacheMs;
    const now = Date.now();

    if (!force && cache && now - cache.cachedAt < ttl) {
        return { groups: cache.groups, cachedAt: cache.cachedAt, fromCache: true };
    }

    const groups = scanProjects(config);
    cache = { groups, cachedAt: now };
    return { groups, cachedAt: now, fromCache: false };
}

/** 清空缓存（配置变更时可调用） */
export function clearScanCache(): void {
    cache = null;
}
