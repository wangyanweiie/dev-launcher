/**
 * 右侧「运行中的服务」面板
 */

import { servicesListEl, servicesCountEl } from './dom.js';
import { resolveTaskMeta } from './project.js';
import { statuses, taskUrls, taskExitCodes, orphanServices } from './state.js';
import { escapeHtml, parseTaskId } from './utils.js';
import { appendLog, showLogForTask } from './log.js';

/** @typedef {import('./types.js').OrphanService} OrphanService */

/**
 * 紧凑服务卡片：标题行左侧信息，右上角操作按钮，下方 URL
 * @param {object} opts
 */
function renderServiceCard(opts) {
    const {
        extraClass = '',
        dotClass = '',
        name,
        badge = '',
        urlHtml = '',
        actionsHtml = '',
        dataAttrs = '',
    } = opts;

    return `<div class="service-item ${extraClass}" ${dataAttrs}>
        <div class="service-item-row">
            <div class="service-item-info">
                <span class="service-dot ${dotClass}"></span>
                <span class="service-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                ${badge}
            </div>
            <div class="service-item-actions">${actionsHtml}</div>
        </div>
        ${urlHtml ? `<div class="service-item-url">${urlHtml}</div>` : ''}
    </div>`;
}

/**
 * 收集 Launcher 管理的任务
 */
export function collectManagedServices() {
    /** @type {Array<{ taskId: string; cwd: string; scriptName: string; url?: string; label: string; projectName: string; category: string; status: string }>} */
    const items = [];

    for (const [tid, status] of Object.entries(statuses)) {
        if (status !== 'running' && status !== 'crashed') continue;
        const { cwd, scriptName } = parseTaskId(tid);
        const meta = resolveTaskMeta(cwd, scriptName);
        items.push({
            taskId: tid,
            cwd,
            scriptName,
            url: taskUrls[tid],
            label: meta.label,
            projectName: meta.projectName,
            category: meta.category,
            status,
        });
    }

    return items.sort((a, b) => {
        const cat = a.category.localeCompare(b.category);
        if (cat !== 0) return cat;
        return a.label.localeCompare(b.label);
    });
}

/**
 * @param {OrphanService} o
 */
function renderOrphanItem(o) {
    const badge = o.category
        ? `<span class="service-badge">${escapeHtml(o.category)}</span>`
        : '';
    const title = `${o.projectLabel} · pid ${o.pid}`;
    const actions = `<button type="button" class="btn btn-stop btn-service-kill" data-action="orphan-kill"
        data-port="${o.port}">关闭</button>`;

    return renderServiceCard({
        extraClass: 'external company',
        dotClass: 'external',
        name: title,
        badge,
        urlHtml: `<a class="service-url" href="${escapeHtml(o.url)}" target="_blank" rel="noopener">${escapeHtml(o.url)}</a>`,
        actionsHtml: actions,
        dataAttrs: `data-port="${o.port}"`,
    });
}

/**
 * 渲染运行中服务列表
 */
export function renderRunningServices() {
    if (!servicesListEl) return;

    const managed = collectManagedServices();
    const total = managed.length + orphanServices.length;
    if (servicesCountEl) {
        servicesCountEl.textContent = String(total);
    }

    if (!total) {
        servicesListEl.innerHTML = '<p class="services-empty">暂无运行中的服务</p>';
        return;
    }

    const managedHtml = managed
        .map((item) => {
            const isCrashed = item.status === 'crashed';
            const code = taskExitCodes[item.taskId];
            let urlBlock;
            if (item.url) {
                urlBlock = `<a class="service-url" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.url)}</a>`;
            } else if (isCrashed) {
                urlBlock = `<span class="service-url crashed">${code !== undefined ? `已崩溃 (${code})` : '已崩溃'}</span>`;
            } else {
                urlBlock = '<span class="service-url pending">等待地址…</span>';
            }

            const actions = [
                `<button type="button" class="btn btn-ghost btn-service-log" data-action="service-log"
                    data-task-id="${escapeHtml(item.taskId)}">日志</button>`,
                isCrashed
                    ? ''
                    : `<button type="button" class="btn btn-stop btn-service-stop" data-action="service-stop"
                        data-cwd="${escapeHtml(item.cwd)}"
                        data-script="${escapeHtml(item.scriptName)}"
                        data-label="${escapeHtml(item.label)}">关闭</button>`,
            ]
                .filter(Boolean)
                .join('');

            return renderServiceCard({
                extraClass: isCrashed ? 'crashed' : '',
                dotClass: isCrashed ? 'crashed' : 'running',
                name: item.label,
                urlHtml: urlBlock,
                actionsHtml: actions,
                dataAttrs: `data-task-id="${escapeHtml(item.taskId)}"`,
            });
        })
        .join('');

    const companySection =
        orphanServices.length > 0
            ? `<p class="services-section-label">Company 历史服务</p>${orphanServices.map(renderOrphanItem).join('')}`
            : '';

    servicesListEl.innerHTML = managedHtml + companySection;
}

/**
 * 停止 Launcher 管理的任务
 */
async function stopService(cwd, scriptName, label) {
    const tid = `${cwd}::${scriptName}`;
    const res = await fetch('/api/tasks/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd, scriptName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
        appendLog(tid, `[dev-launcher] 停止失败: ${data.error ?? '任务未在运行'}`);
        showLogForTask(tid, `日志 · ${label}`);
        return;
    }

    statuses[tid] = 'stopped';
    delete taskUrls[tid];
    delete taskExitCodes[tid];
    const { updateCardStates } = await import('./tasks.js');
    updateCardStates(tid);
    renderRunningServices();
}

/**
 * 关闭占用端口的进程
 * @param {number} port
 */
async function killOrphan(port) {
    const res = await fetch('/api/orphans/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return;
    const { loadProjects } = await import('./api.js');
    await loadProjects(true);
}

/**
 * 绑定服务面板事件
 */
export function bindServicesPanel() {
    if (!servicesListEl || servicesListEl.dataset.bound) return;
    servicesListEl.dataset.bound = '1';

    servicesListEl.addEventListener('click', async (e) => {
        const stopBtn = e.target.closest('[data-action="service-stop"]');
        if (stopBtn) {
            e.preventDefault();
            const cwd = stopBtn.getAttribute('data-cwd');
            const script = stopBtn.getAttribute('data-script');
            const label = stopBtn.getAttribute('data-label') || '';
            if (cwd && script) await stopService(cwd, script, label);
            return;
        }

        const killBtn = e.target.closest('[data-action="orphan-kill"]');
        if (killBtn) {
            e.preventDefault();
            const port = Number(killBtn.getAttribute('data-port'));
            if (port) await killOrphan(port);
            return;
        }

        const logBtn = e.target.closest('[data-action="service-log"]');
        if (logBtn) {
            const tid = logBtn.getAttribute('data-task-id');
            if (!tid) return;
            const { cwd, scriptName } = parseTaskId(tid);
            const meta = resolveTaskMeta(cwd, scriptName);
            showLogForTask(tid, `日志 · ${meta.label}`);
        }
    });
}
