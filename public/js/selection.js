/**
 * 下拉选择与选中项读取
 */

import { renderScriptSelectOptions } from './render.js';
import { getSubProjectsFromCard, mapRawSubProjects } from './project.js';
import { statuses } from './state.js';
import { makeTaskId, normalizeCwd } from './utils.js';
import { isCwdOrphanRunning } from './orphan-sync.js';

/** @typedef {import('./types.js').SubProjectItem} SubProjectItem */
/** @typedef {import('./types.js').SelectedTask} SelectedTask */

/**
 * 从 option 元素构建 SelectedTask
 * @param {HTMLOptionElement} opt
 * @param {HTMLElement} row
 */
/**
 * 在分组全部子项目中查找运行中/崩溃任务（不依赖当前下拉可见 option）
 * @param {SubProjectItem[]} subProjects
 * @returns {SelectedTask | null}
 */
export function findRunningTaskInSubProjects(subProjects) {
    for (const item of subProjects) {
        for (const s of item.sub.scripts) {
            const tid = makeTaskId(item.sub.cwd, s.name);
            const st = statuses[tid];
            if (st === 'running' || st === 'crashed') {
                const label = item.label ? `${item.label} · ${s.name}` : s.name;
                return {
                    cwd: item.sub.cwd,
                    script: s.name,
                    pm: item.sub.packageManager,
                    taskId: tid,
                    label,
                };
            }
        }
        if (isCwdOrphanRunning(item.sub.cwd)) {
            const script = item.sub.scripts[0]?.name ?? 'dev';
            const tid = makeTaskId(item.sub.cwd, script);
            const label = item.label ? `${item.label} · ${script}` : script;
            return {
                cwd: item.sub.cwd,
                script,
                pm: item.sub.packageManager,
                taskId: tid,
                label,
            };
        }
    }
    return null;
}

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

    if (row.classList.contains('instance-row--copy')) {
        return getSelectedOption(row);
    }

    const fromGroup =
        subProjects?.length && findRunningTaskInSubProjects(subProjects);
    if (fromGroup) {
        const subSelect = row.querySelector('.subproject-select');
        if (subSelect && subProjects.length) {
            const cwd = normalizeCwd(fromGroup.cwd);
            const item = subProjects.find(
                (p) => normalizeCwd(p.sub.cwd) === cwd || normalizeCwd(p.key) === cwd,
            );
            if (item) {
                subSelect.value = item.key;
                fillScriptSelect(row, subProjects, item.key);
                const refreshed = row.querySelector('.script-select');
                if (refreshed) {
                    for (const o of refreshed.options) {
                        if (o.dataset.taskId === fromGroup.taskId) {
                            refreshed.value = o.value;
                            return taskFromOption(o, row);
                        }
                    }
                }
            }
        }
        for (const opt of scriptSelect.options) {
            if (opt.dataset.taskId === fromGroup.taskId) {
                scriptSelect.value = opt.value;
                return taskFromOption(opt, row);
            }
        }
    }

    for (const opt of scriptSelect.options) {
        const st = statuses[opt.dataset.taskId];
        const orphanRun = opt.dataset.cwd && isCwdOrphanRunning(opt.dataset.cwd);
        if (st !== 'running' && st !== 'crashed' && !orphanRun) continue;

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

    const isCopy = row.classList.contains('instance-row--copy');

    if (isCopy) {
        const sel = getSelectedOption(row);
        if (!sel) return null;
        const st = statuses[sel.taskId];
        if (st === 'running' || st === 'crashed') return sel;
        if (sel.cwd && isCwdOrphanRunning(sel.cwd)) return sel;
        return sel;
    }

    for (const opt of scriptSelect.options) {
        const st = statuses[opt.dataset.taskId];
        if (st === 'running' || st === 'crashed') {
            return taskFromOption(opt, row);
        }
    }
    for (const opt of scriptSelect.options) {
        if (opt.dataset.cwd && isCwdOrphanRunning(opt.dataset.cwd)) {
            return taskFromOption(opt, row);
        }
    }

    const subProjects = mapRawSubProjects(getSubProjectsFromCard(row));
    const fromGroup = findRunningTaskInSubProjects(subProjects);
    if (fromGroup) return fromGroup;

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
    if (row.querySelector(`.script-select option[data-task-id="${CSS.escape(taskId)}"]`)) {
        return true;
    }
    const subProjects = mapRawSubProjects(getSubProjectsFromCard(row));
    return subProjects.some((item) =>
        item.sub.scripts.some((s) => makeTaskId(item.sub.cwd, s.name) === taskId),
    );
}
