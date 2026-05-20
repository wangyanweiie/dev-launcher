/**
 * 项目与子项目数据逻辑
 */

import { allGroups, projectDefaults, projectInstances } from './state.js';
import { makeDefaultKey, makeTaskId } from './utils.js';

/** @typedef {import('./types.js').ProjectGroup} ProjectGroup */
/** @typedef {import('./types.js').SubProjectItem} SubProjectItem */
/** @typedef {import('./types.js').CardDescriptor} CardDescriptor */

/**
 * 读取已保存默认配置
 * @param {string} groupId
 * @param {string} [instanceId]
 */
export function getSavedDefault(groupId, instanceId = '') {
    return projectDefaults[makeDefaultKey(groupId, instanceId)];
}

/**
 * 收集可选子项目
 * @param {ProjectGroup} group
 */
export function collectSubProjects(group) {
    /** @type {SubProjectItem[]} */
    const items = [];
    if (group.root?.scripts?.length) {
        items.push({ key: group.root.cwd, label: '根目录', sub: group.root });
    }
    for (const child of group.children) {
        items.push({ key: child.cwd, label: child.name, sub: child });
    }
    return items;
}

/**
 * 解析默认选中项
 * @param {SubProjectItem[]} subProjects
 * @param {{ subKey: string; script: string } | undefined} saved
 */
export function resolveDefaultSelection(subProjects, saved) {
    const first = subProjects[0];
    const fallback = {
        subKey: first.key,
        script: first.sub.scripts[0]?.name ?? '',
        sub: first,
    };
    if (!saved) return fallback;

    const sub = subProjects.find((p) => p.key === saved.subKey) ?? first;
    const script =
        sub.sub.scripts.find((s) => s.name === saved.script)?.name ??
        sub.sub.scripts[0]?.name ??
        '';
    return { subKey: sub.key, script, sub };
}

/**
 * 默认配置展示文案
 * @param {string} groupId
 * @param {string} instanceId
 * @param {SubProjectItem[]} subProjects
 */
export function formatDefaultLabel(groupId, instanceId, subProjects) {
    const saved = getSavedDefault(groupId, instanceId);
    if (!saved) return '';
    const sub = subProjects.find((p) => p.key === saved.subKey);
    const subLabel = sub?.label ?? '';
    return subLabel ? `${subLabel} · ${saved.script}` : saved.script;
}

/**
 * 展开为实例卡片描述列表
 * @param {ProjectGroup} group
 */
export function expandGroupToCards(group) {
    const subProjects = collectSubProjects(group);
    /** @type {CardDescriptor[]} */
    const cards = [{ group, instanceId: '', isCopy: false, copyLabel: null }];
    if (subProjects.length <= 1) return cards;

    const copies = projectInstances[group.id] || [];
    copies.forEach((inst, i) => {
        cards.push({
            group,
            instanceId: inst.instanceId,
            isCopy: true,
            copyLabel: `副本 ${i + 1}`,
        });
    });
    return cards;
}

/**
 * 从 DOM 解析子项目 JSON
 * @param {HTMLElement} el
 */
export function getSubProjectsFromCard(el) {
    const group = el.closest('.project-group');
    try {
        return JSON.parse(group?.dataset.subprojects || '[]');
    } catch {
        return [];
    }
}

/**
 * 映射为 SubProjectItem 结构
 * @param {Array<{ key: string; label: string; cwd: string; packageManager: string; scripts: unknown[] }>} raw
 */
export function mapRawSubProjects(raw) {
    return raw.map((p) => ({
        key: p.key,
        label: p.label,
        sub: {
            cwd: p.cwd,
            packageManager: p.packageManager,
            scripts: p.scripts,
        },
    }));
}

/**
 * 根据 cwd 解析展示用项目名与子项目名
 * @param {string} cwd - 工作目录
 * @param {string} scriptName - 脚本名
 */
export function resolveTaskMeta(cwd, scriptName) {
    for (const g of allGroups) {
        if (g.root?.cwd === cwd) {
            const sub = g.children.length ? '根目录' : '';
            const label = sub ? `${g.folderName} · ${sub} · ${scriptName}` : `${g.folderName} · ${scriptName}`;
            return { projectName: g.folderName, subName: sub, scriptName, label, category: g.category };
        }
        for (const child of g.children) {
            if (child.cwd === cwd) {
                const label = `${g.folderName} · ${child.name} · ${scriptName}`;
                return {
                    projectName: g.folderName,
                    subName: child.name,
                    scriptName,
                    label,
                    category: g.category,
                };
            }
        }
    }

    const base = cwd.split('/').pop() || cwd;
    return {
        projectName: base,
        subName: '',
        scriptName,
        label: `${base} · ${scriptName}`,
        category: '',
    };
}

/**
 * 收集分组内全部 taskId
 * @param {ProjectGroup} group
 */
export function collectGroupTaskIds(group) {
    const ids = [];
    for (const item of collectSubProjects(group)) {
        for (const s of item.sub.scripts) {
            ids.push(makeTaskId(item.sub.cwd, s.name));
        }
    }
    return ids;
}
