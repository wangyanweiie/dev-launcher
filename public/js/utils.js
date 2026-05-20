/**
 * 通用工具函数
 */

/**
 * 规范化路径（与后端 path.resolve 对齐，去掉末尾 /）
 * @param {string} cwd
 */
export function normalizeCwd(cwd) {
    if (!cwd) return cwd;
    let p = cwd.replace(/\\/g, '/');
    while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p;
}

/**
 * 生成任务 ID
 * @param {string} cwd
 * @param {string} scriptName
 */
export function makeTaskId(cwd, scriptName) {
    return `${normalizeCwd(cwd)}::${scriptName}`;
}

/**
 * 解析任务 ID
 * @param {string} id
 */
export function parseTaskId(id) {
    const idx = id.lastIndexOf('::');
    return {
        cwd: id.slice(0, idx),
        scriptName: id.slice(idx + 2),
    };
}

/**
 * 默认配置存储 key
 * @param {string} groupId
 * @param {string} [instanceId]
 */
export function makeDefaultKey(groupId, instanceId = '') {
    if (!instanceId) return groupId;
    return `${groupId}::${instanceId}`;
}

/**
 * HTML 转义
 * @param {string} s
 */
export function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
