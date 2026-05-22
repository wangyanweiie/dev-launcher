/**
 * 项目分组折叠/展开
 */

import { listEl } from './dom.js';
import { mapRawSubProjects } from './project.js';
import { updateCategoryTabIndicators } from './tabs.js';
import { statuses, userCollapsed, userExpanded } from './state.js';
import { isCwdOrphanRunning } from './orphan-sync.js';
import { makeTaskId } from './utils.js';

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
    try {
        const subProjects = mapRawSubProjects(
            JSON.parse(groupEl.dataset.subprojects || '[]'),
        );
        for (const item of subProjects) {
            if (isCwdOrphanRunning(item.sub.cwd)) return true;
            for (const s of item.sub.scripts) {
                const st = statuses[makeTaskId(item.sub.cwd, s.name)];
                if (st === 'running' || st === 'crashed') return true;
            }
        }
    } catch {
        /* 忽略 */
    }
    return false;
}

/**
 * 是否应展开（默认折叠，仅用户手动点击后展开）
 * @param {string} groupId
 */
export function shouldExpandGroup(groupId) {
    return userExpanded.has(groupId);
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
 * 任务状态变化时不自动展开/折叠，保持用户手动选择
 * @param {string} [_changedTaskId]
 */
export function applyAutoCollapseForTask(_changedTaskId) {
    /* 默认折叠，不因运行中自动展开 */
}

/**
 * 同步所有分组折叠状态
 */
export function syncGroupCollapseState() {
    listEl.querySelectorAll('.project-group').forEach((groupEl) => {
        const groupId = groupEl.dataset.groupId;
        if (!groupId) return;

        const running = groupHasRunningFromEl(groupEl);
        const expanded = shouldExpandGroup(groupId);
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
    if (userExpanded.has(groupId)) {
        userExpanded.delete(groupId);
    } else {
        userExpanded.add(groupId);
    }
    syncGroupCollapseState();
}
