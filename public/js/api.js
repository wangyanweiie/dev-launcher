/**
 * 后端 API 与项目列表加载
 */

import { loadingEl, listEl, tabsEl } from './dom.js';
import {
    applyProjectsPayload,
    activeCategory,
    categories,
    setActiveCategory,
    userCollapsed,
    userExpanded,
    allGroups,
    scanError,
    scanSkipped,
} from './state.js';
import {
    pickDefaultCategory,
    renderCategoryTabs,
    renderActiveCategoryListHtml,
    groupHasRunning,
} from './tabs.js';
import { bindEvents, finishListRender } from './events.js';
import { resolveTaskMeta } from './project.js';
import { importLogs, showLogForTask } from './log.js';
import { renderRunningServices } from './services.js';
import { statuses, activeLogTask } from './state.js';
import { escapeHtml, parseTaskId } from './utils.js';
import { syncOrphansWithProjectList } from './orphan-sync.js';
import { orphanServices } from './state.js';

/**
 * 从服务端恢复任务日志并聚焦运行中任务
 */
export async function loadTaskLogs() {
    try {
        const res = await fetch('/api/tasks/logs');
        const data = await res.json();
        const logs = data.logs || {};
        if (!Object.keys(logs).length) return;

        importLogs(logs);

        if (activeLogTask && logs[activeLogTask]) return;

        const runningId = Object.keys(statuses).find((k) => statuses[k] === 'running');
        const tid = runningId ?? Object.keys(logs)[0];
        if (!tid) return;

        const { cwd, scriptName } = parseTaskId(tid);
        const meta = resolveTaskMeta(cwd, scriptName);
        showLogForTask(tid, `日志 · ${meta.label}`);
    } catch {
        /* 忽略 */
    }
}

/**
 * 按需加载历史服务（lsof），与项目列表分离以减轻 /api/projects
 * @param {boolean} [forceRefresh] - 是否绕过 orphans 检测缓存
 */
export async function loadOrphans(forceRefresh = false) {
    const url = forceRefresh ? '/api/orphans?refresh=1' : '/api/orphans';
    try {
        const res = await fetch(url);
        const data = await res.json();
        orphanServices.length = 0;
        orphanServices.push(...(data.orphans || []));
        syncOrphansWithProjectList();
        const { renderRunningServices } = await import('./services.js');
        renderRunningServices();
    } catch {
        /* 忽略 */
    }
}

/**
 * 从 API 加载并渲染项目
 * @param {boolean} [forceRefresh] - 是否绕过扫描缓存
 * @param {{ fetchOrphans?: boolean }} [options] - fetchOrphans 默认 true，拉取历史服务
 */
export async function loadProjects(forceRefresh = false, options = {}) {
    const { fetchOrphans = true } = options;
    if (loadingEl) loadingEl.style.display = 'block';
    if (listEl) listEl.innerHTML = '';
    if (tabsEl) tabsEl.hidden = true;

    const url = forceRefresh
        ? '/api/projects?refresh=1&includeOrphans=0'
        : '/api/projects?includeOrphans=0';
    let res;
    try {
        res = await fetch(url);
    } catch (e) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (listEl) {
            listEl.innerHTML = `<p class="loading">请求失败: ${escapeHtml(String(e?.message || e))}</p>`;
        }
        return;
    }
    const data = await res.json();

    applyProjectsPayload(data);
    syncOrphansWithProjectList();
    if (loadingEl) loadingEl.style.display = 'none';

    if (scanError) {
        listEl.innerHTML = `<div class="state-error">
            <p class="state-error-title">无法扫描项目</p>
            <p class="state-error-msg">${escapeHtml(scanError)}</p>
            <p class="state-error-hint">请在顶栏修改扫描目录并点击「保存默认」，或设置环境变量 <code>DEV_LAUNCHER_SCAN_ROOT</code></p>
        </div>`;
        renderRunningServices();
        return;
    }

    if (!allGroups.length && !scanSkipped.length) {
        listEl.innerHTML = `<p class="list-empty-hint">未在扫描目录中找到含 dev/serve 脚本的项目</p>`;
        renderRunningServices();
        return;
    }

    const cats = [
        ...new Set([
            ...allGroups.map((g) => g.category),
            ...scanSkipped.map((s) => s.category),
        ]),
    ].sort((a, b) => {
        if (a === 'App') return -1;
        if (b === 'App') return 1;
        return a.localeCompare(b);
    });
    categories.length = 0;
    categories.push(...cats);

    if (!categories.includes(activeCategory)) {
        setActiveCategory(pickDefaultCategory());
    } else if (!userExpanded.size && !userCollapsed.size) {
        const currentHasRunning = allGroups
            .filter((g) => g.category === activeCategory)
            .some(groupHasRunning);
        if (!currentHasRunning) {
            const preferred = pickDefaultCategory();
            if (preferred !== activeCategory) setActiveCategory(preferred);
        }
    }

    userExpanded.clear();
    userCollapsed.clear();
    renderCategoryTabs();
    renderActiveCategoryListHtml();
    finishListRender();
    await loadTaskLogs();
    if (fetchOrphans) {
        await loadOrphans(forceRefresh);
    }
}
