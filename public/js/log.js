/**
 * 日志面板
 */

import { logBody, logTitle } from './dom.js';
import { activeLogTask, logLines, MAX_LOG, setActiveLogTask } from './state.js';
import { escapeHtml } from './utils.js';

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
