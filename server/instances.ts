/**
 * 项目副本模块
 * 多子项目文件夹可创建副本卡片，便于同时运行不同子项目；数据持久化到 instances.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { getModuleDir, getProjectRoot } from './paths.js';
import { defaultKey, deleteProjectDefault } from './defaults.js';

/** 单个副本记录 */
export interface ProjectInstance {
    /** 副本唯一 ID，如 c-1703123456789-a1b2 */
    instanceId: string;
    /** 创建时间戳 */
    createdAt: number;
}

/** 以项目根路径 groupId 为 key 的副本列表 */
export type InstancesMap = Record<string, ProjectInstance[]>;

/** instances.json 绝对路径 */
const INSTANCES_FILE = path.join(
    getProjectRoot(getModuleDir(import.meta.url)),
    'instances.json',
);

/**
 * 生成副本 ID
 */
function newInstanceId(): string {
    return `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 读取全部副本配置
 */
export function readInstances(): InstancesMap {
    try {
        if (!fs.existsSync(INSTANCES_FILE)) return {};
        const raw = JSON.parse(fs.readFileSync(INSTANCES_FILE, 'utf8')) as InstancesMap;
        return raw && typeof raw === 'object' ? raw : {};
    } catch {
        return {};
    }
}

/**
 * 写入 instances.json
 * @param instances - 完整副本表
 */
function writeInstances(instances: InstancesMap): void {
    const sorted = Object.keys(instances)
        .sort()
        .reduce<InstancesMap>((acc, key) => {
            acc[key] = instances[key];
            return acc;
        }, {});

    fs.writeFileSync(INSTANCES_FILE, JSON.stringify(sorted, null, 4) + '\n', 'utf8');
}

/**
 * 为指定项目创建副本
 * @param groupId - 项目根路径
 */
export function addInstance(groupId: string): ProjectInstance {
    const instances = readInstances();
    const list = instances[groupId] ?? [];
    const entry: ProjectInstance = {
        instanceId: newInstanceId(),
        createdAt: Date.now(),
    };
    list.push(entry);
    instances[groupId] = list;
    writeInstances(instances);
    return entry;
}

/**
 * 删除副本及其默认配置
 * @param groupId - 项目根路径
 * @param instanceId - 副本 ID
 */
export function removeInstance(groupId: string, instanceId: string): boolean {
    const instances = readInstances();
    const list = instances[groupId];
    if (!list?.length) return false;

    const next = list.filter((i) => i.instanceId !== instanceId);
    if (next.length === list.length) return false;

    if (next.length === 0) {
        delete instances[groupId];
    } else {
        instances[groupId] = next;
    }
    writeInstances(instances);
    deleteProjectDefault(groupId, instanceId);
    return true;
}
