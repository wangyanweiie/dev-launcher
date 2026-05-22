/**
 * paths 单元测试
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getProjectRoot } from './paths.js';

describe('getProjectRoot', () => {
    it('从 server/ 上溯到仓库根', () => {
        const root = getProjectRoot('/Users/lemon/Tools/dev-launcher/server');
        assert.equal(root, '/Users/lemon/Tools/dev-launcher');
    });

    it('从 dist/server/ 上溯到仓库根', () => {
        const root = getProjectRoot('/Users/lemon/Tools/dev-launcher/dist/server');
        assert.equal(root, '/Users/lemon/Tools/dev-launcher');
    });

    it('解析结果为绝对路径', () => {
        const root = getProjectRoot(path.join(process.cwd(), 'dist', 'server'));
        assert.equal(path.basename(root), 'dev-launcher');
    });
});
