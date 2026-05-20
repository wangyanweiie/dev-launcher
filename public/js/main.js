/**
 * 应用入口：初始化与全局操作
 */

import { $, projectSearchEl } from './dom.js';
import { loadProjects } from './api.js';
import { bindCategoryTabs } from './events.js';
import { bindServicesPanel } from './services.js';
import { connectWs } from './websocket.js';
import { clearLogPanel } from './log.js';
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
    try {
        const cfg = await fetch('/api/config').then((r) => r.json());
        const scanLine = cfg.scanOk === false
            ? `扫描: ${cfg.scanRoot}（${cfg.scanError ?? '不可用'}）`
            : `扫描: ${cfg.scanRoot}`;
        $('#scan-root').textContent = scanLine;
        if (cfg.scanOk === false) {
            $('#scan-root').classList.add('subtitle-warn');
        }
    } catch {
        $('#scan-root').textContent = '扫描: /Users/lemon/Company';
    }

    bindCategoryTabs();
    bindServicesPanel();
    connectWs();
    await loadProjects();
}

$('#btn-refresh')?.addEventListener('click', () => loadProjects(true));

projectSearchEl?.addEventListener('input', () => {
    setSearchQuery(projectSearchEl.value);
    refreshActiveCategoryView();
});
$('#btn-stop-all')?.addEventListener('click', stopAllTasks);
$('#btn-clear-log')?.addEventListener('click', clearLogPanel);

init();
