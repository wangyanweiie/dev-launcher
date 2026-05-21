/**
 * 任务多地址展示（如 xmart-web 同时有 8888 与 5173）
 */

import { escapeHtml } from './utils.js';

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeTaskUrls(value) {
    if (Array.isArray(value)) {
        return [...new Set(value.filter((u) => typeof u === 'string' && u))];
    }
    if (typeof value === 'string' && value) return [value];
    return [];
}

/**
 * @param {string} url
 * @returns {number | null}
 */
export function portFromUrlClient(url) {
    try {
        const p = new URL(url).port;
        return p ? Number(p) : null;
    } catch {
        return null;
    }
}

/**
 * Vite 开发端口优先，其余按端口号升序
 * @param {string[]} urls
 */
export function sortDevUrls(urls) {
    return [...urls].sort((a, b) => {
        const pa = portFromUrlClient(a) ?? 0;
        const pb = portFromUrlClient(b) ?? 0;
        const aVite = pa >= 5173 && pa <= 5199;
        const bVite = pb >= 5173 && pb <= 5199;
        if (aVite && !bVite) return -1;
        if (!aVite && bVite) return 1;
        return pa - pb;
    });
}

/**
 * @param {string[]} urls
 * @param {string} [linkClass]
 */
export function renderUrlLinksHtml(urls, linkClass = 'service-url') {
    const sorted = sortDevUrls(normalizeTaskUrls(urls));
    if (!sorted.length) return '';
    return sorted
        .map(
            (u) =>
                `<a class="${linkClass}" href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(u)}</a>`,
        )
        .join('');
}
