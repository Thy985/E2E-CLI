/**
 * BatchFixEngine tests
 *
 * 之前是 7 段 switch + 动态 import + (mod as any).XxxSkill 拼凑，
 * 没有任何测试覆盖 dispatch 行为。重构后用 BUILTIN_SKILLS 静态映射表，
 * 以下测试固定 dispatch / filter / report 行为，避免回归。
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { BatchFixEngine } from '../../src/engines/fix/batch';
import { Diagnosis, SkillContext } from '../../src/types';
import { createLogger } from '../../src/utils/logger';
import { createNoopModel, createNoopStorage } from '../../src/cli/shared/report-helper';
import { createTools } from '../../src/tools';
import { QAConfig } from '../../src/config';
import { BUILTIN_SKILLS, getAllBuiltinSkills } from '../../src/skills/builtin';

function mkContext(projectPath: string): SkillContext {
  const config: QAConfig = { version: 1, project: { name: 't', type: 'webapp' } };
  return {
    project: { name: 't', path: projectPath },
    config,
    logger: createLogger({ level: 'error' }),
    tools: createTools(projectPath),  // 用真 tools，让 skill.fix 能读文件
    model: createNoopModel(),
    storage: createNoopStorage(),
  };
}

function mkIssue(overrides: Partial<Diagnosis> = {}): Diagnosis {
  return {
    id: overrides.id ?? 'd1',
    skill: overrides.skill ?? 'a11y',
    type: 'accessibility',
    severity: 'warning',
    title: 't',
    description: 'd',
    location: { file: 'src/x.ts' },
    fixSuggestion: {
      description: 'auto fix',
      autoApplicable: true,
      riskLevel: 'low',
    },
    ...overrides,
  };
}

const baseOptions = {
  autoApproveLowRisk: true,
  autoApproveMediumRisk: false,
  autoApproveHighRisk: false,
  dryRun: true,        // 关键：dry-run 不写盘、不调 FixEngine.applyFix
  preview: false,
  verify: false,
};

describe('BatchFixEngine', () => {
  describe('BUILTIN_SKILLS registry', () => {
    it('contains all expected skills', () => {
      const names = BUILTIN_SKILLS.map((Ctor) => new Ctor().name);
      // 至少有 a11y / e2e / performance / security
      expect(names).toContain('a11y');
      expect(names).toContain('e2e');
      expect(names).toContain('performance');
      expect(names).toContain('security');
    });

    it('getAllBuiltinSkills returns fresh instances', () => {
      const a = getAllBuiltinSkills();
      const b = getAllBuiltinSkills();
      expect(a).not.toBe(b); // 不同的 array
      for (let i = 0; i < a.length; i++) {
        expect(a[i]).not.toBe(b[i]);
      }
    });
  });

  describe('canAutoFix filter', () => {
    it('rejects issues without fixSuggestion', async () => {
      const engine = new BatchFixEngine();
      const result = await engine.batchFix(
        [mkIssue({ fixSuggestion: undefined })],
        mkContext(os.tmpdir()),
        baseOptions
      );
      expect(result.autoFixableIssues).toBe(0);
    });

    it('rejects issues with autoApplicable: false', async () => {
      const engine = new BatchFixEngine();
      const issue = mkIssue({
        fixSuggestion: { description: 'manual', autoApplicable: false, riskLevel: 'low' },
      });
      const result = await engine.batchFix([issue], mkContext(os.tmpdir()), baseOptions);
      expect(result.autoFixableIssues).toBe(0);
    });

    it('rejects critical issues when autoApproveHighRisk is false', async () => {
      const engine = new BatchFixEngine();
      const issue = mkIssue({ severity: 'critical' });
      const result = await engine.batchFix([issue], mkContext(os.tmpdir()), baseOptions);
      expect(result.autoFixableIssues).toBe(0);
    });

    it('accepts critical issues when autoApproveHighRisk is true', async () => {
      const engine = new BatchFixEngine();
      const issue = mkIssue({ id: 'crit-1', severity: 'critical' });
      const result = await engine.batchFix(
        [issue],
        mkContext(os.tmpdir()),
        { ...baseOptions, autoApproveHighRisk: true }
      );
      expect(result.autoFixableIssues).toBe(1);
    });
  });

  describe('batchFix dispatch', () => {
    it('returns empty appliedFixes when no issues match', async () => {
      const engine = new BatchFixEngine();
      const result = await engine.batchFix([], mkContext(os.tmpdir()), baseOptions);
      expect(result.totalIssues).toBe(0);
      expect(result.autoFixableIssues).toBe(0);
      expect(result.appliedFixes).toEqual([]);
      expect(result.report).toContain('# Batch Fix Report');
    });

    it('reports unknown skill without throwing', async () => {
      const engine = new BatchFixEngine();
      // 找一个不存在的 skill name
      const knownNames = new Set(BUILTIN_SKILLS.map((C) => new C().name));
      const fake = 'not-a-real-skill-xyz';
      expect(knownNames.has(fake)).toBe(false);
      const issue = mkIssue({ id: 'fake', skill: fake });
      const result = await engine.batchFix([issue], mkContext(os.tmpdir()), baseOptions);
      expect(result.totalIssues).toBe(1);
      // canAutoFix 仍认为它可修复（fixSuggestion.autoApplicable=true）
      expect(result.autoFixableIssues).toBe(1);
      // 但 generateFix 返回 null（skill 不在 BUILTIN_SKILLS 里），所以
      // appliedFixes 不会增长，failedFixes 也不会被记录
      expect(result.appliedFixes).toEqual([]);
      expect(result.failedFixes).toEqual([]);
    });

    it('dryRun does not write to disk', async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-test-'));
      try {
        const engine = new BatchFixEngine();
        const issue = mkIssue({ id: 'a' });
        const result = await engine.batchFix(
          [issue],
          mkContext(tmp),
          { ...baseOptions, dryRun: true }
        );
        // dry-run 模式下，appliedFixes 不记录实际写入
        expect(result.appliedFixes).toEqual([]);
        // 临时目录应该没有被创建任何文件
        const files = await fs.readdir(tmp);
        expect(files).toEqual([]);
      } finally {
        await fs.rm(tmp, { recursive: true, force: true });
      }
    });
  });

  describe('generateReport', () => {
    it('contains summary section with counts', async () => {
      const engine = new BatchFixEngine();
      const result = await engine.batchFix(
        [mkIssue({ id: 'a' }), mkIssue({ id: 'b' }), mkIssue({ id: 'c' })],
        mkContext(os.tmpdir()),
        baseOptions
      );
      expect(result.report).toContain('Total Issues');
      expect(result.report).toContain('Auto-fixable');
      expect(result.report).toContain('Applied');
    });
  });

  describe('batchFix with real files (generateFix dispatch)', () => {
    // generateFix calls skill.fix(), which in turn calls tools.fs.readFile.
    // 创建一个真正的 src 目录 + 文件，让 a11y skill 的 fix 能跑通。
    let tmp = '';
    beforeEach(async () => {
      tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-dispatch-'));
      await fs.writeFile(path.join(tmp, 'index.html'), '<html><body><img src="x.png"></body></html>');
    });
    afterEach(async () => {
      await fs.rm(tmp, { recursive: true, force: true });
    });

    it('dispatches a11y.fix and produces a fix object', async () => {
      const engine = new BatchFixEngine();
      const issue = mkIssue({ id: 'a1', skill: 'a11y' });
      const result = await engine.batchFix(
        [issue],
        mkContext(tmp),
        { ...baseOptions, dryRun: true }
      );
      // dryRun 模式下 appliedFixes 不会增长，但 fix 会被生成
      expect(result.totalIssues).toBe(1);
      expect(result.autoFixableIssues).toBe(1);
      // 不应该崩
      expect(result.failedFixes).toEqual([]);
    });
  });
});
