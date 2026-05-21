/**
 * 历史服务与左侧项目列表、运行中服务面板同步
 */

import {
    allGroups,
    orphanServices,
    historyOrphans,
    orphanRunningByCwd,
    statuses,
} from './state.js';
import { collectSubProjects, getSavedDefault, resolveDefaultSelection } from './project.js';
import { normalizeCwd, makeTaskId } from './utils.js';

/** @typedef {import('./types.js').OrphanService} OrphanService */
/** @typedef {import('./types.js').ProjectGroup} ProjectGroup */

/**
 * 按 cwd 在扫描列表中查找子项目
 * @param {string} cwd
 * @returns {{ group: ProjectGroup; cwd: string; subLabel: string } | null}
 */
export function findSubprojectByCwd(cwd) {
    const key = normalizeCwd(cwd);
    for (const group of allGroups) {
        for (const item of collectSubProjects(group)) {
            if (normalizeCwd(item.sub.cwd) === key) {
                return { group, cwd: item.sub.cwd, subLabel: item.label };
            }
        }
    }
    return null;
}

/**
 * Launcher 是否正在管理该 cwd 的运行中任务
 * @param {string} cwd
 */
export function isLauncherRunningOnCwd(cwd) {
    const key = normalizeCwd(cwd);
    for (const [tid, st] of Object.entries(statuses)) {
        if (st !== 'running') continue;
        const idx = tid.lastIndexOf('::');
        if (idx < 0) continue;
        if (normalizeCwd(tid.slice(0, idx)) === key) return true;
    }
    return false;
}

/**
 * @param {string} cwd
 */
export function isCwdOrphanRunning(cwd) {
    return !!orphanRunningByCwd[normalizeCwd(cwd)];
}

/**
 * @param {string} cwd
 */
export function getOrphanInfoForCwd(cwd) {
    return orphanRunningByCwd[normalizeCwd(cwd)] ?? null;
}

/**
 * @param {ProjectGroup} group
 */
export function groupHasOrphanRunning(group) {
    for (const item of collectSubProjects(group)) {
        if (isCwdOrphanRunning(item.sub.cwd)) return true;
    }
    return false;
}

/**
 * 默认脚本对应的 taskId（用于展示与日志标题）
 * @param {string} cwd
 * @param {ProjectGroup} group
 */
export function defaultTaskIdForCwd(cwd, group) {
    const subProjects = collectSubProjects(group);
    const saved = getSavedDefault(group.id);
    const { script } = resolveDefaultSelection(subProjects, saved);
    return makeTaskId(cwd, script);
}

/**
 * 将 orphans 分为：可回显到左侧列表 / 仅历史服务
 */
export function syncOrphansWithProjectList() {
    historyOrphans.length = 0;
    for (const k of Object.keys(orphanRunningByCwd)) {
        delete orphanRunningByCwd[k];
    }

    for (const o of orphanServices) {
        const match = findSubprojectByCwd(o.cwd);
        if (!match || isLauncherRunningOnCwd(o.cwd)) {
            historyOrphans.push(o);
            continue;
        }

        const key = normalizeCwd(o.cwd);
        if (!orphanRunningByCwd[key]) {
            orphanRunningByCwd[key] = { urls: [], ports: [] };
        }
        const bucket = orphanRunningByCwd[key];
        if (!bucket.ports.includes(o.port)) {
            bucket.ports.push(o.port);
            bucket.urls.push(o.url);
        }
    }

    for (const key of Object.keys(orphanRunningByCwd)) {
        const bucket = orphanRunningByCwd[key];
        bucket.ports.sort((a, b) => a - b);
        bucket.urls = [...new Set(bucket.urls)];
    }
}

/**
 * 关闭某 cwd 关联的全部历史服务端口
 * @param {string} cwd
 */
export async function killOrphansForCwd(cwd) {
    const info = getOrphanInfoForCwd(cwd);
    if (!info?.ports.length) return;

    for (const port of info.ports) {
        await fetch('/api/orphans/kill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ port }),
        });
    }
}

/**
 * 实例行是否因历史服务而显示为运行中
 * @param {HTMLElement} row
 */
export function getRowOrphanInfo(row) {
    const scriptSelect = row.querySelector('.script-select');
    if (!scriptSelect) return null;

    for (const opt of scriptSelect.options) {
        const cwd = opt.dataset.cwd;
        if (cwd && isCwdOrphanRunning(cwd)) return getOrphanInfoForCwd(cwd);
    }
    return null;
}
