/**
 * 配置加载：config.json + 环境变量覆盖
 */

import fs from 'node:fs';
import path from 'node:path';
import type { LauncherConfig } from './scanner.js';
import { readSettings } from './settings.js';

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
 * 内置默认扫描目录：启动 dev-launcher 时的当前工作目录
 */
export function getDefaultScanRoot(): string {
    return path.resolve(process.cwd());
}

/**
 * 从项目根目录加载 config.json
 * 扫描路径优先级：环境变量 > launcher-settings.json > config.json > 当前工作目录
 * @param root - dev-launcher 根目录
 */
export function loadConfig(root: string): ResolvedConfig {
    const configPath = path.join(root, 'config.json');
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as LauncherConfig & {
        host?: string;
        openBrowser?: boolean;
        scanCacheSeconds?: number;
    };

    const settings = readSettings();
    const fromConfig = raw.scanRoot?.trim();
    const scanRoot = path.resolve(
        process.env.DEV_LAUNCHER_SCAN_ROOT?.trim() ||
            settings.scanRoot?.trim() ||
            fromConfig ||
            getDefaultScanRoot(),
    );
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
 * 运行时更新扫描目录（不写入配置文件）
 * @param config - 运行时配置
 * @param scanRoot - 新路径
 */
export function applyScanRoot(config: ResolvedConfig, scanRoot: string): void {
    config.scanRoot = path.resolve(scanRoot);
}

/**
 * 读取当前生效的扫描目录（每次从文件重读，避免刷新页面后丢失）
 * @param config - 启动时加载的配置
 */
export function resolveEffectiveScanRoot(config: ResolvedConfig): string {
    const fromEnv = process.env.DEV_LAUNCHER_SCAN_ROOT?.trim();
    if (fromEnv) return path.resolve(fromEnv);

    const settings = readSettings();
    if (settings.scanRoot?.trim()) return path.resolve(settings.scanRoot.trim());

    if (config.scanRoot?.trim()) return path.resolve(config.scanRoot);

    return getDefaultScanRoot();
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
 * 判断任务工作目录是否在扫描根目录之下（含根目录本身）
 * @param cwd - 任务 cwd（绝对或相对路径）
 * @param scanRoot - 当前生效的扫描根目录
 */
export function isCwdUnderScanRoot(cwd: string, scanRoot: string): boolean {
    const root = path.resolve(scanRoot);
    const dir = path.resolve(cwd);
    if (dir === root) return true;
    return dir.startsWith(root + path.sep);
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
