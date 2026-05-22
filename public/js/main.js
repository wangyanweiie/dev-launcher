/**
 * 应用入口：初始化与全局操作
 */

import { $, projectSearchEl } from './dom.js';
import { loadProjects } from './api.js';
import { bindScanRootBar, initScanRootBar } from './scan-root.js';
import { bindCategoryTabs } from './events.js';
import { bindServicesPanel } from './services.js';
import { bindSidebarLogLayout } from './sidebar-layout.js';
import { connectWs } from './websocket.js';
import { initTaskProfiles } from './task-profile.js';
import { bindLogPanelCollapse, clearLogPanel } from './log.js';
import { bindThemeToggle, initTheme } from './theme.js';
import { statuses, taskUrls, userCollapsed, userExpanded, setSearchQuery } from './state.js';
import { refreshActiveCategoryView } from './events.js';
import { updateCardStates } from './tasks.js';

/** 停止全部任务 */
async function stopAllTasks() {
    await fetch('/api/tasks/stop-all', { method: 'POST' });
    const { taskExitCodes } = await import('./state.js');
    Object.keys(statuses).forEach((k) => (statuses[k] = 'stopped'));
    Object.keys(taskUrls).forEach((k) => delete taskUrls[k]);
    Object.keys(taskExitCodes).forEach((k) => delete taskExitCodes[k]);
    userExpanded.clear();
    userCollapsed.clear();
    updateCardStates();
    const { loadProjects } = await import('./api.js');
    await loadProjects(true);
}

/**
 * 应用初始化
 */
async function init() {
    initTheme();
    bindThemeToggle();

    /** @type {object | null} */
    let cfg = null;
    try {
        cfg = await fetch('/api/config').then((r) => r.json());
        initScanRootBar(cfg);
        initTaskProfiles(cfg);
    } catch {
        initScanRootBar({ scanRoot: '', defaultScanRoot: '', scanOk: false });
        initTaskProfiles({});
    }

    bindScanRootBar();
    bindCategoryTabs();
    bindServicesPanel();
    bindLogPanelCollapse();
    bindSidebarLogLayout();
    connectWs();

    if (cfg?.scanOk) {
        await loadProjects();
    }
}

$('#btn-refresh')?.addEventListener('click', () => loadProjects(true));

projectSearchEl?.addEventListener('input', () => {
    setSearchQuery(projectSearchEl.value);
    refreshActiveCategoryView();
});
$('#btn-stop-all')?.addEventListener('click', stopAllTasks);
$('#btn-clear-log')?.addEventListener('click', clearLogPanel);

init();
