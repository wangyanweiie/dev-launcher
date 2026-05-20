/**
 * DOM 元素引用
 */

/** @param {string} sel - 选择器 */
export const $ = (sel) => document.querySelector(sel);

/** 分类 Tab 容器 */
export const tabsEl = $('#category-tabs');

/** 项目列表容器 */
export const listEl = $('#project-list');

/** 加载提示 */
export const loadingEl = $('#loading');

/** 日志内容区 */
export const logBody = $('#log-body');

/** 日志标题 */
export const logTitle = $('#log-title');

/** 侧边栏 */
export const sidebarPanelEl = $('#sidebar-panel');

/** 服务面板 */
export const servicesPanelEl = $('#services-panel');

/** 运行中服务列表 */
export const managedListEl = $('#managed-list');

/** 历史服务列表 */
export const historyListEl = $('#history-list');

/** 历史服务区块 */
export const historySectionEl = $('#services-section-history');

/** @deprecated */
export const servicesListEl = managedListEl;

/** @deprecated */
export const servicesCountEl = $('#managed-count');

/** 项目搜索框 */
export const projectSearchEl = $('#project-search');
