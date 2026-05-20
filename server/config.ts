/**
 * 配置加载：config.json + 环境变量覆盖
 */

import fs from 'node:fs';
import path from 'node:path';
import type { LauncherConfig } from './scanner.js';

/** 解析后的运行时配置 */
export interface ResolvedConfig extends LauncherConfig {
    /** 监听地址，默认仅本机 */
    host: string;
    /** 启动后是否自动打开浏览器 */
    openBrowser: boolean;
    /** 扫描结果缓存 TTL（毫秒） */
    scanCacheMs: number;
}

/**
 * 从项目根目录加载 config.json
 * @param root - dev-launcher 根目录
 */
export function loadConfig(root: string): ResolvedConfig {
    const configPath = path.join(root, 'config.json');
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as LauncherConfig & {
        host?: string;
        openBrowser?: boolean;
        scanCacheSeconds?: number;
    };

    const scanRoot =
        process.env.DEV_LAUNCHER_SCAN_ROOT?.trim() || raw.scanRoot;
    const port = process.env.DEV_LAUNCHER_PORT
        ? Number(process.env.DEV_LAUNCHER_PORT)
        : raw.port;

    return {
        ...raw,
        scanRoot,
        port: Number.isFinite(port) ? port : raw.port,
        host: raw.host ?? '127.0.0.1',
        openBrowser: raw.openBrowser !== false,
        scanCacheMs: (raw.scanCacheSeconds ?? 30) * 1000,
    };
}

/**
 * 校验扫描根目录是否可用
 * @param scanRoot - 扫描路径
 */
export function validateScanRoot(scanRoot: string): { ok: true } | { ok: false; error: string } {
    if (!scanRoot) {
        return { ok: false, error: '未配置扫描目录（scanRoot）' };
    }
    if (!fs.existsSync(scanRoot)) {
        return { ok: false, error: `扫描目录不存在: ${scanRoot}` };
    }
    try {
        if (!fs.statSync(scanRoot).isDirectory()) {
            return { ok: false, error: `扫描路径不是目录: ${scanRoot}` };
        }
    } catch (e) {
        return { ok: false, error: `无法访问扫描目录: ${(e as Error).message}` };
    }
    return { ok: true };
}

/**
 * 启动后打开默认浏览器
 * @param url - 面板地址
 */
export function openBrowser(url: string): void {
    const platform = process.platform;
    const cmd =
        platform === 'darwin'
            ? `open "${url}"`
            : platform === 'win32'
              ? `start "" "${url}"`
              : `xdg-open "${url}"`;
    import('node:child_process').then(({ exec }) => exec(cmd, () => {}));
}
