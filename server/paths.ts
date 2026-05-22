/**
 * 仓库根目录解析：兼容 server/ 直跑与 dist/server/ 编译启动
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @param importMetaUrl - 当前模块的 import.meta.url
 */
export function getModuleDir(importMetaUrl: string): string {
    return path.dirname(fileURLToPath(importMetaUrl));
}

/**
 * 解析 dev-launcher 根目录（config.json、public/、defaults.json 所在目录）
 * @param moduleDirname - 当前文件所在目录（通常为 server 或 dist/server）
 */
export function getProjectRoot(moduleDirname: string): string {
    const parent = path.resolve(moduleDirname, '..');
    if (path.basename(parent) === 'dist') {
        return path.resolve(parent, '..');
    }
    return parent;
}
