/**
 * 默认配置模块
 * 读写项目根目录 defaults.json，持久化各项目的默认子项目与脚本
 */

import fs from 'node:fs';
import path from 'node:path';
import { getModuleDir, getProjectRoot } from './paths.js';

/** 单个项目的默认启动配置 */
export interface ProjectDefault {
    /** 子项目 cwd；单子项目时与 group 内唯一 cwd 一致 */
    subKey: string;
    /** 默认脚本名，如 dev */
    script: string;
}

/** 以 defaultKey(groupId, instanceId) 为 key 的默认配置表 */
export type DefaultsMap = Record<string, ProjectDefault>;

/**
 * 生成默认配置存储 key（原项目与副本区分）
 * @param groupId - 项目根路径
 * @param instanceId - 副本 ID，空表示原项目
 */
export function defaultKey(groupId: string, instanceId = ''): string {
    if (!instanceId) return groupId;
    return `${groupId}::${instanceId}`;
}

/** defaults.json 绝对路径 */
const DEFAULTS_FILE = path.join(getProjectRoot(getModuleDir(import.meta.url)), 'defaults.json');

/**
 * 获取默认配置文件路径
 */
export function getDefaultsPath(): string {
    return DEFAULTS_FILE;
}

/**
 * 读取全部默认配置
 */
export function readDefaults(): DefaultsMap {
    try {
        if (!fs.existsSync(DEFAULTS_FILE)) return {};
        const raw = JSON.parse(fs.readFileSync(DEFAULTS_FILE, 'utf8')) as DefaultsMap;
        return raw && typeof raw === 'object' ? raw : {};
    } catch {
        return {};
    }
}

/**
 * 将默认配置写入 defaults.json（按 key 排序）
 * @param defaults - 完整配置表
 */
export function writeDefaults(defaults: DefaultsMap): void {
    const sorted = Object.keys(defaults)
        .sort()
        .reduce<DefaultsMap>((acc, key) => {
            acc[key] = defaults[key];
            return acc;
        }, {});

    fs.writeFileSync(DEFAULTS_FILE, JSON.stringify(sorted, null, 4) + '\n', 'utf8');
}

/**
 * 保存或更新单个项目实例的默认配置
 * @param groupId - 项目根路径（ProjectGroup.id）
 * @param entry - 默认子项目与脚本
 * @param instanceId - 副本 ID，空表示原项目
 */
export function setProjectDefault(
    groupId: string,
    entry: ProjectDefault,
    instanceId = '',
): DefaultsMap {
    const defaults = readDefaults();
    defaults[defaultKey(groupId, instanceId)] = entry;
    writeDefaults(defaults);
    return defaults;
}

/**
 * 删除指定实例的默认配置
 * @param groupId - 项目根路径
 * @param instanceId - 副本 ID
 */
export function deleteProjectDefault(groupId: string, instanceId: string): DefaultsMap {
    const defaults = readDefaults();
    delete defaults[defaultKey(groupId, instanceId)];
    writeDefaults(defaults);
    return defaults;
}
