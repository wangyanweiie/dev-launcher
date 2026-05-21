/**
 * 全局共享状态
 */

import { normalizeTaskUrls } from './urls.js';

/** @typedef {import('./types.js').DevScript} DevScript */
/** @typedef {import('./types.js').SubProject} SubProject */
/** @typedef {import('./types.js').ProjectGroup} ProjectGroup */

/** 各任务运行状态 */
/** @type {Record<string, 'running' | 'stopped' | 'crashed'>} */
export let statuses = {};

/** 崩溃任务退出码 */
/** @type {Record<string, number>} */
export let taskExitCodes = {};

/** 扫描根目录下的历史/外部监听服务（API 原始列表） */
/** @type {import('./types.js').OrphanService[]} */
export let orphanServices = [];

/** 无法匹配左侧列表、仅展示在历史区块的服务 */
/** @type {import('./types.js').OrphanService[]} */
export let historyOrphans = [];

/**
 * 已匹配左侧子项目的 cwd → 端口与 URL（Launcher 未托管的运行中进程）
 * @type {Record<string, { urls: string[]; ports: number[] }>}
 */
export let orphanRunningByCwd = {};

/** 扫描错误信息 */
export let scanError = null;

/** 扫描到但未列入的项目（如无 dev/serve 脚本） */
/** @type {{ folderName: string; category: string; rootPath: string; reason: string }[]} */
export let scanSkipped = [];

/** 搜索关键词 */
export let searchQuery = '';

/** 服务区块折叠：managed=运行中，history=历史 */
export const servicesSectionCollapsed = {
    managed: false,
    history: false,
};

/** 各任务本地访问地址（可多端口） */
/** @type {Record<string, string[]>} */
export let taskUrls = {};

/** 默认配置 */
/** @type {Record<string, { subKey: string; script: string }>} */
export let projectDefaults = {};

/** 项目副本列表 */
/** @type {Record<string, import('./types.js').ProjectInstance[]>} */
export let projectInstances = {};

/** 当前日志聚焦任务 */
export let activeLogTask = null;

/** 日志缓冲 */
/** @type {{ taskId: string; line: string }[]} */
export const logLines = [];

/** 日志最大行数 */
export const MAX_LOG = 500;

/** 用户手动展开的项目 */
export const userExpanded = new Set();

/** 用户手动折叠的项目 */
export const userCollapsed = new Set();

/** 全部项目分组 */
/** @type {import('./types.js').ProjectGroup[]} */
export let allGroups = [];

/** 当前 Tab 分类 */
export let activeCategory = 'App';

/**
 * 设置当前 Tab
 * @param {string} category
 */
export function setActiveCategory(category) {
    activeCategory = category;
}

/**
 * 设置当前日志任务
 * @param {string | null} taskId
 */
export function setActiveLogTask(taskId) {
    activeLogTask = taskId;
}

/** 分类列表 */
/** @type {string[]} */
export let categories = ['App', 'Pc'];

/**
 * 批量更新任务状态相关数据
 * @param {object} data - API 返回片段
 */
/**
 * 设置搜索词
 * @param {string} q
 */
export function setSearchQuery(q) {
    searchQuery = q;
}

export function applyProjectsPayload(data) {
    statuses = data.statuses || {};
    taskExitCodes = data.exitCodes || {};
    taskUrls = {};
    for (const [id, val] of Object.entries(data.urls || {})) {
        taskUrls[id] = normalizeTaskUrls(val);
    }
    projectDefaults = data.defaults || {};
    projectInstances = data.instances || {};
    allGroups = data.groups || [];
    scanSkipped = data.skipped || [];
    orphanServices = data.orphans || [];
    scanError = data.scanError || null;
    if (data.running) {
        for (const t of data.running) {
            statuses[t.taskId] = 'running';
            if (t.urls?.length) taskUrls[t.taskId] = normalizeTaskUrls(t.urls);
            else if (t.url) taskUrls[t.taskId] = normalizeTaskUrls(t.url);
        }
    }
}
