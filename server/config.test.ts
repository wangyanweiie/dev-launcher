/**
 * config 工具函数单元测试
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildTaskSpawnEnv, isCwdUnderScanRoot, mergeNodeOptions } from './config.js';

describe('isCwdUnderScanRoot', () => {
    const root = path.resolve('/tmp/company');

    it('允许扫描根目录本身', () => {
        assert.equal(isCwdUnderScanRoot(root, root), true);
    });

    it('允许扫描根下的子目录', () => {
        assert.equal(isCwdUnderScanRoot(path.join(root, 'App', 'foo'), root), true);
    });

    it('拒绝扫描根之外的目录', () => {
        assert.equal(isCwdUnderScanRoot(path.resolve('/tmp/other'), root), false);
    });

    it('拒绝前缀相似但非子路径的目录', () => {
        assert.equal(isCwdUnderScanRoot(path.resolve('/tmp/company-evil'), root), false);
    });
});

describe('mergeNodeOptions', () => {
    it('无 nodeOptions 时原样复制', () => {
        const env = mergeNodeOptions({ FOO: '1' });
        assert.equal(env.FOO, '1');
        assert.equal(env.NODE_OPTIONS, undefined);
    });

    it('追加到已有 NODE_OPTIONS', () => {
        const env = mergeNodeOptions(
            { NODE_OPTIONS: '--enable-source-maps' },
            '--max-old-space-size=2048',
        );
        assert.equal(
            env.NODE_OPTIONS,
            '--enable-source-maps --max-old-space-size=2048',
        );
    });
});

describe('buildTaskSpawnEnv', () => {
    it('合并 taskEnv、nodeOptions 并保留 FORCE_COLOR', () => {
        const env = buildTaskSpawnEnv(
            { NODE_OPTIONS: '--x' },
            {
                taskEnv: { MY_FLAG: '1' },
                nodeOptions: '--max-old-space-size=512',
            },
        );
        assert.equal(env.MY_FLAG, '1');
        assert.equal(env.NODE_OPTIONS, '--x --max-old-space-size=512');
        assert.equal(env.FORCE_COLOR, '1');
    });
});
