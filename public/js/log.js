/**
 * 日志面板
 */

import { logBody, logPanelEl, logPanelToggleEl, logTitle } from './dom.js';
import { scheduleSidebarLogLayout } from './sidebar-layout.js';
import { activeLogTask, logLines, MAX_LOG, setActiveLogTask } from './state.js';
import { escapeHtml } from './utils.js';

/** 日志面板是否折叠 */
let logPanelCollapsed = false;

/**
 * 同步日志折叠态到 DOM
 */
export function syncLogPanelCollapse() {
    logPanelEl?.classList.toggle('collapsed', logPanelCollapsed);
    logPanelToggleEl?.setAttribute('aria-expanded', String(!logPanelCollapsed));
    scheduleSidebarLogLayout();
}

/**
 * 切换日志面板折叠
 */
export function toggleLogPanel() {
    logPanelCollapsed = !logPanelCollapsed;
    syncLogPanelCollapse();
}

/**
 * 绑定日志标题栏折叠点击
 */
export function bindLogPanelCollapse() {
    if (!logPanelToggleEl || logPanelToggleEl.dataset.bound) return;
    logPanelToggleEl.dataset.bound = '1';
    logPanelToggleEl.addEventListener('click', toggleLogPanel);
    syncLogPanelCollapse();
}

/**
 * 追加日志
 * @param {string} taskId
 * @param {string} line
 */
export function appendLog(taskId, line) {
    logLines.push({ taskId, line });
    if (logLines.length > MAX_LOG) logLines.shift();

    if (!activeLogTask || activeLogTask === taskId) {
        renderLogPanel(taskId);
    }
}

/**
 * 渲染日志面板
 * @param {string | null} taskId
 */
export function renderLogPanel(taskId) {
    const lines = taskId
        ? logLines.filter((l) => l.taskId === taskId).slice(-200)
        : logLines.slice(-200);

    const errorRe = /\b(error|err!|failed|exception|fatal)\b|错误|失败/i;

    logBody.innerHTML = lines
        .map((l) => {
            const active = l.taskId === taskId ? 'active' : '';
            const err = errorRe.test(l.line) ? ' log-line-error' : '';
            return `<div class="log-line ${active}${err}">${escapeHtml(l.line)}</div>`;
        })
        .join('');
    logBody.scrollTop = logBody.scrollHeight;
    scheduleSidebarLogLayout();
}

/**
 * 聚焦某任务日志
 * @param {string | null} taskId
 * @param {string} title
 */
export function showLogForTask(taskId, title) {
    setActiveLogTask(taskId);
    logTitle.textContent = title;
    renderLogPanel(taskId);
}

/** 清空日志 */
export function clearLogPanel() {
    logLines.length = 0;
    logBody.innerHTML = '';
}

/**
 * 从服务端恢复日志缓冲
 * @param {Record<string, string[]>} logsByTask
 */
export function importLogs(logsByTask) {
    logLines.length = 0;
    for (const [taskId, lines] of Object.entries(logsByTask)) {
        for (const line of lines) {
            logLines.push({ taskId, line });
        }
    }
    while (logLines.length > MAX_LOG) {
        logLines.shift();
    }
    renderLogPanel(activeLogTask);
}
