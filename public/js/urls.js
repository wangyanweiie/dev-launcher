/**
 * 任务多地址展示（如 xmart-web 同时有 8888 与 5173）
 * 回环地址会附带无线网 IPv4（localhost 在上、Wi-Fi IP 在下）
 */

import { escapeHtml } from './utils.js';

/** 无线网 IPv4（来自 /api/config localHosts，仅 Wi-Fi 不含有线/全部网卡） */
/** @type {string[]} */
let localHosts = [];

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

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
 * @param {string[]} hosts
 */
export function setLocalHosts(hosts) {
    localHosts = [...new Set((hosts || []).filter((h) => typeof h === 'string' && h))];
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
 * @param {string} host
 */
function isLoopbackHost(host) {
    const h = host.toLowerCase();
    return LOOPBACK_HOSTS.has(h) || h === '::1';
}

/**
 * @param {string} url
 * @param {string} host
 */
function replaceUrlHost(url, host) {
    const u = new URL(url);
    if (host.includes(':')) {
        u.hostname = `[${host}]`;
    } else {
        u.hostname = host;
    }
    return u.href;
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
 * 单条 URL：localhost 在上，本机 IP 在下（非回环地址仅一行）
 * @param {string} url
 * @param {string} linkClass
 */
function renderUrlAccessGroupHtml(url, linkClass) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return `<a class="${linkClass}" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`;
    }

    if (!isLoopbackHost(parsed.hostname)) {
        const href = parsed.href;
        return `<a class="${linkClass}" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(href)}</a>`;
    }

    const localhostUrl = replaceUrlHost(url, 'localhost');
    const lines = [
        `<a class="${linkClass}" href="${escapeHtml(localhostUrl)}" target="_blank" rel="noopener">${escapeHtml(localhostUrl)}</a>`,
    ];

    for (const ip of localHosts) {
        const lanUrl = replaceUrlHost(url, ip);
        lines.push(
            `<a class="${linkClass} url-access-lan" href="${escapeHtml(lanUrl)}" target="_blank" rel="noopener">${escapeHtml(lanUrl)}</a>`,
        );
    }

    return `<div class="url-access-group">${lines.join('')}</div>`;
}

/**
 * @param {string[]} urls
 * @param {string} [linkClass]
 */
export function renderUrlLinksHtml(urls, linkClass = 'service-url') {
    const sorted = sortDevUrls(normalizeTaskUrls(urls));
    if (!sorted.length) return '';
    return sorted.map((u) => renderUrlAccessGroupHtml(u, linkClass)).join('');
}
