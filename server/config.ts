/**
 * 配置加载：config.json + 环境变量覆盖
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
    /** 可选：指定无线网 IPv4，不填则自动检测 Wi-Fi 网卡 */
    wifiIp?: string;
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
        wifiIp?: string;
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
        wifiIp: raw.wifiIp?.trim() || undefined,
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
 * macOS：通过 networksetup 解析 Wi-Fi 对应网卡名（多为 en0）
 */
function getDarwinWifiInterface(): string | null {
    if (process.platform !== 'darwin') return null;
    try {
        const out = execSync('networksetup -listallhardwareports', {
            encoding: 'utf8',
            timeout: 3000,
        });
        const lines = out.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (!/Hardware Port:\s*Wi-Fi/i.test(lines[i])) continue;
            for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                const m = lines[j].match(/Device:\s*(\S+)/);
                if (m) return m[1];
            }
        }
    } catch {
        /* ignore */
    }
    return null;
}

/**
 * 从指定网卡名读取非 internal 的 IPv4
 */
function pickIPv4FromInterface(
    ifaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>,
    name: string,
): string[] {
    const entries = ifaces[name];
    if (!entries?.length) return [];
    const addrs: string[] = [];
    for (const iface of entries) {
        const family = iface.family as string | number;
        if (family !== 'IPv4' && family !== 4) continue;
        if (iface.internal || !iface.address) continue;
        addrs.push(iface.address);
    }
    return addrs;
}

/**
 * 用于访问地址展示：仅无线网 IPv4（localhost 由前端单独渲染）
 * 优先级：DEV_LAUNCHER_WIFI_IP > config.wifiIp > 自动检测 Wi-Fi 网卡
 */
export function getWifiIPv4Addresses(explicitIp?: string): string[] {
    const fromEnv = process.env.DEV_LAUNCHER_WIFI_IP?.trim();
    if (fromEnv) return [fromEnv];
    if (explicitIp?.trim()) return [explicitIp.trim()];

    const ifaces = os.networkInterfaces();
    if (!ifaces) return [];

    if (process.platform === 'darwin') {
        const wifiDev = getDarwinWifiInterface();
        if (wifiDev) {
            const ips = pickIPv4FromInterface(ifaces, wifiDev);
            if (ips.length) return [...new Set(ips)];
        }
        const en0 = pickIPv4FromInterface(ifaces, 'en0');
        if (en0.length) return [...new Set(en0)];
    }

    for (const name of Object.keys(ifaces)) {
        if (/^wlan\d+|^wlp\d+s\d+$/i.test(name)) {
            const ips = pickIPv4FromInterface(ifaces, name);
            if (ips.length) return [...new Set(ips)];
        }
    }

    return [];
}

/** @deprecated 使用 getWifiIPv4Addresses */
export const getLocalIPv4Addresses = getWifiIPv4Addresses;

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
