/**
 * 项目分组折叠/展开
 */

import { listEl } from './dom.js';
import { updateCategoryTabIndicators } from './tabs.js';
import { statuses, userCollapsed, userExpanded } from './state.js';

/**
 * 查找项目分组 DOM
 * @param {string} groupId
 */
export function findProjectGroup(groupId) {
    return listEl.querySelector(`[data-group-id="${CSS.escape(groupId)}"]`);
}

/**
 * 分组内是否有运行中任务
 * @param {HTMLElement} groupEl
 */
export function groupHasRunningFromEl(groupEl) {
    const ids = new Set();
    groupEl.querySelectorAll('.script-select option[data-task-id]').forEach((opt) => {
        if (opt.dataset.taskId) ids.add(opt.dataset.taskId);
    });
    return [...ids].some((id) => statuses[id] === 'running' || statuses[id] === 'crashed');
}

/**
 * 是否应展开
 * @param {string} groupId
 * @param {HTMLElement} groupEl
 */
export function shouldExpandGroup(groupId, groupEl) {
    if (userExpanded.has(groupId)) return true;
    if (userCollapsed.has(groupId)) return false;
    return groupHasRunningFromEl(groupEl);
}

/**
 * 根据 taskId 找 groupId
 * @param {string} taskId
 */
export function findGroupIdByTaskId(taskId) {
    const opt = listEl.querySelector(
        `.script-select option[data-task-id="${CSS.escape(taskId)}"]`,
    );
    return opt?.closest('.project-group')?.dataset.groupId;
}

/**
 * 任务状态变化时自动折叠策略
 * @param {string} [changedTaskId]
 */
export function applyAutoCollapseForTask(changedTaskId) {
    if (!changedTaskId) return;
    const groupId = findGroupIdByTaskId(changedTaskId);
    if (!groupId) return;
    const groupEl = findProjectGroup(groupId);
    if (!groupEl) return;

    if (groupHasRunningFromEl(groupEl)) {
        userCollapsed.delete(groupId);
    } else {
        userExpanded.delete(groupId);
    }
}

/**
 * 同步所有分组折叠状态
 */
export function syncGroupCollapseState() {
    listEl.querySelectorAll('.project-group').forEach((groupEl) => {
        const groupId = groupEl.dataset.groupId;
        if (!groupId) return;

        const running = groupHasRunningFromEl(groupEl);
        const expanded = shouldExpandGroup(groupId, groupEl);
        groupEl.classList.toggle('collapsed', !expanded);
        groupEl.classList.toggle('expanded', expanded);
        groupEl.querySelector('.group-chevron')?.classList.toggle('expanded', expanded);
        groupEl.querySelector('.project-group-header')?.classList.toggle('has-running', running);
    });
    updateCategoryTabIndicators();
}

/**
 * 切换折叠
 * @param {string} groupId
 */
export function toggleGroupCollapse(groupId) {
    const groupEl = findProjectGroup(groupId);
    if (!groupEl) return;

    const expanded = shouldExpandGroup(groupId, groupEl);
    if (expanded) {
        userCollapsed.add(groupId);
        userExpanded.delete(groupId);
    } else {
        userExpanded.add(groupId);
        userCollapsed.delete(groupId);
    }
    syncGroupCollapseState();
}
