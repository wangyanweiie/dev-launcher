/**
 * 用户设置持久化：launcher-settings.json + config.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 用户设置 */
export interface LauncherSettings {
    /** 默认扫描根目录 */
    scanRoot?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** dev-launcher 项目根目录 */
const PROJECT_ROOT = path.join(__dirname, '..');
const SETTINGS_FILE = path.join(PROJECT_ROOT, 'launcher-settings.json');
const CONFIG_FILE = path.join(PROJECT_ROOT, 'config.json');

/**
 * 读取用户设置
 */
export function readSettings(): LauncherSettings {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) return {};
        const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) as LauncherSettings;
        return raw && typeof raw === 'object' ? raw : {};
    } catch {
        return {};
    }
}

/**
 * 保存扫描目录到项目文件（launcher-settings.json 与 config.json）
 * @param scanRoot - 绝对或相对路径
 */
export function persistScanRoot(scanRoot: string): LauncherSettings {
    const resolved = path.resolve(scanRoot);
    const settings: LauncherSettings = { scanRoot: resolved };

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 4) + '\n', 'utf8');

    try {
        const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as Record<string, unknown>;
        raw.scanRoot = resolved;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(raw, null, 4) + '\n', 'utf8');
    } catch (e) {
        throw new Error(`写入 config.json 失败: ${(e as Error).message}`);
    }

    return settings;
}
