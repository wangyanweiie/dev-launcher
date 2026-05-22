/**
 * WebSocket 实时推送
 */

import { updateCardStates } from './tasks.js';
import { appendLog, importLogs } from './log.js';
import { statuses, taskUrls, taskExitCodes, activeLogTask } from './state.js';
import { normalizeTaskUrls } from './urls.js';
import { logSubscribeOnly } from './state.js';

/** @type {WebSocket | null} */
let ws = null;

/**
 * 向服务端订阅某任务日志（logSubscribeOnly 时必需）
 * @param {string | null} taskId
 */
export function subscribeLogTask(taskId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'subscribe', taskId: taskId ?? undefined }));
}

/**
 * 建立连接并监听日志/状态/URL
 */
export function connectWs() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'status') {
            statuses[msg.taskId] = msg.status;
            if (msg.status === 'stopped' || msg.status === 'crashed') {
                delete taskUrls[msg.taskId];
            }
            if (msg.status === 'stopped') {
                delete taskExitCodes[msg.taskId];
            } else if (msg.exitCode !== undefined && msg.exitCode !== null) {
                taskExitCodes[msg.taskId] = msg.exitCode;
            }
            if (msg.status === 'running') {
                delete taskExitCodes[msg.taskId];
            }
            updateCardStates(msg.taskId);
        }
        if (msg.type === 'urls') {
            taskUrls[msg.taskId] = normalizeTaskUrls(msg.urls);
            updateCardStates(msg.taskId);
        } else if (msg.type === 'url') {
            taskUrls[msg.taskId] = normalizeTaskUrls(msg.url);
            updateCardStates(msg.taskId);
        }
        if (msg.type === 'logs-sync') {
            importLogs(msg.logs || {});
        }
        if (msg.type === 'log') {
            appendLog(msg.taskId, msg.line);
        }
    };

    ws.onopen = () => {
        if (logSubscribeOnly && activeLogTask) {
            subscribeLogTask(activeLogTask);
        }
    };

    ws.onclose = () => setTimeout(connectWs, 2000);
}
