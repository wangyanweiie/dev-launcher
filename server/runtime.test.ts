/**
 * runtime 模块单元测试（依赖仓库根目录 config.json）
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { initRuntime, reloadRuntimeConfig, getRuntimeConfig } from './runtime.js';
import { getModuleDir, getProjectRoot } from './paths.js';

const ROOT = getProjectRoot(getModuleDir(import.meta.url));
const CONFIG = path.join(ROOT, 'config.json');

describe('runtime', () => {
    it('init 与 reload 可读取 config', { skip: !fs.existsSync(CONFIG) }, () => {
        initRuntime(ROOT);
        const first = getRuntimeConfig();
        const second = reloadRuntimeConfig(ROOT);
        assert.equal(first.port, second.port);
        assert.ok(second.maxRetainedTaskStates >= 1);
        assert.ok(second.maxTaskLogLines >= 1);
    });
});
