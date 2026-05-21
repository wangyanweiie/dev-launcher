/**
 * 检测本机 localhost 监听端口，并关联 scanRoot 扫描目录下的项目
 */

import { exec } from 'node:child_process';
import path from 'node:path';
import type { ProjectGroup } from './scanner.js';

/** 本地监听进程 */
export interface LocalListener {
    port: number;
    pid: number;
    command: string;
    url: string;
}

/** 孤儿服务（含扫描根目录下项目归属） */
export interface OrphanService extends LocalListener {
    /** 进程工作目录 */
    cwd: string;
    /** 展示名，如 x-mart · leyuan */
    projectLabel: string;
    folderName: string;
    subName: string;
    category: string;
    /** 进程 cwd 是否位于 scanRoot 扫描目录下 */
    isUnderScanRoot: boolean;
}

/**
 * 从 URL 提取端口
 */
export function portFromUrl(url: string): number | null {
    try {
        const u = new URL(url);
        if (u.port) return Number(u.port);
        if (u.protocol === 'https:') return 443;
        if (u.protocol === 'http:') return 80;
    } catch {
        /* ignore */
    }
    return null;
}

/**
 * 判断监听地址是否可通过 localhost 访问（Vite 默认绑定 *:5173）
 */
function isLocalAccessible(host: string): boolean {
    if (host === '*' || host === '0.0.0.0') return true;
    if (host === '127.0.0.1' || host === 'localhost') return true;
    if (host === '[::1]' || host === '[::]' || host.startsWith('[::')) return true;
    return false;
}

/**
 * 解析单行 lsof LISTEN（兼容 macOS：`IPv6 ... TCP *:5173 (LISTEN)`）
 */
function parseListenLine(line: string): { command: string; pid: number; port: number; host: string } | null {
    if (!line || line.startsWith('COMMAND') || !line.includes('(LISTEN)')) return null;

    const portMatch = line.match(/:(\d+)\s+\(LISTEN\)/);
    if (!portMatch) return null;
    const port = Number(portMatch[1]);

    const parts = line.trim().split(/\s+/);
    const command = parts[0];
    const pid = Number(parts[1]);
    if (!command || !pid || !port) return null;

    const addrMatch = line.match(/(?:TCP\s+)([^\s]+):(\d+)\s+\(LISTEN\)/);
    const host = addrMatch?.[1] ?? '*';

    return { command, pid, port, host };
}

/**
 * 解析 lsof 输出中的本地监听端口
 */
export function detectLocalListeners(ownPort: number): Promise<LocalListener[]> {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            resolve([]);
            return;
        }

        exec('lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null', { maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
            if (err || !stdout) {
                resolve([]);
                return;
            }

            const seen = new Map<number, LocalListener>();

            for (const line of stdout.split('\n')) {
                const parsed = parseListenLine(line);
                if (!parsed) continue;

                const { command, pid, port, host } = parsed;
                if (!port || port === ownPort) continue;
                if (!isLocalAccessible(host)) continue;

                if (!seen.has(port) || command.length < (seen.get(port)?.command.length ?? 99)) {
                    seen.set(port, {
                        port,
                        pid,
                        command,
                        url: `http://localhost:${port}`,
                    });
                }
            }

            resolve([...seen.values()].sort((a, b) => a.port - b.port));
        });
    });
}

/**
 * 批量读取进程 cwd（macOS / Linux lsof）
 */
function getProcessCwds(pids: number[]): Promise<Map<number, string>> {
    const unique = [...new Set(pids.filter((p) => p > 0))];
    if (!unique.length) return Promise.resolve(new Map());

    return new Promise((resolve) => {
        exec(
            `lsof -a -p ${unique.join(',')} -d cwd -Fn 2>/dev/null`,
            { maxBuffer: 4 * 1024 * 1024 },
            (err, stdout) => {
                const map = new Map<number, string>();
                if (err || !stdout) {
                    resolve(map);
                    return;
                }

                let currentPid = 0;
                for (const line of stdout.split('\n')) {
                    if (line.startsWith('p')) {
                        currentPid = Number(line.slice(1));
                    } else if (line.startsWith('n') && currentPid > 0) {
                        map.set(currentPid, line.slice(1));
                    }
                }
                resolve(map);
            },
        );
    });
}

/**
 * 根据 cwd 匹配扫描到的项目分组
 */
export function resolveProjectFromCwd(
    cwd: string,
    groups: ProjectGroup[],
    scanRoot: string,
): Pick<OrphanService, 'projectLabel' | 'folderName' | 'subName' | 'category' | 'isUnderScanRoot'> {
    const resolved = path.resolve(cwd);
    const scanResolved = path.resolve(scanRoot);
    const underScanRoot =
        resolved === scanResolved || resolved.startsWith(scanResolved + path.sep);

    if (!underScanRoot) {
        return {
            isUnderScanRoot: false,
            folderName: path.basename(resolved),
            subName: '',
            category: '',
            projectLabel: path.basename(resolved),
        };
    }

    let bestGroup: ProjectGroup | null = null;
    let bestSub = '';
    let bestLen = 0;

    for (const g of groups) {
        const rootPath = path.resolve(g.rootPath);
        if (resolved !== rootPath && !resolved.startsWith(rootPath + path.sep)) continue;

        const candidates: { len: number; sub: string }[] = [{ len: rootPath.length, sub: '' }];

        if (g.root) {
            const rootCwd = path.resolve(g.root.cwd);
            if (resolved === rootCwd || resolved.startsWith(rootCwd + path.sep)) {
                candidates.push({
                    len: rootCwd.length,
                    sub: g.children.length ? '根目录' : '',
                });
            }
        }

        for (const child of g.children) {
            const childCwd = path.resolve(child.cwd);
            if (resolved === childCwd || resolved.startsWith(childCwd + path.sep)) {
                candidates.push({ len: childCwd.length, sub: child.name });
            }
        }

        const best = candidates.reduce((a, b) => (b.len > a.len ? b : a));
        if (best.len > bestLen) {
            bestLen = best.len;
            bestGroup = g;
            bestSub = best.sub;
        }
    }

    if (bestGroup) {
        const label = bestSub
            ? `${bestGroup.folderName} · ${bestSub}`
            : bestGroup.folderName;
        return {
            isUnderScanRoot: true,
            folderName: bestGroup.folderName,
            subName: bestSub,
            category: bestGroup.category,
            projectLabel: label,
        };
    }

    const rel = path.relative(scanResolved, resolved);
    const parts = rel.split(path.sep).filter(Boolean);
    const folderName = parts.length >= 2 ? parts[1] : parts[0] || path.basename(resolved);
    const category = parts[0] ?? '';

    return {
        isUnderScanRoot: true,
        folderName,
        subName: parts.length > 2 ? parts.slice(2).join('/') : '',
        category,
        projectLabel: category ? `${category}/${folderName}` : folderName,
    };
}

/**
 * 检测孤儿服务：排除 Launcher 管理端口，并标注 scanRoot 下项目
 */
export async function detectOrphanServices(
    scanRoot: string,
    ownPort: number,
    groups: ProjectGroup[],
    managedPorts: Set<number>,
): Promise<{ companyOrphans: OrphanService[] }> {
    const listeners = await detectLocalListeners(ownPort);
    const orphans = listeners.filter((l) => !managedPorts.has(l.port));

    const cwds = await getProcessCwds(orphans.map((o) => o.pid));

    const companyOrphans: OrphanService[] = [];

    for (const l of orphans) {
        const cwd = cwds.get(l.pid) ?? '';
        if (!cwd) continue;

        const meta = resolveProjectFromCwd(cwd, groups, scanRoot);
        if (!meta.isUnderScanRoot) continue;

        companyOrphans.push({ ...l, cwd, ...meta });
    }

    companyOrphans.sort((a, b) => {
        const cat = a.category.localeCompare(b.category);
        if (cat !== 0) return cat;
        return a.projectLabel.localeCompare(b.projectLabel) || a.port - b.port;
    });

    return { companyOrphans };
}

/** @deprecated 使用 detectLocalListeners */
export const detectExternalListeners = detectLocalListeners;

/**
 * @deprecated 使用 detectOrphanServices
 */
export function filterOrphanListeners(
    listeners: LocalListener[],
    managedPorts: Set<number>,
): LocalListener[] {
    return listeners.filter((l) => !managedPorts.has(l.port));
}

/**
 * 按端口结束进程（macOS / Linux）
 */
export function killByPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        exec(`lsof -ti :${port} 2>/dev/null`, (err, stdout) => {
            if (err || !stdout?.trim()) {
                resolve(false);
                return;
            }
            const pids = stdout.trim().split('\n').filter(Boolean);
            if (!pids.length) {
                resolve(false);
                return;
            }
            exec(
                `kill -TERM ${pids.join(' ')} 2>/dev/null; sleep 0.5; kill -KILL ${pids.join(' ')} 2>/dev/null`,
                () => resolve(true),
            );
        });
    });
}
