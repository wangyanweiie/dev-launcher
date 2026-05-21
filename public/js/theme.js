/**
 * 日间 / 夜间主题切换（localStorage 持久化）
 */

const STORAGE_KEY = 'dl-theme';

/** @typedef {'light' | 'dark'} ThemeId */

/**
 * @returns {ThemeId}
 */
export function getTheme() {
    const t = document.documentElement.getAttribute('data-theme');
    return t === 'light' ? 'light' : 'dark';
}

/**
 * @param {ThemeId} theme
 */
export function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    syncThemeToggleUi();
}

/** 在日间与夜间之间切换 */
export function toggleTheme() {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

/**
 * 同步切换按钮文案与图标
 */
export function syncThemeToggleUi() {
    const btn = document.getElementById('btn-theme-toggle');
    if (!btn) return;
    const isLight = getTheme() === 'light';
    btn.setAttribute('aria-pressed', String(isLight));
    btn.title = isLight ? '切换到夜间模式' : '切换到日间模式';
    btn.setAttribute('aria-label', btn.title);
    const label = btn.querySelector('.theme-toggle-label');
    if (label) label.textContent = isLight ? '夜间' : '日间';
}

/**
 * 读取已保存主题（head 内联脚本已抢先应用时可只做 UI 同步）
 */
export function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
        document.documentElement.setAttribute('data-theme', saved);
    } else if (!document.documentElement.getAttribute('data-theme')) {
        const preferLight = window.matchMedia('(prefers-color-scheme: light)').matches;
        document.documentElement.setAttribute('data-theme', preferLight ? 'light' : 'dark');
    }
    syncThemeToggleUi();
}

/**
 * 绑定顶栏主题切换按钮
 */
export function bindThemeToggle() {
    const btn = document.getElementById('btn-theme-toggle');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', toggleTheme);
    syncThemeToggleUi();
}
