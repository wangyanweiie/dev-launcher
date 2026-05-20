/**
 * 项目列表 HTML 渲染
 */

import {
    collectSubProjects,
    expandGroupToCards,
    formatDefaultLabel,
    getSavedDefault,
    resolveDefaultSelection,
} from './project.js';
import { projectInstances, statuses, taskUrls } from './state.js';
import { escapeHtml, makeTaskId } from './utils.js';

/** @typedef {import('./types.js').ProjectGroup} ProjectGroup */
/** @typedef {import('./types.js').CardDescriptor} CardDescriptor */
/** @typedef {import('./types.js').SelectedTask} SelectedTask */

/**
 * 渲染脚本 option 列表
 * @param {import('./types.js').SubProject} sub
 * @param {string} [subLabel]
 * @param {string} [selectedScript]
 */
export function renderScriptSelectOptions(sub, subLabel, selectedScript) {
    return sub.scripts
        .map((s) => {
            const tid = makeTaskId(sub.cwd, s.name);
            const label = subLabel ? `${subLabel} · ${s.name}` : s.name;
            const selected = selectedScript === s.name ? ' selected' : '';
            return `<option value="${escapeHtml(s.name)}"${selected}
                data-task-id="${escapeHtml(tid)}"
                data-cwd="${escapeHtml(sub.cwd)}"
                data-script="${escapeHtml(s.name)}"
                data-pm="${escapeHtml(sub.packageManager)}"
                data-label="${escapeHtml(label)}">${escapeHtml(s.name)}</option>`;
        })
        .join('');
}

/**
 * @param {SelectedTask | null} sel
 */
export function initialState(sel) {
    if (!sel) return { running: false, url: '' };
    return {
        running: statuses[sel.taskId] === 'running',
        url: taskUrls[sel.taskId] ?? '',
    };
}

/**
 * 渲染实例行
 * @param {ProjectGroup} group
 * @param {CardDescriptor} desc
 * @param {boolean} useCascade
 */
export function renderInstanceRow(group, desc, useCascade) {
    const { instanceId, isCopy, copyLabel } = desc;
    const subProjects = collectSubProjects(group);
    const saved = getSavedDefault(group.id, instanceId);
    const picked = resolveDefaultSelection(subProjects, saved);
    const activeSub = picked.sub;
    const defaultLabel = formatDefaultLabel(group.id, instanceId, subProjects);

    /** @type {SelectedTask | null} */
    const firstSel = activeSub
        ? {
              cwd: activeSub.sub.cwd,
              script: picked.script,
              pm: activeSub.sub.packageManager,
              taskId: makeTaskId(activeSub.sub.cwd, picked.script),
              label: useCascade
                  ? `${activeSub.label} · ${picked.script}`
                  : picked.script,
          }
        : null;
    const { running, url } = initialState(firstSel);

    const instanceLabel = isCopy && copyLabel ? copyLabel : useCascade ? '主实例' : '';

    let selectHtml;
    if (useCascade) {
        const subOptions = subProjects
            .map((p) => {
                const selected = p.key === picked.subKey ? ' selected' : '';
                return `<option value="${escapeHtml(p.key)}"${selected}>${escapeHtml(p.label)}</option>`;
            })
            .join('');
        selectHtml = `<div class="select-cascade" data-cascade="true">
            <select class="subproject-select" aria-label="选择子项目">${subOptions}</select>
            <span class="cascade-sep" aria-hidden="true">›</span>
            <select class="script-select" aria-label="选择脚本">
                ${renderScriptSelectOptions(activeSub.sub, activeSub.label, picked.script)}
            </select>
        </div>`;
    } else {
        selectHtml = `<select class="script-select" aria-label="选择脚本">
            ${renderScriptSelectOptions(activeSub.sub, undefined, picked.script)}
        </select>`;
    }

    const deleteBtn = isCopy
        ? `<button type="button" class="btn btn-ghost btn-delete-copy" data-action="delete-copy"
            title="删除此副本">删除</button>`
        : '';

    return `<div class="instance-row${isCopy ? ' instance-row--copy' : ''}"
        data-group-id="${group.id}"
        data-instance-id="${escapeHtml(instanceId)}">
        <span class="status-dot ${running ? 'running' : ''}"></span>
        ${instanceLabel ? `<span class="instance-label">${isCopy ? '<span class="badge badge-copy">副本</span> ' : ''}${escapeHtml(instanceLabel)}</span>` : '<span class="instance-label instance-label--empty"></span>'}
        ${selectHtml}
        <div class="project-actions">
            <button type="button" class="btn btn-primary" data-action="start"
                ${running ? 'disabled' : ''}>启动</button>
            <button type="button" class="btn btn-stop" data-action="stop"
                ${running ? '' : 'disabled'}>停止</button>
            <button type="button" class="btn btn-ghost" data-action="view-log"
                data-task-id="${firstSel ? escapeHtml(firstSel.taskId) : ''}">日志</button>
            <button type="button" class="btn btn-ghost btn-save-default" data-action="save-default"
                title="将当前选择保存为此${isCopy ? '副本' : '项目'}的默认">保存默认</button>
            ${deleteBtn}
        </div>
        ${defaultLabel ? `<span class="default-hint">默认: ${escapeHtml(defaultLabel)}</span>` : ''}
        <a class="run-url ${running && url ? 'visible' : ''}" target="_blank" rel="noopener"
            ${running && url ? `href="${escapeHtml(url)}"` : ''}
        >${running && url ? escapeHtml(url) : ''}</a>
    </div>`;
}

/**
 * 渲染项目分组
 * @param {ProjectGroup} group
 */
export function renderProjectGroup(group) {
    const subProjects = collectSubProjects(group);
    if (!subProjects.length) return '';

    const useCascade = subProjects.length > 1;
    const canDuplicate = useCascade;
    const copies = projectInstances[group.id] || [];
    const subProjectsJson = escapeHtml(JSON.stringify(subProjects.map((p) => ({
        key: p.key,
        label: p.label,
        cwd: p.sub.cwd,
        packageManager: p.sub.packageManager,
        scripts: p.sub.scripts,
    }))));

    const instancesHtml = expandGroupToCards(group)
        .map((d) => renderInstanceRow(group, d, useCascade))
        .join('');

    const copyBtn = canDuplicate
        ? `<button type="button" class="btn btn-ghost btn-duplicate" data-action="duplicate"
            title="新增副本，可同时运行另一子项目">复制</button>`
        : '';
    const copyCount = copies.length
        ? `<span class="badge badge-copy-count">${copies.length} 个副本</span>`
        : '';

    const tempIds = subProjects.flatMap((item) =>
        item.sub.scripts.map((s) => makeTaskId(item.sub.cwd, s.name)),
    );
    const hasRunning = tempIds.some((id) => statuses[id] === 'running');
    const expanded = hasRunning;
    const collapsedClass = expanded ? 'expanded' : 'collapsed';

    return `<article class="project-group ${collapsedClass}" data-group-id="${group.id}"
        data-subprojects="${subProjectsJson}">
        <div class="project-group-header${hasRunning ? ' has-running' : ''}" data-action="toggle-group" role="button" tabindex="0" title="点击折叠/展开">
            <svg class="group-chevron${expanded ? ' expanded' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
            <div class="project-info">
                <div class="project-name">${escapeHtml(group.folderName)}</div>
                <div class="project-path">${escapeHtml(group.rootPath)}</div>
            </div>
            ${copyCount}
            ${copyBtn}
            <span class="badge ${group.category.toLowerCase()}">${escapeHtml(group.category)}</span>
        </div>
        <div class="project-instances">${instancesHtml}</div>
    </article>`;
}
