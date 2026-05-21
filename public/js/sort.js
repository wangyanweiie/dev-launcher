/**
 * 按名称首字母排序（中文按拼音区域，locale zh-CN）
 */

const SORT_LOCALE = 'zh-CN';

/**
 * @param {string} name
 */
export function firstLetterSortKey(name) {
    return (name || '').trim();
}

/**
 * @param {string} a
 * @param {string} b
 */
export function compareByFirstLetter(a, b) {
    return firstLetterSortKey(a).localeCompare(firstLetterSortKey(b), SORT_LOCALE, {
        sensitivity: 'base',
    });
}

/**
 * @param {import('./types.js').ProjectGroup[]} groups
 */
export function sortGroupsByFirstLetter(groups) {
    return [...groups].sort((a, b) => compareByFirstLetter(a.folderName, b.folderName));
}

/**
 * @param {{ folderName: string }}[] items
 */
export function sortByFolderNameFirstLetter(items) {
    return [...items].sort((a, b) => compareByFirstLetter(a.folderName, b.folderName));
}
