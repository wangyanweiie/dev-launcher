/**
 * 当前 Tab 下「未列入」目录的展示（无 dev/serve 脚本等）
 */

import { scanSkipped, searchQuery } from './state.js';
import { sortByFolderNameFirstLetter } from './sort.js';
import { escapeHtml } from './utils.js';

/**
 * @param {{ folderName: string; category: string; reason: string }} item
 * @param {string} query
 */
function skippedMatchesFilter(item, query) {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return item.folderName.toLowerCase().includes(q);
}

/**
 * 渲染指定分类下的未列入提示 HTML
 * @param {string} category - App / Pc
 */
export function renderSkippedPanelHtml(category) {
    const items = scanSkipped
        .filter((s) => s.category === category)
        .filter((s) => skippedMatchesFilter(s, searchQuery));

    if (!items.length) return '';

    const rows = sortByFolderNameFirstLetter(items)
        .map(
            (s) => `<li class="scan-skipped-item">
                <span class="scan-skipped-name">${escapeHtml(s.folderName)}</span>
                <span class="scan-skipped-reason">${escapeHtml(s.reason)}</span>
            </li>`,
        )
        .join('');

    return `<aside class="scan-skipped-panel" aria-label="未列入启动列表的目录">
        <p class="scan-skipped-lead">以下目录在扫描目录中，但未配置可启动的 <code>dev</code> / <code>serve</code> 脚本，故未显示在上方列表。</p>
        <ul class="scan-skipped-list">${rows}</ul>
    </aside>`;
}

/**
 * 某分类下未列入数量（不受搜索过滤，用于 Tab 角标）
 * @param {string} category
 */
export function countSkippedInCategory(category) {
    return scanSkipped.filter((s) => s.category === category).length;
}
