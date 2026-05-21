/**
 * WebSocket 实时推送
 */

import { updateCardStates } from './tasks.js';
import { appendLog, importLogs } from './log.js';
import { statuses, taskUrls, taskExitCodes } from './state.js';

/**
 * 建立连接并监听日志/状态/URL
 */
export function connectWs() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);

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
        if (msg.type === 'url') {
            taskUrls[msg.taskId] = msg.url;
            updateCardStates(msg.taskId);
        }
        if (msg.type === 'logs-sync') {
            importLogs(msg.logs || {});
        }
        if (msg.type === 'log') {
            appendLog(msg.taskId, msg.line);
        }
    };

    ws.onclose = () => setTimeout(connectWs, 2000);
}
