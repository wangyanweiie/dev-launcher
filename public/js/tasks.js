/**
 * 实例行状态与 UI 更新
 */

import { listEl } from './dom.js';
import { applyAutoCollapseForTask, syncGroupCollapseState } from './collapse.js';
import { getRowActiveTask, rowHasTask } from './selection.js';
import { renderRunningServices } from './services.js';
import { statuses, taskUrls, taskExitCodes } from './state.js';
import { normalizeTaskUrls, renderUrlLinksHtml } from './urls.js';
import { getRowOrphanInfo } from './orphan-sync.js';

/**
 * 更新实例行按钮、状态点、运行地址
 * @param {string} [changedTaskId]
 */
export function updateCardStates(changedTaskId) {
    listEl.querySelectorAll('.instance-row').forEach((row) => {
        if (changedTaskId && !rowHasTask(row, changedTaskId)) return;

        const sel = getRowActiveTask(row);
        if (!sel) return;

        const status = statuses[sel.taskId] || 'stopped';
        const launcherRunning = status === 'running';
        const crashed = status === 'crashed';
        const orphanInfo = !launcherRunning && !crashed ? getRowOrphanInfo(row) : null;
        const orphanRunning = !!orphanInfo;
        const running = launcherRunning || orphanRunning;

        const dot = row.querySelector('.status-dot');
        const startBtn = row.querySelector('[data-action="start"]');
        const stopBtn = row.querySelector('[data-action="stop"]');
        const urlsEl = row.querySelector('.run-urls');
        const logBtn = row.querySelector('[data-action="view-log"]');

        if (dot) {
            dot.classList.toggle('running', running);
            dot.classList.toggle('crashed', crashed);
            dot.classList.toggle('external', orphanRunning && !launcherRunning);
        }
        if (startBtn) startBtn.disabled = running;
        if (stopBtn) stopBtn.disabled = !running && !orphanRunning;
        if (logBtn) logBtn.setAttribute('data-task-id', sel.taskId);

        if (urlsEl) {
            const urls = launcherRunning
                ? normalizeTaskUrls(taskUrls[sel.taskId])
                : orphanRunning
                  ? normalizeTaskUrls(orphanInfo.urls)
                  : [];
            if (running && urls.length) {
                urlsEl.innerHTML = renderUrlLinksHtml(urls, 'run-url-link');
                urlsEl.classList.add('visible');
                urlsEl.classList.remove('crashed-hint');
            } else if (crashed) {
                const code = taskExitCodes[sel.taskId];
                urlsEl.innerHTML = '';
                urlsEl.classList.add('visible', 'crashed-hint');
                urlsEl.textContent =
                    code !== undefined ? `已崩溃 (退出码 ${code})` : '已崩溃';
            } else if (orphanRunning) {
                urlsEl.innerHTML = renderUrlLinksHtml(orphanInfo.urls, 'run-url-link');
                urlsEl.classList.add('visible');
                urlsEl.classList.remove('crashed-hint');
            } else {
                urlsEl.innerHTML = '';
                urlsEl.classList.remove('visible', 'crashed-hint');
                urlsEl.textContent = '';
            }
        }
    });
    applyAutoCollapseForTask(changedTaskId);
    syncGroupCollapseState();
    renderRunningServices();
}
