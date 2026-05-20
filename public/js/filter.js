/**
 * 项目列表搜索过滤
 */

/** @typedef {import('./types.js').ProjectGroup} ProjectGroup */

/**
 * 分组是否匹配搜索词
 * @param {ProjectGroup} group
 * @param {string} query
 */
export function groupMatchesFilter(group, query) {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    if (group.folderName.toLowerCase().includes(q)) return true;
    if (group.root?.name.toLowerCase().includes(q)) return true;
    if (group.root?.packageName.toLowerCase().includes(q)) return true;
    for (const child of group.children) {
        if (child.name.toLowerCase().includes(q)) return true;
        if (child.packageName.toLowerCase().includes(q)) return true;
    }
    return false;
}
