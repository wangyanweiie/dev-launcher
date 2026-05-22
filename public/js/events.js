/**
 * DOM 事件绑定
 */

import { tabsEl, listEl, servicesTabsEl } from './dom.js';
import { toggleGroupCollapse } from './collapse.js';
import {
    formatDefaultLabel,
    getSubProjectsFromCard,
    mapRawSubProjects,
} from './project.js';
import {
    getSelectedOption,
    getRowActiveTask,
    fillScriptSelect,
    syncRowToRunningTask,
} from './selection.js';
import { updateCardStates } from './tasks.js';
import { appendLog, showLogForTask } from './log.js';
import { renderCategoryTabs, renderActiveCategoryListHtml } from './tabs.js';
import { renderRunningServices, renderServicesCategoryTabs } from './services.js';
import {
    statuses,
    taskUrls,
    projectDefaults,
    projectInstances,
    activeCategory,
    setActiveCategory,
    userCollapsed,
    userExpanded,
} from './state.js';
import { makeDefaultKey } from './utils.js';

/**
 * 将各行下拉对齐到分组内实际运行中的子项目/脚本
 */
export function syncAllRowsToRunningTasks() {
    listEl.querySelectorAll('.instance-row').forEach((row) => {
        const subProjects = mapRawSubProjects(getSubProjectsFromCard(row));
        syncRowToRunningTask(row, subProjects);
    });
}

/**
 * 列表渲染完成后绑定事件并刷新状态
 */
export function finishListRender() {
    syncAllRowsToRunningTasks();
    bindEvents();
    updateCardStates();
}

/**
 * 重新渲染当前 Tab 并绑定事件
 */
export function refreshActiveCategoryView() {
    renderCategoryTabs();
    renderServicesCategoryTabs();
    renderActiveCategoryListHtml();
    finishListRender();
    renderRunningServices();
}

/**
 * 切换 APP / PC Tab
 * @param {string} category
 */
export function switchCategory(category) {
    if (category === activeCategory) return;
    setActiveCategory(category);
    userExpanded.clear();
    userCollapsed.clear();
    refreshActiveCategoryView();
}

/**
 * Tab 点击（事件委托，只绑定一次）
 */
function bindCategoryTabsOn(container) {
    if (!container || container.dataset.bound) return;
    container.dataset.bound = '1';
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-tab]');
        if (!btn) return;
        const cat = btn.getAttribute('data-tab');
        if (cat) switchCategory(cat);
    });
}

export function bindCategoryTabs() {
    bindCategoryTabsOn(tabsEl);
    bindCategoryTabsOn(servicesTabsEl);
}

/**
 * 更新默认配置提示
 * @param {HTMLElement} row
 * @param {import('./types.js').SubProjectItem[]} subProjects
 */
function updateDefaultHint(row, subProjects) {
    const groupId = row.dataset.groupId;
    const instanceId = row.dataset.instanceId || '';
    if (!groupId) return;
    let hint = row.querySelector('.default-hint');
    const label = formatDefaultLabel(groupId, instanceId, subProjects);
    if (!label) {
        hint?.remove();
        return;
    }
    if (!hint) {
        hint = document.createElement('span');
        hint.className = 'default-hint';
        row.appendChild(hint);
    }
    hint.textContent = `默认: ${label}`;
}

/**
 * 绑定项目列表内交互
 */
export function bindEvents() {
    listEl.querySelectorAll('[data-action="toggle-group"]').forEach((header) => {
        const groupEl = header.closest('.project-group');
        const groupId = groupEl?.dataset.groupId;
        if (!groupId) return;

        const toggle = () => toggleGroupCollapse(groupId);
        header.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            toggle();
        });
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (e.target.closest('button')) return;
                toggle();
            }
        });
    });

    listEl.querySelectorAll('.subproject-select').forEach((select) => {
        select.addEventListener('change', () => {
            const row = select.closest('.instance-row');
            if (!row) return;
            fillScriptSelect(row, mapRawSubProjects(getSubProjectsFromCard(row)), select.value);
            updateCardStates();
        });
    });

    listEl.querySelectorAll('.script-select').forEach((select) => {
        select.addEventListener('change', () => {
            const row = select.closest('.instance-row');
            if (row) updateCardStates();
        });
    });

    listEl.querySelectorAll('[data-action="start"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const row = btn.closest('.instance-row');
            const sel = getSelectedOption(row);
            if (!sel) return;

            const res = await fetch('/api/tasks/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cwd: sel.cwd,
                    scriptName: sel.script,
                    packageManager: sel.pm,
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                showLogForTask(sel.taskId, `日志 · ${sel.label}`);
                appendLog(
                    sel.taskId,
                    `[dev-launcher] 启动失败: ${data.error ?? res.statusText}`,
                );
                return;
            }

            statuses[sel.taskId] = 'running';
            showLogForTask(sel.taskId, `日志 · ${sel.label}`);
            if (data.alreadyRunning) {
                appendLog(sel.taskId, '[dev-launcher] 任务已在运行，未重复启动');
            }
            if (data.task?.urls?.length) {
                const { taskUrls } = await import('./state.js');
                const { normalizeTaskUrls } = await import('./urls.js');
                taskUrls[sel.taskId] = normalizeTaskUrls(data.task.urls);
            } else if (data.task?.url) {
                const { taskUrls } = await import('./state.js');
                const { normalizeTaskUrls } = await import('./urls.js');
                taskUrls[sel.taskId] = normalizeTaskUrls(data.task.url);
            }
            updateCardStates(sel.taskId);
        });
    });

    listEl.querySelectorAll('[data-action="stop"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const row = btn.closest('.instance-row');
            const sel = getRowActiveTask(row);
            if (!sel) return;

            const { isCwdOrphanRunning, killOrphansForCwd } = await import('./orphan-sync.js');
            const launcherRunning = statuses[sel.taskId] === 'running';
            if (!launcherRunning && isCwdOrphanRunning(sel.cwd)) {
                await killOrphansForCwd(sel.cwd);
                const { loadProjects } = await import('./api.js');
                await loadProjects(true);
                return;
            }

            const res = await fetch('/api/tasks/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cwd: sel.cwd,
                    scriptName: sel.script,
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) {
                appendLog(
                    sel.taskId,
                    `[dev-launcher] 停止失败: ${data.error ?? '任务未在运行或已结束'}`,
                );
                showLogForTask(sel.taskId, `日志 · ${sel.label}`);
                return;
            }

            statuses[sel.taskId] = 'stopped';
            delete taskUrls[sel.taskId];
            const { taskExitCodes } = await import('./state.js');
            delete taskExitCodes[sel.taskId];
            updateCardStates(sel.taskId);
        });
    });

    listEl.querySelectorAll('[data-action="view-log"]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const row = btn.closest('.instance-row');
            const sel = getSelectedOption(row);
            const taskId = sel?.taskId || btn.getAttribute('data-task-id');
            const label = sel?.label ?? taskId?.split('::').pop() ?? '';
            showLogForTask(taskId, `日志 · ${label}`);
        });
    });

    listEl.querySelectorAll('[data-action="duplicate"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const groupEl = btn.closest('.project-group');
            const groupId = groupEl?.dataset.groupId;
            if (!groupId) return;

            const res = await fetch('/api/instances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupId }),
            });
            if (!res.ok) return;

            const data = await res.json();
            if (data.instances) {
                for (const k of Object.keys(projectInstances)) delete projectInstances[k];
                Object.assign(projectInstances, data.instances);
            }

            if (data.instance?.instanceId) {
                const key = makeDefaultKey(groupId, data.instance.instanceId);
                delete projectDefaults[key];
            }

            userExpanded.add(groupId);
            refreshActiveCategoryView();
        });
    });

    listEl.querySelectorAll('[data-action="delete-copy"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const row = btn.closest('.instance-row');
            const groupId = row?.dataset.groupId;
            const instanceId = row?.dataset.instanceId;
            if (!groupId || !instanceId) return;

            if (!confirm('确定删除此副本？其默认配置将一并移除。')) return;

            const res = await fetch('/api/instances', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupId, instanceId }),
            });
            if (!res.ok) return;

            const data = await res.json();
            if (data.instances) {
                for (const k of Object.keys(projectInstances)) delete projectInstances[k];
                Object.assign(projectInstances, data.instances);
            }
            if (data.defaults) {
                for (const k of Object.keys(projectDefaults)) delete projectDefaults[k];
                Object.assign(projectDefaults, data.defaults);
            }
            refreshActiveCategoryView();
        });
    });

    listEl.querySelectorAll('[data-action="save-default"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const row = btn.closest('.instance-row');
            const groupId = row?.dataset.groupId;
            const instanceId = row?.dataset.instanceId || '';
            const sel = getSelectedOption(row);
            if (!groupId || !sel) return;

            const res = await fetch('/api/defaults', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    groupId,
                    instanceId,
                    subKey: sel.cwd,
                    script: sel.script,
                }),
            });

            if (!res.ok) return;

            const data = await res.json();
            Object.assign(projectDefaults, data.defaults || projectDefaults);
            projectDefaults[makeDefaultKey(groupId, instanceId)] = {
                subKey: sel.cwd,
                script: sel.script,
            };

            updateDefaultHint(row, mapRawSubProjects(getSubProjectsFromCard(row)));

            const el = /** @type {HTMLButtonElement} */ (btn);
            const prev = el.textContent;
            el.textContent = '已保存';
            el.disabled = true;
            setTimeout(() => {
                el.textContent = prev;
                el.disabled = false;
            }, 1200);
        });
    });
}
