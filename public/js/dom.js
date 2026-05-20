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

/** 运行中服务列表 */
export const servicesListEl = $('#services-list');

/** 运行中服务数量 */
export const servicesCountEl = $('#services-count');

/** 项目搜索框 */
export const projectSearchEl = $('#project-search');
