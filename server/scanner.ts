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
 * 安全读取 JSON 文件
 * @param filePath - 文件路径
 */
function readJsonSafe(filePath: string): Record<string, unknown> | null {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
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
    // 路径任意段命中忽略目录名则跳过
    if (parts.some((p) => ignoreDirNames.includes(p))) return true;
    const normalized = filePath.replace(/\\/g, '/');
    return ignorePathSegments.some((seg) => normalized.includes(seg));
}

/**
 * 根据 lock 文件检测包管理器
 * @param cwd - 项目工作目录
 */
export async function detectPackageManager(cwd: string): Promise<PackageManager> {
    if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
    return 'npm';
}

/**
 * 解析单个 package.json，提取 dev/serve 脚本
 * @param pkgPath - package.json 绝对路径
 * @param ignoreDirNames - 忽略目录名
 * @param ignorePathSegments - 忽略路径片段
 */
function parsePackageJson(
    pkgPath: string,
    ignoreDirNames: string[],
    ignorePathSegments: string[],
): SubProject | null {
    if (shouldIgnorePath(pkgPath, ignoreDirNames, ignorePathSegments)) return null;

    const cwd = path.resolve(path.dirname(pkgPath));
    const pkg = readJsonSafe(pkgPath);
    if (!pkg) return null;

    const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {};
    // 仅保留 dev/serve 类脚本并排序
    const devScripts: DevScript[] = Object.entries(scripts)
        .filter(([name]) => isDevScript(name))
        .map(([name, command]) => ({ name, command }))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (devScripts.length === 0) return null;

    const packageName = (pkg.name as string) || path.basename(cwd);
    const pm = fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))
        ? 'pnpm'
        : fs.existsSync(path.join(cwd, 'yarn.lock'))
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
function hasAppsDirectory(rootPath: string): boolean {
    const appsPath = path.join(rootPath, 'apps');
    try {
        return fs.existsSync(appsPath) && fs.statSync(appsPath).isDirectory();
    } catch {
        return false;
    }
}

/**
 * 仅扫描 apps/* 下一层子目录的 package.json（不递归更深，不扫描 blog 等其它目录）
 * @param rootPath - 项目根路径
 * @param config - 启动器配置
 */
function findAppsSubProjects(rootPath: string, config: LauncherConfig): SubProject[] {
    const appsPath = path.join(rootPath, 'apps');
    if (!fs.existsSync(appsPath)) return [];

    const found: SubProject[] = [];

    for (const entry of fs.readdirSync(appsPath, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

        const pkgPath = path.join(appsPath, entry.name, 'package.json');
        if (!fs.existsSync(pkgPath)) continue;

        const project = parsePackageJson(
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
 *
 * 规则：
 * - 默认只解析项目根目录 package.json（如 nandateqi_pc 仅一个 dev）
 * - 若根目录存在 apps/，则改为扫描 apps/* 下各子项的 package.json（如 x-mart、xmart-web）
 * @param rootPath - 项目根路径
 * @param category - 分类名 App/Pc
 * @param config - 启动器配置
 */
function scanProjectFolder(
    rootPath: string,
    category: string,
    config: LauncherConfig,
): ProjectGroup | null {
    const folderName = path.basename(rootPath);
    const rootPkg = path.join(rootPath, 'package.json');

    const rootProject = fs.existsSync(rootPkg)
        ? parsePackageJson(rootPkg, config.ignoreDirNames, config.ignorePathSegments)
        : null;

    // 有 apps 目录时走 monorepo 模式，不再把根 package.json 与 blog 等其它子目录算进来
    if (hasAppsDirectory(rootPath)) {
        const children = findAppsSubProjects(rootPath, config);
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
        // apps 存在但无有效子包时，回退到根目录单项目
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
 * 扫描配置目录下所有项目
 * @param config - 启动器配置
 */
export function scanProjects(config: LauncherConfig): ProjectGroup[] {
    const groups: ProjectGroup[] = [];

    for (const category of config.categories) {
        const catPath = path.join(config.scanRoot, category);
        if (!fs.existsSync(catPath)) continue;

        for (const entry of fs.readdirSync(catPath, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

            const projectPath = path.join(catPath, entry.name);
            const group = scanProjectFolder(projectPath, category, config);
            if (group) groups.push(group);
        }
    }

    // 先按分类、再按文件夹名排序
    return groups.sort((a, b) => {
        const cat = a.category.localeCompare(b.category);
        if (cat !== 0) return cat;
        return a.folderName.localeCompare(b.folderName);
    });
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
