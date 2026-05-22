/**
 * 启动配置档（顶栏选择，localStorage 持久化）
 */

import { escapeHtml } from './utils.js';

const STORAGE_KEY = 'dl-task-profile';

/** @type {string[]} */
export let taskProfileNames = [];

/** @type {string} */
export let defaultTaskProfile = '';

/** @type {boolean} */
export let logSubscribeOnly = false;

/**
 * 从 /api/config 初始化
 * @param {object} cfg
 */
export function initTaskProfiles(cfg) {
    taskProfileNames = Array.isArray(cfg?.taskProfileNames)
        ? cfg.taskProfileNames.filter((n) => typeof n === 'string' && n.trim())
        : [];
    defaultTaskProfile =
        typeof cfg?.defaultTaskProfile === 'string' ? cfg.defaultTaskProfile.trim() : '';
    logSubscribeOnly = cfg?.logSubscribeOnly === true;
    renderTaskProfileSelect();
}

/**
 * 当前选中的配置档名（空字符串表示全局默认）
 */
export function getSelectedTaskProfile() {
    const el = document.getElementById('task-profile-select');
    if (!(el instanceof HTMLSelectElement)) return '';
    return el.value.trim();
}

/**
 * 渲染顶栏配置档下拉
 */
export function renderTaskProfileSelect() {
    const wrap = document.getElementById('task-profile-wrap');
    const select = document.getElementById('task-profile-select');
    if (!wrap || !select) return;

    if (!taskProfileNames.length) {
        wrap.hidden = true;
        return;
    }

    wrap.hidden = false;
    const saved = localStorage.getItem(STORAGE_KEY) || '';
    const options = [
        `<option value="">默认（全局）</option>`,
        ...taskProfileNames.map((n) => {
            const selected =
                n === saved || (!saved && n === defaultTaskProfile) ? ' selected' : '';
            return `<option value="${escapeHtml(n)}"${selected}>${escapeHtml(n)}</option>`;
        }),
    ];
    select.innerHTML = options.join('');
    if (!select.dataset.bound) {
        select.dataset.bound = '1';
        select.addEventListener('change', () => {
            localStorage.setItem(STORAGE_KEY, select.value);
        });
    }
}
