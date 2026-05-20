/**
 * 下拉选择与选中项读取
 */

import { renderScriptSelectOptions } from './render.js';
import { statuses } from './state.js';
import { normalizeCwd } from './utils.js';

/** @typedef {import('./types.js').SubProjectItem} SubProjectItem */
/** @typedef {import('./types.js').SelectedTask} SelectedTask */

/**
 * 从 option 元素构建 SelectedTask
 * @param {HTMLOptionElement} opt
 * @param {HTMLElement} row
 */
function taskFromOption(opt, row) {
    const subSelect = row.querySelector('.subproject-select');
    const subLabel = subSelect?.options[subSelect.selectedIndex]?.textContent ?? '';
    return {
        cwd: opt.dataset.cwd,
        script: opt.dataset.script,
        pm: opt.dataset.pm,
        taskId: opt.dataset.taskId,
        label:
            opt.dataset.label ||
            (subLabel ? `${subLabel} · ${opt.textContent}` : opt.textContent),
    };
}

/**
 * 若本行有运行中脚本，将下拉同步到该脚本
 * @param {HTMLElement} row
 * @param {SubProjectItem[]} [subProjects]
 */
export function syncRowToRunningTask(row, subProjects) {
    const scriptSelect = row.querySelector('.script-select');
    if (!scriptSelect) return null;

    for (const opt of scriptSelect.options) {
        const st = statuses[opt.dataset.taskId];
        if (st !== 'running' && st !== 'crashed') continue;

        const subSelect = row.querySelector('.subproject-select');
        if (subSelect && subProjects?.length) {
            const cwd = normalizeCwd(opt.dataset.cwd);
            const item = subProjects.find(
                (p) => normalizeCwd(p.sub.cwd) === cwd || normalizeCwd(p.key) === cwd,
            );
            if (item) {
                subSelect.value = item.key;
                fillScriptSelect(row, subProjects, item.key);
                const refreshed = row.querySelector('.script-select');
                if (refreshed) {
                    for (const o of refreshed.options) {
                        if (o.dataset.taskId === opt.dataset.taskId) {
                            refreshed.value = o.value;
                            return taskFromOption(o, row);
                        }
                    }
                }
            }
        }
        scriptSelect.value = opt.value;
        return taskFromOption(opt, row);
    }
    return null;
}

/**
 * 本行应展示的任务：优先运行中的脚本，否则当前选中
 * @param {HTMLElement | null} row
 * @returns {SelectedTask | null}
 */
export function getRowActiveTask(row) {
    if (!row) return null;

    const scriptSelect = row.querySelector('.script-select');
    if (!scriptSelect) return null;

    for (const opt of scriptSelect.options) {
        const st = statuses[opt.dataset.taskId];
        if (st === 'running' || st === 'crashed') {
            return taskFromOption(opt, row);
        }
    }
    return getSelectedOption(row);
}

/**
 * 读取实例行当前选中
 * @param {HTMLElement | null} row
 * @returns {SelectedTask | null}
 */
export function getSelectedOption(row) {
    if (!row) return null;

    const scriptSelect = row.querySelector('.script-select');
    if (!scriptSelect || scriptSelect.selectedIndex < 0) return null;

    const opt = scriptSelect.options[scriptSelect.selectedIndex];
    return taskFromOption(opt, row);
}

/**
 * 切换子项目后刷新脚本下拉
 * @param {HTMLElement} row
 * @param {SubProjectItem[]} subProjects
 * @param {string} [subKey]
 */
export function fillScriptSelect(row, subProjects, subKey) {
    const scriptSelect = row.querySelector('.script-select');
    const subSelect = row.querySelector('.subproject-select');
    if (!scriptSelect) return null;

    const key = subKey ?? subSelect?.value ?? subProjects[0]?.key;
    const item = subProjects.find((p) => p.key === key) ?? subProjects[0];
    if (!item) return null;

    scriptSelect.innerHTML = renderScriptSelectOptions(item.sub, item.label);
    return getSelectedOption(row);
}

/**
 * 实例行是否包含指定任务
 * @param {HTMLElement} row
 * @param {string} taskId
 */
export function rowHasTask(row, taskId) {
    return !!row.querySelector(`.script-select option[data-task-id="${CSS.escape(taskId)}"]`);
}
