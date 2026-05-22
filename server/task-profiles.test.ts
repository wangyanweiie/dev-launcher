/**
 * task-profiles 单元测试
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseTaskProfiles,
    resolveEffectiveTaskProfile,
    resolveSpawnOptions,
} from './task-profiles.js';
import type { ResolvedConfig } from './config.js';

describe('parseTaskProfiles', () => {
    it('解析有效配置档', () => {
        const profiles = parseTaskProfiles({
            default: { taskEnv: { A: '1' } },
            lowMemory: { nodeOptions: '--max-old-space-size=512' },
        });
        assert.deepEqual(profiles.default?.taskEnv, { A: '1' });
        assert.equal(profiles.lowMemory?.nodeOptions, '--max-old-space-size=512');
    });

    it('忽略非法项', () => {
        assert.deepEqual(parseTaskProfiles(null), {});
        assert.deepEqual(parseTaskProfiles([1, 2]), {});
    });
});

describe('resolveSpawnOptions', () => {
    const base = {
        taskEnv: { BASE: '1' },
        nodeOptions: '--enable-source-maps',
        taskProfiles: {
            low: { nodeOptions: '--max-old-space-size=512', taskEnv: { LOW: '1' } },
        },
    } as Pick<ResolvedConfig, 'taskEnv' | 'nodeOptions' | 'taskProfiles'>;

    it('无 profile 时仅全局', () => {
        const o = resolveSpawnOptions(base as ResolvedConfig);
        assert.equal(o.taskEnv.BASE, '1');
        assert.equal(o.nodeOptions, '--enable-source-maps');
    });

    it('合并 profile', () => {
        const o = resolveSpawnOptions(base as ResolvedConfig, 'low');
        assert.equal(o.taskEnv.BASE, '1');
        assert.equal(o.taskEnv.LOW, '1');
        assert.equal(
            o.nodeOptions,
            '--enable-source-maps --max-old-space-size=512',
        );
    });
});

describe('resolveEffectiveTaskProfile', () => {
    const config = {
        defaultTaskProfile: '',
        taskProfiles: {
            balanced: { nodeOptions: '--max-old-space-size=2560' },
        },
    } as Pick<ResolvedConfig, 'defaultTaskProfile' | 'taskProfiles'>;

    it('未配置 default 时使用 balanced', () => {
        assert.equal(
            resolveEffectiveTaskProfile(config as ResolvedConfig),
            'balanced',
        );
    });

    it('尊重 defaultTaskProfile', () => {
        const c = {
            ...config,
            defaultTaskProfile: 'lowMemory',
            taskProfiles: { ...config.taskProfiles, lowMemory: {} },
        } as unknown as ResolvedConfig;
        assert.equal(resolveEffectiveTaskProfile(c), 'lowMemory');
    });
});
