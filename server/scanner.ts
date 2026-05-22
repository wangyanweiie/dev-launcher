/**
 * 项目扫描模块
 * 扫描 Company 目录下的 monorepo / 单项目，提取 dev、serve 类脚本
 */

import fs from 'node:fs';
import path from 'node:path';

/** 包管理器类型 */
export type PackageManager = 'pnpm' | 'npm' | 'yarn';

/** package.json 中可运行的 dev/serve 脚本 */
export interface DevScript {
    /** 脚本名，如 dev、dev:h5 */
    name: string;
    /** 脚本命令内容 */
    command: string;
}

/** 可运行的子项目（对应一个 package.json） */
export interface SubProject {
    /** 唯一标识，通常为 cwd */
    id: string;
    /** 目录名 */
    name: string;
    /** package.json 中的 name 字段 */
    packageName: string;
    /** 工作目录绝对路径 */
    cwd: string;
    /** 过滤后的 dev/serve 脚本列表 */
    scripts: DevScript[];
    /** 检测到的包管理器 */
    packageManager: PackageManager;
}

/** 一个顶层项目文件夹（如 x-mart）及其子项目 */
export interface ProjectGroup {
    /** 唯一标识，为项目根路径 rootPath */
    id: string;
    /** 文件夹名 */
    folderName: string;
    /** 分类：App / Pc */
    category: string;
    /** 项目根目录绝对路径 */
    rootPath: string;
    /** 根目录可直接运行的脚本（无子项目或 monorepo 根级 dev） */
    root?: SubProject;
    /** apps/* 子项目（仅当根目录存在 apps/ 时）；为空表示单行项目 */
    children: SubProject[];
    /** 是否存在子项目 */
    hasChildren: boolean;
}

/** 扫描到但未列入列表的项目（通常缺少可运行脚本） */
export interface SkippedProject {
    folderName: string;
    category: string;
    rootPath: string;
    reason: string;
}

/** 全量扫描结果 */
export interface ScanResult {
    groups: ProjectGroup[];
    skipped: SkippedProject[];
}

/** config.json 配置结构 */
export interface LauncherConfig {
    /** 扫描根目录，如 /Users/lemon/Company */
    scanRoot: string;
    /** 要扫描的分类子目录 */
    categories: string[];
    /** Dev Launcher 自身监听端口 */
    port: number;
    /** 路径段包含这些目录名时忽略 */
    ignoreDirNames: string[];
    /** 路径包含这些片段时忽略 */
    ignorePathSegments: string[];
}

/** 匹配 dev、dev:*、serve、serve:* 脚本的正则 */
const DEV_SCRIPT_RE = /^(dev(?::|$)|serve(?::|$))/;

/**
 * 判断脚本名是否为 dev/serve 类
 * @param name - package.json scripts 的 key
 */
export function isDevScript(name: string): boolean {
    return DEV_SCRIPT_RE.test(name);
}

/**
 * @param filePath - 文件路径
 */
async function pathExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * @param dirPath - 目录路径
 */
async function isDirectory(dirPath: string): Promise<boolean> {
    try {
        const stat = await fs.promises.stat(dirPath);
        return stat.isDirectory();
    } catch {
        return false;
    }
}

/**
 * 安全读取 JSON 文件
 * @param filePath - 文件路径
 */
async function readJsonSafe(filePath: string): Promise<Record<string, unknown> | null> {
    try {
        const raw = await fs.promises.readFile(filePath, 'utf8');
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return null;
    }
}

/**
 * 根据配置判断路径是否应忽略
 * @param filePath - 待检查路径
 * @param ignoreDirNames - 忽略的目录名列表
 * @param ignorePathSegments - 忽略的路径片段列表
 */
function shouldIgnorePath(
    filePath: string,
    ignoreDirNames: string[],
    ignorePathSegments: string[],
): boolean {
    const parts = filePath.split(path.sep);
    if (parts.some((p) => ignoreDirNames.includes(p))) return true;
    const normalized = filePath.replace(/\\/g, '/');
    return ignorePathSegments.some((seg) => normalized.includes(seg));
}

/**
 * 根据 lock 文件检测包管理器
 * @param cwd - 项目工作目录
 */
export async function detectPackageManager(cwd: string): Promise<PackageManager> {
    if (await pathExists(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
    if (await pathExists(path.join(cwd, 'yarn.lock'))) return 'yarn';
    return 'npm';
}

/**
 * 解析单个 package.json，提取 dev/serve 脚本
 * @param pkgPath - package.json 绝对路径
 * @param ignoreDirNames - 忽略目录名
 * @param ignorePathSegments - 忽略路径片段
 */
async function parsePackageJson(
    pkgPath: string,
    ignoreDirNames: string[],
    ignorePathSegments: string[],
): Promise<SubProject | null> {
    if (shouldIgnorePath(pkgPath, ignoreDirNames, ignorePathSegments)) return null;

    const cwd = path.resolve(path.dirname(pkgPath));
    const pkg = await readJsonSafe(pkgPath);
    if (!pkg) return null;

    const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {};
    const devScripts: DevScript[] = Object.entries(scripts)
        .filter(([name]) => isDevScript(name))
        .map(([name, command]) => ({ name, command }))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (devScripts.length === 0) return null;

    const packageName = (pkg.name as string) || path.basename(cwd);
    const pm = (await pathExists(path.join(cwd, 'pnpm-lock.yaml')))
        ? 'pnpm'
        : (await pathExists(path.join(cwd, 'yarn.lock')))
          ? 'yarn'
          : 'npm';

    return {
        id: cwd,
        name: path.basename(cwd),
        packageName,
        cwd,
        scripts: devScripts,
        packageManager: pm,
    };
}

/**
 * 是否存在 apps 目录（monorepo 子项目容器）
 * @param rootPath - 项目根路径
 */
async function hasAppsDirectory(rootPath: string): Promise<boolean> {
    const appsPath = path.join(rootPath, 'apps');
    return isDirectory(appsPath);
}

/**
 * 仅扫描 apps/* 下一层子目录的 package.json
 * @param rootPath - 项目根路径
 * @param config - 启动器配置
 */
async function findAppsSubProjects(
    rootPath: string,
    config: LauncherConfig,
): Promise<SubProject[]> {
    const appsPath = path.join(rootPath, 'apps');
    if (!(await pathExists(appsPath))) return [];

    const found: SubProject[] = [];
    const entries = await fs.promises.readdir(appsPath, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

        const pkgPath = path.join(appsPath, entry.name, 'package.json');
        if (!(await pathExists(pkgPath))) continue;

        const project = await parsePackageJson(
            pkgPath,
            config.ignoreDirNames,
            config.ignorePathSegments,
        );
        if (project) found.push(project);
    }

    return found.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 扫描单个项目文件夹，组装 ProjectGroup
 * @param rootPath - 项目根路径
 * @param category - 分类名 App/Pc
 * @param config - 启动器配置
 */
async function scanProjectFolder(
    rootPath: string,
    category: string,
    config: LauncherConfig,
): Promise<ProjectGroup | null> {
    const folderName = path.basename(rootPath);
    const rootPkg = path.join(rootPath, 'package.json');

    const rootProject = (await pathExists(rootPkg))
        ? await parsePackageJson(rootPkg, config.ignoreDirNames, config.ignorePathSegments)
        : null;

    if (await hasAppsDirectory(rootPath)) {
        const children = await findAppsSubProjects(rootPath, config);
        if (children.length > 0) {
            return {
                id: rootPath,
                folderName,
                category,
                rootPath,
                children,
                hasChildren: true,
            };
        }
    }

    if (!rootProject) return null;

    return {
        id: rootPath,
        folderName,
        category,
        rootPath,
        root: rootProject,
        children: [],
        hasChildren: false,
    };
}

/**
 * 说明项目文件夹为何未进入列表
 * @param rootPath - 项目根路径
 * @param config - 启动器配置
 */
async function describeSkipReason(rootPath: string, config: LauncherConfig): Promise<string> {
    const rootPkg = path.join(rootPath, 'package.json');
    const hasPkg = await pathExists(rootPkg);
    const hasApps = await hasAppsDirectory(rootPath);

    if (!hasPkg && !hasApps) {
        return '缺少 package.json，且不存在 apps/ 目录';
    }

    if (hasApps) {
        const children = await findAppsSubProjects(rootPath, config);
        const rootProject = hasPkg
            ? await parsePackageJson(rootPkg, config.ignoreDirNames, config.ignorePathSegments)
            : null;
        if (children.length === 0 && !rootProject) {
            return '存在 apps/，但子项目与根 package.json 均无 dev/serve 脚本';
        }
    }

    if (hasPkg) {
        const pkg = await readJsonSafe(rootPkg);
        const scriptNames = Object.keys((pkg?.scripts as Record<string, string>) ?? {});
        if (scriptNames.length === 0) {
            return 'package.json 的 scripts 为空，请添加 dev、dev:h5 或 serve 等脚本';
        }
        const names = scriptNames.slice(0, 8).join('、');
        const more = scriptNames.length > 8 ? '…' : '';
        return `scripts 中无 dev/serve（当前仅有：${names}${more}）`;
    }

    return '未找到可运行的 dev/serve 脚本';
}

/**
 * 扫描配置目录下所有项目（异步，避免阻塞事件循环）
 * @param config - 启动器配置
 */
export async function scanProjects(config: LauncherConfig): Promise<ScanResult> {
    const groups: ProjectGroup[] = [];
    const skipped: SkippedProject[] = [];

    for (const category of config.categories) {
        const catPath = path.join(config.scanRoot, category);
        if (!(await pathExists(catPath)) || !(await isDirectory(catPath))) continue;

        const entries = await fs.promises.readdir(catPath, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

            const projectPath = path.join(catPath, entry.name);
            const group = await scanProjectFolder(projectPath, category, config);
            if (group) {
                groups.push(group);
                continue;
            }

            const rootPkg = path.join(projectPath, 'package.json');
            if ((await pathExists(rootPkg)) || (await hasAppsDirectory(projectPath))) {
                skipped.push({
                    folderName: entry.name,
                    category,
                    rootPath: projectPath,
                    reason: await describeSkipReason(projectPath, config),
                });
            }
        }
    }

    groups.sort((a, b) => {
        const cat = a.category.localeCompare(b.category);
        if (cat !== 0) return cat;
        return a.folderName.localeCompare(b.folderName);
    });

    skipped.sort((a, b) => {
        const cat = a.category.localeCompare(b.category);
        if (cat !== 0) return cat;
        return a.folderName.localeCompare(b.folderName);
    });

    return { groups, skipped };
}

/**
 * 生成任务唯一 ID
 * @param cwd - 工作目录
 * @param scriptName - 脚本名
 */
export function taskId(cwd: string, scriptName: string): string {
    return `${path.resolve(cwd)}::${scriptName}`;
}

/**
 * 从任务 ID 解析 cwd 与脚本名
 * @param id - 任务 ID
 */
export function parseTaskId(id: string): { cwd: string; scriptName: string } {
    const idx = id.lastIndexOf('::');
    return {
        cwd: id.slice(0, idx),
        scriptName: id.slice(idx + 2),
    };
}
