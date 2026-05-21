/**
 * 侧栏三块动态高度：运行中服务、Company 历史服务、日志
 * - 其它块折叠时，展开块占满可用高度
 * - 等分场景：某项内容不足份额则用原高度，结余均匀补给超出份额的项
 */

import {
    historySectionEl,
    logBody,
    logPanelEl,
    managedListEl,
    historyListEl,
    sidebarPanelEl,
} from './dom.js';
import { servicesSectionCollapsed } from './state.js';

const MIN_BODY_PX = 56;
const DEFAULT_HEADER_PX = 36;

let rafId = 0;

/**
 * @typedef {object} SidebarPane
 * @property {string} id
 * @property {boolean} expanded
 * @property {HTMLElement | null} sectionEl
 * @property {HTMLElement | null} headerEl
 * @property {HTMLElement | null} bodyEl
 * @property {HTMLElement | null} scrollEl
 */

/**
 * 侧栏可用高度（视口减去顶栏）
 */
function getSidebarViewportHeight() {
    const headerEl = document.querySelector('.header');
    const headerH = headerEl?.getBoundingClientRect().height ?? 0;
    return Math.max(160, window.innerHeight - headerH);
}

/**
 * @param {HTMLElement | null} el
 */
function measureHeader(el) {
    if (!el) return DEFAULT_HEADER_PX;
    return el.getBoundingClientRect().height || DEFAULT_HEADER_PX;
}

/**
 * @param {HTMLElement | null} scrollEl
 */
function measureContentWant(scrollEl) {
    if (!scrollEl) return 0;
    const prevMax = scrollEl.style.maxHeight;
    const prevH = scrollEl.style.height;
    scrollEl.style.maxHeight = 'none';
    scrollEl.style.height = 'auto';
    const want = scrollEl.scrollHeight;
    scrollEl.style.maxHeight = prevMax;
    scrollEl.style.height = prevH;
    return want;
}

/**
 * @param {number} budget
 * @param {number[]} weights
 */
function distributeByWeight(budget, weights) {
    const n = weights.length;
    if (n === 0) return [];
    if (n === 1) return [Math.max(MIN_BODY_PX, budget)];

    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const raw = weights.map((w) => Math.max(MIN_BODY_PX, Math.floor((budget * w) / sum)));
    let used = raw.reduce((a, b) => a + b, 0);
    let i = 0;
    while (used > budget && i < n) {
        if (raw[i] > MIN_BODY_PX) {
            raw[i] -= 1;
            used -= 1;
        }
        i += 1;
    }
    i = 0;
    while (used < budget && i < n) {
        raw[i] += 1;
        used += 1;
        i = (i + 1) % n;
    }
    return raw;
}

/**
 * @param {number} budget
 * @param {number} count
 */
function distributeEqual(budget, count) {
    if (count <= 0) return [];
    if (count === 1) return [Math.max(MIN_BODY_PX, budget)];
    const base = Math.max(MIN_BODY_PX, Math.floor(budget / count));
    const heights = Array.from({ length: count - 1 }, () => base);
    heights.push(Math.max(MIN_BODY_PX, budget - base * (count - 1)));
    return heights;
}

/**
 * 自然高度（空列表时保留最小可视高度）
 * @param {number} want
 */
function naturalBodyHeight(want) {
    if (want <= 0) return MIN_BODY_PX;
    return Math.ceil(want);
}

/**
 * 等分预算：内容不足当前份额的用原高度，结余均匀分给仍超出份额的项（可多轮）
 * @param {number} budget
 * @param {number[]} wants
 */
function allocateFlexibleEqual(budget, wants) {
    const n = wants.length;
    if (n === 0) return [];
    if (n === 1) {
        return [Math.max(MIN_BODY_PX, Math.min(naturalBodyHeight(wants[0]), budget))];
    }

    const heights = new Array(n).fill(0);
    /** @type {{ i: number, want: number }[]} */
    let pending = wants.map((want, i) => ({ i, want: Math.max(0, want) }));
    let remainingBudget = budget;

    while (pending.length > 0) {
        const share = remainingBudget / pending.length;
        const fits = pending.filter((p) => p.want <= share + 0.5);

        if (fits.length === 0) {
            const parts = distributeEqual(remainingBudget, pending.length);
            pending.forEach((p, j) => {
                heights[p.i] = parts[j];
            });
            break;
        }

        const fitIds = new Set(fits.map((p) => p.i));
        for (const p of fits) {
            const h = naturalBodyHeight(p.want);
            heights[p.i] = h;
            remainingBudget -= h;
        }
        pending = pending.filter((p) => !fitIds.has(p.i));
    }

    let sum = heights.reduce((a, b) => a + b, 0);
    let leftover = budget - sum;
    if (leftover > 0) {
        const overflow = wants
            .map((want, i) => ({ i, want, room: Math.max(0, want - heights[i]) }))
            .filter((p) => p.room > 0.5);

        while (leftover > 0 && overflow.length > 0) {
            const addEach = Math.max(1, Math.floor(leftover / overflow.length));
            let consumed = 0;
            for (const p of overflow) {
                const add = Math.min(addEach, p.room, leftover - consumed);
                if (add <= 0) continue;
                heights[p.i] += add;
                p.room -= add;
                consumed += add;
            }
            leftover -= consumed;
            for (let k = overflow.length - 1; k >= 0; k--) {
                if (overflow[k].room <= 0.5) overflow.splice(k, 1);
            }
            if (consumed === 0) break;
        }

        if (leftover > 0) {
            const scrollers = wants
                .map((_, i) => i)
                .filter((i) => heights[i] < wants[i] - 0.5);
            const targets = scrollers.length ? scrollers : wants.map((_, i) => i);
            let t = 0;
            while (leftover > 0 && targets.length > 0) {
                heights[targets[t % targets.length]] += 1;
                leftover -= 1;
                t += 1;
            }
        }
    }

    sum = heights.reduce((a, b) => a + b, 0);
    if (sum > budget) {
        return distributeEqual(budget, n);
    }

    return heights.map((h) => Math.max(MIN_BODY_PX, h));
}

/**
 * @param {SidebarPane[]} expanded
 * @param {number} bodyBudget
 */
function allocateBodyHeights(expanded, bodyBudget) {
    const n = expanded.length;
    if (n === 0) return [];

    if (n === 1) {
        return [Math.max(MIN_BODY_PX, bodyBudget)];
    }

    const wants = expanded.map((p) => measureContentWant(p.scrollEl));
    const totalWant = wants.reduce((a, b) => a + b, 0);

    if (totalWant <= bodyBudget) {
        const heights = wants.map((w) => naturalBodyHeight(w));
        let leftover = bodyBudget - heights.reduce((a, b) => a + b, 0);
        const logIdx = expanded.findIndex((p) => p.id === 'log');
        const growIdx = logIdx >= 0 ? logIdx : n - 1;
        heights[growIdx] += leftover;
        return heights;
    }

    if (n === 2 || n === 3) {
        return allocateFlexibleEqual(bodyBudget, wants);
    }

    return distributeByWeight(
        bodyBudget,
        wants.map((w) => Math.max(w, MIN_BODY_PX)),
    );
}

/**
 * @param {SidebarPane} pane
 * @param {number | null} bodyMax
 */
function applyPaneBodyLayout(pane, bodyMax) {
    if (!pane.bodyEl || !pane.scrollEl) return;

    if (bodyMax == null) {
        pane.bodyEl.style.maxHeight = '';
        pane.bodyEl.style.overflow = '';
        pane.scrollEl.style.maxHeight = '';
        pane.scrollEl.style.height = '';
        pane.scrollEl.style.overflowY = '';
        return;
    }

    const h = Math.max(MIN_BODY_PX, Math.floor(bodyMax));
    pane.bodyEl.style.maxHeight = `${h}px`;
    pane.bodyEl.style.overflow = 'hidden';
    pane.scrollEl.style.maxHeight = `${h}px`;
    pane.scrollEl.style.height = `${h}px`;
    pane.scrollEl.style.overflowY = 'auto';
}

/**
 * @param {SidebarPane} pane
 */
function clearPaneBodyLayout(pane) {
    applyPaneBodyLayout(pane, null);
}

/** 收集侧栏三个分区 */
function getSidebarPanes() {
    const managedSection = document.getElementById('services-section-managed');
    const historyVisible = historySectionEl && !historySectionEl.hidden;

    /** @type {SidebarPane[]} */
    const panes = [
        {
            id: 'managed',
            expanded: !servicesSectionCollapsed.managed,
            sectionEl: managedSection,
            headerEl: managedSection?.querySelector('.services-section-toggle') ?? null,
            bodyEl: managedSection?.querySelector('.services-section-body') ?? null,
            scrollEl: managedListEl,
        },
        {
            id: 'history',
            expanded: historyVisible && !servicesSectionCollapsed.history,
            sectionEl: historySectionEl,
            headerEl: historySectionEl?.querySelector('.services-section-toggle') ?? null,
            bodyEl: historySectionEl?.querySelector('.services-section-body') ?? null,
            scrollEl: historyListEl,
        },
        {
            id: 'log',
            expanded: !logPanelEl?.classList.contains('collapsed'),
            sectionEl: logPanelEl,
            headerEl: logPanelEl?.querySelector('.log-header-bar') ?? null,
            bodyEl: logBody,
            scrollEl: logBody,
        },
    ];

    return panes.filter((p) => {
        if (p.id === 'history' && historySectionEl?.hidden) return false;
        return p.sectionEl;
    });
}

/**
 * 更新侧栏三块高度分配
 */
export function updateSidebarLogLayout() {
    if (!sidebarPanelEl) return;

    const viewportH = getSidebarViewportHeight();
    sidebarPanelEl.style.height = `${viewportH}px`;
    sidebarPanelEl.style.maxHeight = `${viewportH}px`;
    sidebarPanelEl.style.overflow = 'hidden';

    const panes = getSidebarPanes();
    const expanded = panes.filter((p) => p.expanded);
    const collapsed = panes.filter((p) => !p.expanded);

    for (const p of panes) {
        clearPaneBodyLayout(p);
    }

    let used = 0;
    for (const p of collapsed) {
        used += measureHeader(p.headerEl);
    }
    for (const p of expanded) {
        used += measureHeader(p.headerEl);
    }

    let bodyBudget = Math.max(0, viewportH - used);
    const bodyHeights = allocateBodyHeights(expanded, bodyBudget);

    expanded.forEach((pane, i) => {
        applyPaneBodyLayout(pane, bodyHeights[i] ?? MIN_BODY_PX);
    });

    if (logPanelEl) {
        const logExpanded = expanded.some((p) => p.id === 'log');
        logPanelEl.style.flex = logExpanded ? '1 1 0' : '0 0 auto';
        logPanelEl.style.minHeight = logExpanded ? '0' : '';
    }
}

/**
 * 在下一帧合并多次布局请求
 */
export function scheduleSidebarLogLayout() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
        rafId = 0;
        updateSidebarLogLayout();
    });
}

let observersBound = false;

/**
 * 监听窗口与各区块内容变化
 */
export function bindSidebarLogLayout() {
    if (observersBound) return;
    observersBound = true;

    window.addEventListener('resize', scheduleSidebarLogLayout);

    const ro = new ResizeObserver(scheduleSidebarLogLayout);
    if (sidebarPanelEl) ro.observe(sidebarPanelEl);
    if (managedListEl) ro.observe(managedListEl);
    if (historyListEl) ro.observe(historyListEl);
    if (logBody) ro.observe(logBody);

    const headerEl = document.querySelector('.header');
    if (headerEl) ro.observe(headerEl);

    scheduleSidebarLogLayout();
}
