/**
 * APP / PC 分类 Tab
 */

import { tabsEl, listEl, servicesTabsEl } from './dom.js';
import { collectSubProjects } from './project.js';
import { renderProjectGroup } from './render.js';
import {
    activeCategory,
    allGroups,
    categories,
    statuses,
} from './state.js';
import { groupMatchesFilter } from './filter.js';
import { searchQuery } from './state.js';
import { countSkippedInCategory, renderSkippedPanelHtml } from './skipped.js';
import { sortGroupsByFirstLetter } from './sort.js';
import { escapeHtml, makeTaskId } from './utils.js';
import { groupHasOrphanRunning } from './orphan-sync.js';

/** @typedef {import('./types.js').ProjectGroup} ProjectGroup */

/**
 * Tab 显示名
 * @param {string} category
 */
export function categoryTabLabel(category) {
    if (category === 'App') return 'APP';
    if (category === 'Pc') return 'PC';
    return category;
}

/**
 * 分组是否有运行中任务
 * @param {ProjectGroup} group
 */
export function groupHasRunning(group) {
    if (groupHasOrphanRunning(group)) return true;
    for (const item of collectSubProjects(group)) {
        for (const s of item.sub.scripts) {
            const st = statuses[makeTaskId(item.sub.cwd, s.name)];
            if (st === 'running' || st === 'crashed') return true;
        }
    }
    return false;
}

/**
 * 选择默认 Tab
 */
export function pickDefaultCategory() {
    for (const cat of categories) {
        if (allGroups.filter((g) => g.category === cat).some(groupHasRunning)) {
            return cat;
        }
    }
    return categories[0] ?? 'App';
}

/**
 * 分类下运行中项目数
 * @param {string} category
 */
export function countRunningInCategory(category) {
    return allGroups.filter((g) => g.category === category).filter(groupHasRunning).length;
}

/**
 * 渲染 Tab 栏
 */
export function renderCategoryTabs() {
    if (!tabsEl || categories.length < 2) {
        if (tabsEl) tabsEl.hidden = true;
        return;
    }

    tabsEl.hidden = false;
    tabsEl.innerHTML = categories
        .map((cat) => {
            const count = allGroups.filter((g) => g.category === cat).length;
            const skippedN = countSkippedInCategory(cat);
            const running = countRunningInCategory(cat) > 0;
            const active = cat === activeCategory ? ' active' : '';
            const runningMark = running
                ? '<span class="tab-running-dot" title="有运行中项目"></span>'
                : '';
            const skippedMark =
                skippedN > 0
                    ? `<span class="tab-skipped-hint" title="${skippedN} 个目录未列入">+${skippedN}</span>`
                    : '';
            return `<button type="button" class="category-tab${active}" data-tab="${escapeHtml(cat)}"
                role="tab" aria-selected="${cat === activeCategory}">
                ${categoryTabLabel(cat)}
                <span class="tab-count">${count}</span>
                ${skippedMark}
                ${runningMark}
            </button>`;
        })
        .join('');
}

/**
 * 同步单个 Tab 栏的选中态与运行指示
 * @param {HTMLElement | null} container
 */
function syncCategoryTabBar(container) {
    if (!container || container.hidden) return;
    container.querySelectorAll('[data-tab]').forEach((btn) => {
        const cat = btn.getAttribute('data-tab');
        if (!cat) return;
        btn.classList.toggle('active', cat === activeCategory);
        btn.setAttribute('aria-selected', String(cat === activeCategory));
        let dot = btn.querySelector('.tab-running-dot');
        const running = countRunningInCategory(cat) > 0;
        if (running && !dot) {
            dot = document.createElement('span');
            dot.className = 'tab-running-dot';
            dot.title = '有运行中项目';
            btn.appendChild(dot);
        } else if (!running && dot) {
            dot.remove();
        }
    });
}

/**
 * 仅更新 Tab 指示器（主列表 + 侧栏服务）
 */
export function updateCategoryTabIndicators() {
    syncCategoryTabBar(tabsEl);
    syncCategoryTabBar(servicesTabsEl);
}

/**
 * 渲染当前 Tab 项目列表 HTML（事件绑定由 api 层负责）
 */
export function renderActiveCategoryListHtml() {
    const inCategory = allGroups.filter((g) => g.category === activeCategory);
    const filtered = inCategory.filter((g) => groupMatchesFilter(g, searchQuery));
    const skippedHtml = renderSkippedPanelHtml(activeCategory);

    if (!inCategory.length) {
        listEl.innerHTML =
            skippedHtml ||
            `<p class="list-empty-hint">「${categoryTabLabel(activeCategory)}」下未找到含 dev/serve 脚本的项目</p>`;
        return;
    }

    if (!filtered.length) {
        listEl.innerHTML =
            `<p class="list-empty-hint">没有匹配「${escapeHtml(searchQuery)}」的项目</p>` +
            skippedHtml;
        return;
    }

    listEl.innerHTML =
        sortGroupsByFirstLetter(filtered).map(renderProjectGroup).join('') + skippedHtml;
}
