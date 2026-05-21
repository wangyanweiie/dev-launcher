/**
 * config 工具函数单元测试
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { isCwdUnderScanRoot } from './config.js';

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
