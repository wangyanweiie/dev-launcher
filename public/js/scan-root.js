/**
 * 扫描目录配置：保存默认 / 扫描 分离
 */

import { $ } from './dom.js';
import { loadProjects } from './api.js';
import { setLocalHosts } from './urls.js';

/** @type {string} */
let defaultScanRoot = '';

/** @type {boolean} */
let scanRootLockedByEnv = false;

function getScanInput() {
    return document.getElementById('scan-root-input');
}

function getScanHint() {
    return document.getElementById('scan-root-hint');
}

/**
 * 读取输入框中的扫描路径
 */
function getInputScanRoot() {
    return getScanInput()?.value.trim() ?? '';
}

/**
 * 更新扫描路径提示
 * @param {string} [message]
 * @param {boolean} [isError]
 */
export function setScanRootHint(message, isError = false) {
    const el = getScanHint();
    if (!el) return;
    if (!message) {
        el.hidden = true;
        el.textContent = '';
        el.classList.remove('subtitle-warn');
        return;
    }
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle('subtitle-warn', isError);
}

/**
 * 从 /api/config 初始化扫描目录栏
 * @param {object} cfg
 */
export function initScanRootBar(cfg) {
    defaultScanRoot = cfg.defaultScanRoot || '';
    scanRootLockedByEnv = !!cfg.scanRootFromEnv;
    setLocalHosts(cfg.localHosts);

    const input = getScanInput();
    if (!input) return;

    input.value = cfg.scanRoot || '';
    input.placeholder = defaultScanRoot || '扫描根目录';
    input.disabled = scanRootLockedByEnv;

    if (scanRootLockedByEnv) {
        setScanRootHint('扫描目录由环境变量 DEV_LAUNCHER_SCAN_ROOT 固定，无法在界面修改');
    } else if (cfg.scanOk === false) {
        setScanRootHint(cfg.scanError || '扫描目录不可用', true);
    } else {
        setScanRootHint('');
    }
}

/**
 * 保存为默认扫描目录（写入 config.json，不扫描）
 */
export async function saveScanRootDefault() {
    if (scanRootLockedByEnv) {
        setScanRootHint('扫描目录由环境变量固定，无法保存', true);
        return;
    }

    const input = getScanInput();
    if (!input) return;

    const scanRoot = getInputScanRoot();
    if (!scanRoot) {
        setScanRootHint('请填写扫描目录', true);
        return;
    }

    const btn = document.getElementById('btn-save-scan-root');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch('/api/settings/scan-root/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scanRoot }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            setScanRootHint(data.error || '保存失败', true);
            return;
        }

        input.value = data.scanRoot || scanRoot;
        setScanRootHint(data.message || '已保存到 config.json');
    } catch (e) {
        setScanRootHint(`保存失败: ${e?.message || e}`, true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

/**
 * 按当前输入路径扫描项目
 */
export async function runScan() {
    if (scanRootLockedByEnv) {
        setScanRootHint('扫描目录由环境变量固定', true);
        return;
    }

    const input = getScanInput();
    if (!input) {
        setScanRootHint('页面未加载完成，请刷新重试', true);
        return;
    }

    const scanRoot = getInputScanRoot();
    if (!scanRoot) {
        setScanRootHint('请填写扫描目录', true);
        return;
    }

    const btn = document.getElementById('btn-scan-root');
    if (btn) btn.disabled = true;
    setScanRootHint('正在扫描…');

    try {
        const res = await fetch('/api/settings/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scanRoot }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            setScanRootHint(data.error || `扫描失败 (${res.status})`, true);
            return;
        }

        input.value = data.scanRoot || scanRoot;
        setScanRootHint('');
        await loadProjects(true);
    } catch (e) {
        setScanRootHint(`扫描失败: ${e?.message || e}`, true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

/**
 * 填入「当前目录」
 */
export function useDefaultScanRoot() {
    if (scanRootLockedByEnv || !defaultScanRoot) return;
    const input = getScanInput();
    if (!input) return;
    input.value = defaultScanRoot;
    setScanRootHint('');
}

/**
 * 绑定扫描目录栏（事件委托，只绑定一次）
 */
export function bindScanRootBar() {
    const bar = document.getElementById('scan-root-bar');
    if (!bar || bar.dataset.bound) return;
    bar.dataset.bound = '1';

    bar.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        if (btn.id === 'btn-scan-root') {
            e.preventDefault();
            runScan();
            return;
        }
        if (btn.id === 'btn-save-scan-root') {
            e.preventDefault();
            saveScanRootDefault();
            return;
        }
        if (btn.id === 'btn-use-cwd') {
            e.preventDefault();
            useDefaultScanRoot();
        }
    });

    getScanInput()?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            runScan();
        }
    });
}
