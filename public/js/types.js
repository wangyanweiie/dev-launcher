/**
 * 前端类型定义（JSDoc）
 */

/** @typedef {{ name: string; command: string }} DevScript */
/** @typedef {{ id: string; name: string; packageName: string; cwd: string; scripts: DevScript[]; packageManager: string }} SubProject */
/** @typedef {{ id: string; folderName: string; category: string; rootPath: string; root?: SubProject; children: SubProject[]; hasChildren: boolean }} ProjectGroup */
/** @typedef {{ key: string; label: string; sub: SubProject }} SubProjectItem */
/** @typedef {{ cwd: string; script: string; pm: string; taskId: string; label: string }} SelectedTask */
/** @typedef {{ instanceId: string; createdAt: number }} ProjectInstance */
/** @typedef {{ group: ProjectGroup; instanceId: string; isCopy: boolean; copyLabel: string | null }} CardDescriptor */
/** @typedef {{ port: number; pid: number; command: string; url: string; cwd?: string; projectLabel: string; folderName: string; subName: string; category: string; isCompany: boolean }} OrphanService */

export {};
