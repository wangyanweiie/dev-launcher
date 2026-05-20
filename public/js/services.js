/**
 * 右侧「运行中的服务」面板（运行中 / 历史 两个可折叠区块）
 */

import {
    sidebarPanelEl,
    servicesPanelEl,
    managedListEl,
    historyListEl,
    historySectionEl,
} from './dom.js';
import { resolveTaskMeta } from './project.js';
import { statuses, taskUrls, taskExitCodes, orphanServices, servicesSectionCollapsed } from './state.js';
import { escapeHtml, parseTaskId } from './utils.js';
import { appendLog, showLogForTask } from './log.js';

/** @typedef {import('./types.js').OrphanService} OrphanService */

/**
 * 紧凑服务卡片
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
 * 同步侧边栏布局：区块折叠时缩小服务面板、拉高日志区
 */
export function syncServicesSidebarLayout() {
    if (!sidebarPanelEl) return;

    const historyVisible = historySectionEl && !historySectionEl.hidden;
    const managedEl = document.querySelector('[data-section="managed"]');
    const historyEl = document.querySelector('[data-section="history"]');

    managedEl?.classList.toggle('collapsed', servicesSectionCollapsed.managed);
    historyEl?.classList.toggle('collapsed', servicesSectionCollapsed.history);

    const toggleManaged = managedEl?.querySelector('.services-section-toggle');
    const toggleHistory = historyEl?.querySelector('.services-section-toggle');
    if (toggleManaged) {
        toggleManaged.setAttribute('aria-expanded', String(!servicesSectionCollapsed.managed));
    }
    if (toggleHistory) {
        toggleHistory.setAttribute('aria-expanded', String(!servicesSectionCollapsed.history));
    }

    const allCollapsed =
        servicesSectionCollapsed.managed &&
        (!historyVisible || servicesSectionCollapsed.history);

    sidebarPanelEl.classList.toggle('services-all-collapsed', allCollapsed);
    sidebarPanelEl.classList.toggle(
        'services-partial-collapsed',
        !allCollapsed &&
            (servicesSectionCollapsed.managed ||
                (historyVisible && servicesSectionCollapsed.history)),
    );
}

/**
 * 切换服务区块折叠
 * @param {'managed' | 'history'} section
 */
export function toggleServicesSection(section) {
    if (section === 'managed') {
        servicesSectionCollapsed.managed = !servicesSectionCollapsed.managed;
    } else if (section === 'history') {
        servicesSectionCollapsed.history = !servicesSectionCollapsed.history;
    }
    syncServicesSidebarLayout();
}

/**
 * 收集 Launcher 管理的任务
 */
export function collectManagedServices() {
    /** @type {Array<{ taskId: string; cwd: string; scriptName: string; url?: string; label: string; category: string; status: string }>} */
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
 * 渲染运行中 / 历史服务列表
 */
export function renderRunningServices() {
    if (!managedListEl) return;

    const managed = collectManagedServices();
    const historyCount = orphanServices.length;

    const managedCountEl = document.querySelector('#managed-count');
    const historyCountEl = document.querySelector('#history-count');
    if (managedCountEl) managedCountEl.textContent = String(managed.length);
    if (historyCountEl) historyCountEl.textContent = String(historyCount);

    if (historySectionEl) {
        historySectionEl.hidden = historyCount === 0;
    }

    if (!managed.length) {
        managedListEl.innerHTML = '<p class="services-empty">暂无</p>';
    } else {
        managedListEl.innerHTML = managed
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
    }

    if (historyListEl) {
        if (!historyCount) {
            historyListEl.innerHTML = '';
        } else {
            historyListEl.innerHTML = orphanServices.map(renderOrphanItem).join('');
        }
    }

    syncServicesSidebarLayout();
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
    if (!servicesPanelEl || servicesPanelEl.dataset.bound) return;
    servicesPanelEl.dataset.bound = '1';

    servicesPanelEl.addEventListener('click', async (e) => {
        const toggleBtn = e.target.closest('.services-section-toggle');
        if (toggleBtn) {
            const section = toggleBtn.getAttribute('data-section');
            if (section === 'managed' || section === 'history') {
                toggleServicesSection(section);
            }
            return;
        }

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

    syncServicesSidebarLayout();
}
