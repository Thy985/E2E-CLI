/**
 * FeedbackLoopEngine 单元测试
 *
 * 覆盖所有公共方法：
 * - loadFeedback, saveFeedback, getRecentFeedback, clearFeedback
 * - FeedbackLoopEngine: collectFeedback, analyzeFeedback, getInsights,
 *   getSkillStats, generateRecommendations, _generateInsightRecommendation
 *
 * Uses real fs with tmpDir for storage isolation. The deterministic-id mock
 * is scoped to the project utils module only — never to the global `fs` module,
 * to avoid leaking mocks into other test files in the same process.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

// ── Mock utils (deterministic id + utility stubs) ───────────────────────────
// Scoped to the project utils module — does NOT mock `fs`.

// Module-level state (shared across calls; not reset between tests since
// `mock.module` factory is invoked once per module import).
let mockIdCounter = 0;

mock.module('../../src/utils', () => ({
  generateId: () => {
    mockIdCounter++;
    return `fb-${String(mockIdCounter).padStart(3, '0')}`;
  },
  hash: (s: string) => s,
  formatDuration: (ms: number) => `${ms}ms`,
  formatSize: (b: number) => `${b}B`,
  sleep: async () => {},
  retry: async (fn: () => Promise<any>) => fn(),
  debounce: (fn: any) => fn,
  throttle: (fn: any) => fn,
  matchPattern: () => true,
  deepMerge: (t: any, s: any) => ({ ...t, ...s }),
  pick: (obj: any, keys: string[]) => {
    const r: any = {};
    for (const k of keys) if (k in obj) r[k] = obj[k];
    return r;
  },
  omit: (obj: any, keys: string[]) => {
    const r = { ...obj };
    for (const k of keys) delete r[k];
    return r;
  },
  groupBy: (arr: any[], fn: any) =>
    arr.reduce((g, i) => {
      const k = fn(i);
      (g[k] ||= []).push(i);
      return g;
    }, {} as any),
  calculateScore: () => 100,
  getGrade: () => 'A',
}));

// ── Imports (AFTER mock is installed) ───────────────────────────────────────

import {
  loadFeedback,
  saveFeedback,
  getRecentFeedback,
  clearFeedback,
  FeedbackLoopEngine,
} from '../../src/engines/harness/feedback-loop';
import type { FeedbackEntry } from '../../src/engines/harness/feedback-loop';

// ── Temp directory helpers ─────────────────────────────────────────────────

function createTempDir(prefix: string): string {
  const dir = path.join(
    process.env.TMPDIR || '/tmp',
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function feedbackFilePath(basePath: string): string {
  return path.join(basePath, '.qa-feedback', 'feedback.json');
}

function readFeedbackFile(basePath: string): FeedbackEntry[] {
  const file = feedbackFilePath(basePath);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeFeedbackFile(basePath: string, entries: FeedbackEntry[]): void {
  const dir = path.join(basePath, '.qa-feedback');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(feedbackFilePath(basePath), JSON.stringify(entries, null, 2));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FeedbackLoop - Standalone functions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir('feedback-loop');
    mockIdCounter = 0; // Reset id counter for deterministic test IDs
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  describe('loadFeedback', () => {
    it('返回空数组当文件不存在时', () => {
      const result = loadFeedback(tmpDir);

      expect(result).toEqual([]);
    });

    it('解析有效的 JSON 反馈条目', () => {
      const entries: FeedbackEntry[] = [
        {
          id: 'fb-001',
          timestamp: '2025-01-01T00:00:00.000Z',
          skill: 'a11y',
          ruleId: 'aria-label',
          action: 'accept',
        },
        {
          id: 'fb-002',
          timestamp: '2025-01-02T00:00:00.000Z',
          skill: 'security',
          ruleId: 'xss-check',
          action: 'reject',
          notes: 'False positive',
        },
      ];
      writeFeedbackFile(tmpDir, entries);

      const result = loadFeedback(tmpDir);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('fb-001');
      expect(result[0].action).toBe('accept');
      expect(result[1].id).toBe('fb-002');
      expect(result[1].action).toBe('reject');
      expect(result[1].notes).toBe('False positive');
    });

    it('优雅处理损坏的 JSON', () => {
      const dir = path.join(tmpDir, '.qa-feedback');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'feedback.json'), 'not valid json{{{');

      const result = loadFeedback(tmpDir);

      expect(result).toEqual([]);
    });

    it('当 JSON 不是数组时返回空数组', () => {
      writeFeedbackFile(tmpDir, [] as any);
      // Overwrite with non-array JSON
      fs.writeFileSync(feedbackFilePath(tmpDir), '{"not": "array"}');

      const result = loadFeedback(tmpDir);

      expect(result).toEqual([]);
    });

    it('处理空文件内容', () => {
      const dir = path.join(tmpDir, '.qa-feedback');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'feedback.json'), '');

      const result = loadFeedback(tmpDir);

      expect(result).toEqual([]);
    });
  });

  describe('saveFeedback', () => {
    it('写入新的反馈条目', () => {
      saveFeedback(
        {
          id: 'fb-001',
          timestamp: '2025-01-01T00:00:00.000Z',
          skill: 'a11y',
          ruleId: 'aria-label',
          action: 'accept',
        },
        tmpDir,
      );

      const written = readFeedbackFile(tmpDir);
      expect(written).toHaveLength(1);
      expect(written[0].id).toBe('fb-001');
      expect(written[0].action).toBe('accept');
    });

    it('将新条目添加到已有列表的前面（unshift）', () => {
      const existing: FeedbackEntry[] = [
        { id: 'old', timestamp: '2025-01-01T00:00:00.000Z', skill: 'a11y', ruleId: 'r1', action: 'accept' },
      ];
      writeFeedbackFile(tmpDir, existing);

      saveFeedback(
        { id: 'new', timestamp: '2025-01-02T00:00:00.000Z', skill: 'security', ruleId: 'r2', action: 'reject' },
        tmpDir,
      );

      const written = readFeedbackFile(tmpDir);
      expect(written).toHaveLength(2);
      expect(written[0].id).toBe('new');
      expect(written[1].id).toBe('old');
    });

    it('使用完整的上下文信息保存条目', () => {
      saveFeedback(
        {
          id: 'fb-001',
          timestamp: '2025-01-01T00:00:00.000Z',
          skill: 'performance',
          ruleId: 'bundle-size',
          action: 'partial',
          diagnosisId: 'diag-1',
          fixId: 'fix-1',
          notes: 'Partially helpful',
          severity: 'warning',
          filePath: 'src/index.ts',
        },
        tmpDir,
      );

      const written = readFeedbackFile(tmpDir);
      expect(written[0].diagnosisId).toBe('diag-1');
      expect(written[0].fixId).toBe('fix-1');
      expect(written[0].notes).toBe('Partially helpful');
      expect(written[0].severity).toBe('warning');
      expect(written[0].filePath).toBe('src/index.ts');
    });
  });

  describe('getRecentFeedback', () => {
    it('返回有限的条目数量', () => {
      const entries: FeedbackEntry[] = Array.from({ length: 20 }, (_, i) => ({
        id: `fb-${i}`,
        timestamp: `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        skill: 'a11y',
        ruleId: `rule-${i}`,
        action: i % 2 === 0 ? 'accept' : 'reject',
      }));
      writeFeedbackFile(tmpDir, entries);

      const result = getRecentFeedback(5, tmpDir);

      expect(result).toHaveLength(5);
      expect(result[0].id).toBe('fb-0');
    });

    it('当条目少于请求数量时返回全部', () => {
      const entries: FeedbackEntry[] = [
        { id: 'fb-0', timestamp: '2025-01-01T00:00:00.000Z', skill: 'a11y', ruleId: 'r1', action: 'accept' },
      ];
      writeFeedbackFile(tmpDir, entries);

      const result = getRecentFeedback(10, tmpDir);

      expect(result).toHaveLength(1);
    });

    it('默认返回 10 条', () => {
      const entries: FeedbackEntry[] = Array.from({ length: 15 }, (_, i) => ({
        id: `fb-${i}`,
        timestamp: `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        skill: 'a11y',
        ruleId: `rule-${i}`,
        action: 'accept',
      }));
      writeFeedbackFile(tmpDir, entries);

      const result = getRecentFeedback(undefined, tmpDir);

      expect(result).toHaveLength(10);
    });
  });

  describe('clearFeedback', () => {
    it('当文件存在时删除文件', () => {
      writeFeedbackFile(tmpDir, [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'r', action: 'accept' },
      ]);
      expect(fs.existsSync(feedbackFilePath(tmpDir))).toBe(true);

      clearFeedback(tmpDir);

      expect(fs.existsSync(feedbackFilePath(tmpDir))).toBe(false);
    });

    it('当文件不存在时不做任何操作', () => {
      expect(fs.existsSync(feedbackFilePath(tmpDir))).toBe(false);

      // Should not throw
      clearFeedback(tmpDir);

      expect(fs.existsSync(feedbackFilePath(tmpDir))).toBe(false);
    });
  });
});

describe('FeedbackLoopEngine', () => {
  let engine: FeedbackLoopEngine;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir('feedback-engine');
    mockIdCounter = 0; // Reset id counter for deterministic test IDs
    engine = new FeedbackLoopEngine({ storageDir: tmpDir });
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  function seedFeedback(entries: FeedbackEntry[]): void {
    writeFeedbackFile(tmpDir, entries);
  }

  describe('collectFeedback', () => {
    it('创建并保存反馈条目', () => {
      const entry = engine.collectFeedback('a11y', 'aria-label', 'accept', {
        diagnosisId: 'diag-1',
        notes: 'Good catch',
      });

      expect(entry.id).toBe('fb-001');
      expect(entry.skill).toBe('a11y');
      expect(entry.ruleId).toBe('aria-label');
      expect(entry.action).toBe('accept');
      expect(entry.diagnosisId).toBe('diag-1');
      expect(entry.notes).toBe('Good catch');
      expect(entry.timestamp).toBeDefined();

      const written = readFeedbackFile(tmpDir);
      expect(written).toHaveLength(1);
    });

    it('不使用上下文时创建基本条目', () => {
      const entry = engine.collectFeedback('security', 'xss', 'reject');

      expect(entry.skill).toBe('security');
      expect(entry.ruleId).toBe('xss');
      expect(entry.action).toBe('reject');
      expect(entry.diagnosisId).toBeUndefined();
      expect(entry.fixId).toBeUndefined();
      expect(entry.notes).toBeUndefined();
    });

    it('为每次调用生成递增的 ID', () => {
      const e1 = engine.collectFeedback('s1', 'r1', 'accept');
      const e2 = engine.collectFeedback('s2', 'r2', 'reject');
      const e3 = engine.collectFeedback('s3', 'r3', 'partial');

      expect(e1.id).toBe('fb-001');
      expect(e2.id).toBe('fb-002');
      expect(e3.id).toBe('fb-003');
    });

    it('支持所有 FeedbackAction 类型', () => {
      const actions: Array<'accept' | 'reject' | 'partial' | 'ignore'> = ['accept', 'reject', 'partial', 'ignore'];
      const entries = actions.map(a => engine.collectFeedback('test', 'rule', a));

      entries.forEach((e, i) => expect(e.action).toBe(actions[i]));
    });
  });

  describe('analyzeFeedback', () => {
    it('返回空数据的正确统计', () => {
      const stats = engine.analyzeFeedback();

      expect(stats.totalFeedbacks).toBe(0);
      expect(stats.byAction).toEqual({ accept: 0, reject: 0, partial: 0, ignore: 0 });
      expect(stats.bySkill).toEqual({});
      expect(stats.acceptRate).toBe(0);
      expect(stats.rejectRate).toBe(0);
    });

    it('正确计算 byAction 计数', () => {
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'r1', action: 'accept' },
        { id: '2', timestamp: '', skill: 'a11y', ruleId: 'r1', action: 'accept' },
        { id: '3', timestamp: '', skill: 'security', ruleId: 'r2', action: 'reject' },
        { id: '4', timestamp: '', skill: 'a11y', ruleId: 'r3', action: 'partial' },
        { id: '5', timestamp: '', skill: 'security', ruleId: 'r2', action: 'ignore' },
      ];
      seedFeedback(entries);

      const stats = engine.analyzeFeedback();

      expect(stats.totalFeedbacks).toBe(5);
      expect(stats.byAction).toEqual({ accept: 2, reject: 1, partial: 1, ignore: 1 });
    });

    it('正确计算 bySkill 统计', () => {
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'r1', action: 'accept' },
        { id: '2', timestamp: '', skill: 'a11y', ruleId: 'r1', action: 'reject' },
        { id: '3', timestamp: '', skill: 'a11y', ruleId: 'r1', action: 'accept' },
        { id: '4', timestamp: '', skill: 'security', ruleId: 'r2', action: 'reject' },
        { id: '5', timestamp: '', skill: 'security', ruleId: 'r2', action: 'reject' },
      ];
      seedFeedback(entries);

      const stats = engine.analyzeFeedback();

      expect(stats.bySkill['a11y']).toEqual({ accept: 2, reject: 1, total: 3 });
      expect(stats.bySkill['security']).toEqual({ accept: 0, reject: 2, total: 2 });
    });

    it('正确计算 acceptRate 和 rejectRate', () => {
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'r1', action: 'accept' },
        { id: '2', timestamp: '', skill: 'a11y', ruleId: 'r1', action: 'accept' },
        { id: '3', timestamp: '', skill: 'a11y', ruleId: 'r1', action: 'reject' },
        { id: '4', timestamp: '', skill: 'a11y', ruleId: 'r1', action: 'partial' },
      ];
      seedFeedback(entries);

      const stats = engine.analyzeFeedback();

      expect(stats.acceptRate).toBe(2 / 4);
      expect(stats.rejectRate).toBe(1 / 4);
    });

    it('处理混合技能的统计数据', () => {
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'r1', action: 'accept' },
        { id: '2', timestamp: '', skill: 'performance', ruleId: 'r2', action: 'accept' },
        { id: '3', timestamp: '', skill: 'security', ruleId: 'r3', action: 'reject' },
        { id: '4', timestamp: '', skill: 'performance', ruleId: 'r2', action: 'partial' },
      ];
      seedFeedback(entries);

      const stats = engine.analyzeFeedback();

      expect(stats.bySkill).toHaveProperty('a11y');
      expect(stats.bySkill).toHaveProperty('performance');
      expect(stats.bySkill).toHaveProperty('security');
      expect(stats.bySkill['performance'].total).toBe(2);
    });
  });

  describe('getInsights', () => {
    it('按 skill+ruleId 分组并计算接受率', () => {
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'aria-label', action: 'accept' },
        { id: '2', timestamp: '', skill: 'a11y', ruleId: 'aria-label', action: 'accept' },
        { id: '3', timestamp: '', skill: 'a11y', ruleId: 'aria-label', action: 'reject' },
        { id: '4', timestamp: '', skill: 'security', ruleId: 'xss', action: 'accept' },
        { id: '5', timestamp: '', skill: 'security', ruleId: 'xss', action: 'reject' },
      ];
      seedFeedback(entries);

      const insights = engine.getInsights();

      expect(insights).toHaveLength(2);

      const a11yInsight = insights.find(i => i.skill === 'a11y' && i.ruleId === 'aria-label')!;
      expect(a11yInsight).toBeDefined();
      expect(a11yInsight.acceptRate).toBe(2 / 3);
      expect(a11yInsight.totalFeedbacks).toBe(3);

      const securityInsight = insights.find(i => i.skill === 'security' && i.ruleId === 'xss')!;
      expect(securityInsight).toBeDefined();
      expect(securityInsight.acceptRate).toBe(0.5);
      expect(securityInsight.totalFeedbacks).toBe(2);
    });

    it('根据样本量设置正确的置信度', () => {
      const highEntries: FeedbackEntry[] = Array.from({ length: 10 }, (_, i) => ({
        id: `h${i}`, timestamp: '', skill: 'a11y', ruleId: 'high', action: 'accept',
      }));
      const mediumEntries: FeedbackEntry[] = Array.from({ length: 5 }, (_, i) => ({
        id: `m${i}`, timestamp: '', skill: 'a11y', ruleId: 'medium', action: 'accept',
      }));
      const lowEntries: FeedbackEntry[] = [
        { id: 'l0', timestamp: '', skill: 'a11y', ruleId: 'low', action: 'accept' },
      ];

      const all = [...highEntries, ...mediumEntries, ...lowEntries];
      seedFeedback(all);

      const insights = engine.getInsights();

      const high = insights.find(i => i.ruleId === 'high')!;
      const medium = insights.find(i => i.ruleId === 'medium')!;
      const low = insights.find(i => i.ruleId === 'low')!;

      expect(high.confidence).toBe('high');
      expect(medium.confidence).toBe('medium');
      expect(low.confidence).toBe('low');
    });

    it('按 acceptRate 升序排序', () => {
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'good', action: 'accept' },
        { id: '2', timestamp: '', skill: 'a11y', ruleId: 'good', action: 'accept' },
        { id: '3', timestamp: '', skill: 'a11y', ruleId: 'good', action: 'accept' },
        { id: '4', timestamp: '', skill: 'a11y', ruleId: 'bad', action: 'reject' },
        { id: '5', timestamp: '', skill: 'a11y', ruleId: 'bad', action: 'reject' },
        { id: '6', timestamp: '', skill: 'a11y', ruleId: 'mid', action: 'accept' },
        { id: '7', timestamp: '', skill: 'a11y', ruleId: 'mid', action: 'reject' },
      ];
      seedFeedback(entries);

      const insights = engine.getInsights();

      expect(insights[0].ruleId).toBe('bad');
      expect(insights[1].ruleId).toBe('mid');
      expect(insights[2].ruleId).toBe('good');
    });

    it('生成对应接受率的推荐建议', () => {
      const goodEntries: FeedbackEntry[] = Array.from({ length: 10 }, (_, i) => ({
        id: `g${i}`, timestamp: '', skill: 'a11y', ruleId: 'excellent', action: 'accept',
      }));
      seedFeedback(goodEntries);

      const insights = engine.getInsights();

      const excellent = insights.find(i => i.ruleId === 'excellent')!;
      expect(excellent.acceptRate).toBeGreaterThan(0.9);
      expect(excellent.recommendation).toBe('Highly valued rule — consider promoting');
    });

    it('空数据返回空数组', () => {
      const insights = engine.getInsights();

      expect(insights).toEqual([]);
    });
  });

  describe('_generateInsightRecommendation', () => {
    it('无反馈时返回提示信息', () => {
      const result = (engine as any)._generateInsightRecommendation(0, 0);
      expect(result).toBe('No feedback yet');
    });

    it('接受率 > 90% 推荐提升', () => {
      expect((engine as any)._generateInsightRecommendation(0.95, 10)).toBe('Highly valued rule — consider promoting');
      expect((engine as any)._generateInsightRecommendation(1.0, 5)).toBe('Highly valued rule — consider promoting');
    });

    it('接受率 >= 70% 标记为有用', () => {
      expect((engine as any)._generateInsightRecommendation(0.7, 10)).toBe('Generally useful rule');
      expect((engine as any)._generateInsightRecommendation(0.8, 5)).toBe('Generally useful rule');
    });

    it('接受率 >= 40% 建议调整', () => {
      expect((engine as any)._generateInsightRecommendation(0.4, 10)).toBe('Mixed reception — consider tuning');
      expect((engine as any)._generateInsightRecommendation(0.5, 5)).toBe('Mixed reception — consider tuning');
      expect((engine as any)._generateInsightRecommendation(0.69, 10)).toBe('Mixed reception — consider tuning');
    });

    it('样本量 >= 5 且接受率 < 20% 建议禁用', () => {
      expect((engine as any)._generateInsightRecommendation(0.1, 5)).toBe('Strong negative signal — consider disabling');
      expect((engine as any)._generateInsightRecommendation(0.0, 10)).toBe('Strong negative signal — consider disabling');
    });

    it('样本量 < 5 且接受率低时建议收集更多反馈', () => {
      expect((engine as any)._generateInsightRecommendation(0.1, 3)).toBe('Needs more feedback for clear recommendation');
    });

    it('边界值：恰好 90% 不属于 > 90%', () => {
      expect((engine as any)._generateInsightRecommendation(0.9, 10)).toBe('Generally useful rule');
    });

    it('边界值：恰好 40% 属于 >= 40%', () => {
      expect((engine as any)._generateInsightRecommendation(0.4, 10)).toBe('Mixed reception — consider tuning');
    });

    it('边界值：恰好 20% 不属于 < 20% — 落入 fallback', () => {
      // 0.2 不满足 < 0.2，也不满足 >= 0.4，最终落入 fallback
      expect((engine as any)._generateInsightRecommendation(0.2, 10)).toBe('Needs more feedback for clear recommendation');
    });

    it('边界值：恰好 20% 但样本量 >= 5 — 仍落入 fallback', () => {
      expect((engine as any)._generateInsightRecommendation(0.19, 5)).toBe('Strong negative signal — consider disabling');
      expect((engine as any)._generateInsightRecommendation(0.2, 5)).toBe('Needs more feedback for clear recommendation');
    });
  });

  describe('getSkillStats', () => {
    it('返回特定技能的正确统计', () => {
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'aria-label', action: 'accept' },
        { id: '2', timestamp: '', skill: 'a11y', ruleId: 'aria-label', action: 'reject' },
        { id: '3', timestamp: '', skill: 'a11y', ruleId: 'color-contrast', action: 'accept' },
        { id: '4', timestamp: '', skill: 'a11y', ruleId: 'color-contrast', action: 'accept' },
        { id: '5', timestamp: '', skill: 'security', ruleId: 'xss', action: 'accept' },
      ];
      seedFeedback(entries);

      const stats = engine.getSkillStats('a11y');

      expect(stats.totalFeedbacks).toBe(4);
      expect(stats.acceptRate).toBe(3 / 4);
    });

    it('正确计算 topRejectedRules 并排序', () => {
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'rule-a', action: 'reject' },
        { id: '2', timestamp: '', skill: 'a11y', ruleId: 'rule-a', action: 'reject' },
        { id: '3', timestamp: '', skill: 'a11y', ruleId: 'rule-a', action: 'reject' },
        { id: '4', timestamp: '', skill: 'a11y', ruleId: 'rule-b', action: 'reject' },
        { id: '5', timestamp: '', skill: 'a11y', ruleId: 'rule-b', action: 'reject' },
        { id: '6', timestamp: '', skill: 'a11y', ruleId: 'rule-c', action: 'reject' },
        { id: '7', timestamp: '', skill: 'a11y', ruleId: 'rule-a', action: 'accept' },
      ];
      seedFeedback(entries);

      const stats = engine.getSkillStats('a11y');

      expect(stats.topRejectedRules).toHaveLength(3);
      expect(stats.topRejectedRules[0]).toEqual({ ruleId: 'rule-a', rejectCount: 3 });
      expect(stats.topRejectedRules[1]).toEqual({ ruleId: 'rule-b', rejectCount: 2 });
      expect(stats.topRejectedRules[2]).toEqual({ ruleId: 'rule-c', rejectCount: 1 });
    });

    it('仅返回前 5 个被拒绝的规则', () => {
      const entries: FeedbackEntry[] = [];
      for (let i = 0; i < 10; i++) {
        entries.push({ id: `r${i}`, timestamp: '', skill: 'a11y', ruleId: `rule-${i}`, action: 'reject' });
      }
      seedFeedback(entries);

      const stats = engine.getSkillStats('a11y');

      expect(stats.topRejectedRules).toHaveLength(5);
      expect(stats.topRejectedRules[0].rejectCount).toBe(1);
    });

    it('不存在的技能返回零统计', () => {
      const stats = engine.getSkillStats('nonexistent');

      expect(stats).toEqual({
        acceptRate: 0,
        totalFeedbacks: 0,
        topRejectedRules: [],
      });
    });

    it('只计算目标技能的条目，忽略其他技能', () => {
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'r1', action: 'accept' },
        { id: '2', timestamp: '', skill: 'security', ruleId: 'r2', action: 'reject' },
        { id: '3', timestamp: '', skill: 'a11y', ruleId: 'r1', action: 'reject' },
      ];
      seedFeedback(entries);

      const stats = engine.getSkillStats('a11y');

      expect(stats.totalFeedbacks).toBe(2);
      expect(stats.acceptRate).toBe(0.5);
      expect(stats.topRejectedRules).toEqual([{ ruleId: 'r1', rejectCount: 1 }]);
    });

    it('没有拒绝规则时返回空数组', () => {
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'r1', action: 'accept' },
        { id: '2', timestamp: '', skill: 'a11y', ruleId: 'r1', action: 'partial' },
      ];
      seedFeedback(entries);

      const stats = engine.getSkillStats('a11y');

      expect(stats.topRejectedRules).toEqual([]);
    });
  });

  describe('generateRecommendations', () => {
    it('空数据返回空数组', () => {
      const recs = engine.generateRecommendations();

      expect(recs).toEqual([]);
    });

    it('为高拒绝率（>80% 且 >5 条反馈）生成 disable 推荐', () => {
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'bad-rule', action: 'reject' },
        { id: '2', timestamp: '', skill: 'a11y', ruleId: 'bad-rule', action: 'reject' },
        { id: '3', timestamp: '', skill: 'a11y', ruleId: 'bad-rule', action: 'reject' },
        { id: '4', timestamp: '', skill: 'a11y', ruleId: 'bad-rule', action: 'reject' },
        { id: '5', timestamp: '', skill: 'a11y', ruleId: 'bad-rule', action: 'reject' },
        { id: '6', timestamp: '', skill: 'a11y', ruleId: 'bad-rule', action: 'accept' },
      ];
      seedFeedback(entries);

      const recs = engine.generateRecommendations();

      const disable = recs.find(r => r.type === 'disable');
      expect(disable).toBeDefined();
      expect(disable!.skill).toBe('a11y');
      expect(disable!.ruleId).toBe('bad-rule');
      expect(disable!.priority).toBe('high');
      expect(disable!.reason).toContain('83% reject rate');
    });

    it('为高接受率（>90% 且 >=3 条）生成 promote 推荐', () => {
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'good-rule', action: 'accept' },
        { id: '2', timestamp: '', skill: 'a11y', ruleId: 'good-rule', action: 'accept' },
        { id: '3', timestamp: '', skill: 'a11y', ruleId: 'good-rule', action: 'accept' },
        { id: '4', timestamp: '', skill: 'a11y', ruleId: 'good-rule', action: 'accept' },
      ];
      seedFeedback(entries);

      const recs = engine.generateRecommendations();

      const promote = recs.find(r => r.type === 'promote');
      expect(promote).toBeDefined();
      expect(promote!.ruleId).toBe('good-rule');
      expect(promote!.priority).toBe('medium');
      expect(promote!.reason).toContain('100% accept rate');
    });

    it('为中等接受率（40-60% 且 >=3 条）生成 tune 推荐', () => {
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'mid-rule', action: 'accept' },
        { id: '2', timestamp: '', skill: 'a11y', ruleId: 'mid-rule', action: 'accept' },
        { id: '3', timestamp: '', skill: 'a11y', ruleId: 'mid-rule', action: 'reject' },
        { id: '4', timestamp: '', skill: 'a11y', ruleId: 'mid-rule', action: 'reject' },
        { id: '5', timestamp: '', skill: 'a11y', ruleId: 'mid-rule', action: 'accept' },
      ];
      seedFeedback(entries);

      const recs = engine.generateRecommendations();

      const tune = recs.find(r => r.type === 'tune');
      expect(tune).toBeDefined();
      expect(tune!.ruleId).toBe('mid-rule');
      expect(tune!.priority).toBe('medium');
      expect(tune!.reason).toContain('60% accept rate');
    });

    it('为混合信号（>=5 条，多种 action 类型，acceptRate 在 30-70%）生成 investigate 推荐', () => {
      // 设计数据使得 acceptRate = 2/6 ≈ 0.333，在 [0.3, 0.7] 范围内，
      // 且不被 disable/tune/promote 先匹配
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'mixed-rule', action: 'accept' },
        { id: '2', timestamp: '', skill: 'a11y', ruleId: 'mixed-rule', action: 'accept' },
        { id: '3', timestamp: '', skill: 'a11y', ruleId: 'mixed-rule', action: 'reject' },
        { id: '4', timestamp: '', skill: 'a11y', ruleId: 'mixed-rule', action: 'reject' },
        { id: '5', timestamp: '', skill: 'a11y', ruleId: 'mixed-rule', action: 'partial' },
        { id: '6', timestamp: '', skill: 'a11y', ruleId: 'mixed-rule', action: 'ignore' },
      ];
      seedFeedback(entries);

      const recs = engine.generateRecommendations();

      // acceptRate = 2/6 ≈ 0.333 → 不满足 tune (0.4-0.6)，也不满足 promote (>0.9)
      // rejectRate = 2/6 ≈ 0.333 → 不满足 disable (>0.8)
      // mixedSignals = 4 (accept, reject, partial, ignore) >= 2
      // acceptRate 0.333 在 [0.3, 0.7] 内
      const investigate = recs.find(r => r.type === 'investigate');
      expect(investigate).toBeDefined();
      expect(investigate!.ruleId).toBe('mixed-rule');
      expect(investigate!.priority).toBe('low');
      expect(investigate!.reason).toContain('2 accept');
      expect(investigate!.reason).toContain('2 reject');
      expect(investigate!.reason).toContain('1 partial');
    });

    it('按优先级排序：high > medium > low', () => {
      const entries: FeedbackEntry[] = [];

      // low priority: investigate (mixed signals, acceptRate 0.3-0.7)
      // 2 accept, 2 reject, 1 partial, 1 ignore → acceptRate=2/6≈0.33, rejectRate=2/6≈0.33
      entries.push(
        { id: 'l1', timestamp: '', skill: 'a11y', ruleId: 'low-rule', action: 'accept' },
        { id: 'l2', timestamp: '', skill: 'a11y', ruleId: 'low-rule', action: 'reject' },
        { id: 'l3', timestamp: '', skill: 'a11y', ruleId: 'low-rule', action: 'partial' },
        { id: 'l4', timestamp: '', skill: 'a11y', ruleId: 'low-rule', action: 'accept' },
        { id: 'l5', timestamp: '', skill: 'a11y', ruleId: 'low-rule', action: 'reject' },
        { id: 'l6', timestamp: '', skill: 'a11y', ruleId: 'low-rule', action: 'ignore' },
      );

      // high priority: disable (>80% reject, >5 feedbacks)
      for (let i = 0; i < 7; i++) {
        entries.push({ id: `h${i}`, timestamp: '', skill: 'a11y', ruleId: 'high-rule', action: 'reject' });
      }

      // medium priority: promote (>90% accept, >=3 feedbacks)
      entries.push(
        { id: 'm1', timestamp: '', skill: 'a11y', ruleId: 'mid-rule', action: 'accept' },
        { id: 'm2', timestamp: '', skill: 'a11y', ruleId: 'mid-rule', action: 'accept' },
        { id: 'm3', timestamp: '', skill: 'a11y', ruleId: 'mid-rule', action: 'accept' },
      );

      seedFeedback(entries);

      const recs = engine.generateRecommendations();

      expect(recs[0].priority).toBe('high');
      expect(recs[0].type).toBe('disable');
      expect(recs[1].priority).toBe('medium');
      expect(recs[1].type).toBe('promote');
      expect(recs[2].priority).toBe('low');
      expect(recs[2].type).toBe('investigate');
    });

    it('规则满足多个条件时优先匹配 disable（continue 跳过后续）', () => {
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'rule-x', action: 'reject' },
        { id: '2', timestamp: '', skill: 'a11y', ruleId: 'rule-x', action: 'reject' },
        { id: '3', timestamp: '', skill: 'a11y', ruleId: 'rule-x', action: 'reject' },
        { id: '4', timestamp: '', skill: 'a11y', ruleId: 'rule-x', action: 'reject' },
        { id: '5', timestamp: '', skill: 'a11y', ruleId: 'rule-x', action: 'reject' },
        { id: '6', timestamp: '', skill: 'a11y', ruleId: 'rule-x', action: 'reject' },
        { id: '7', timestamp: '', skill: 'a11y', ruleId: 'rule-x', action: 'accept' },
      ];
      seedFeedback(entries);

      const recs = engine.generateRecommendations();

      const ruleXRecs = recs.filter(r => r.ruleId === 'rule-x');
      expect(ruleXRecs).toHaveLength(1);
      expect(ruleXRecs[0].type).toBe('disable');
    });

    it('反馈数量不足时不生成推荐', () => {
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'few', action: 'reject' },
        { id: '2', timestamp: '', skill: 'a11y', ruleId: 'few', action: 'reject' },
      ];
      seedFeedback(entries);

      const recs = engine.generateRecommendations();

      const fewRecs = recs.filter(r => r.ruleId === 'few');
      expect(fewRecs).toHaveLength(0);
    });

    it('处理多个不同规则同时存在', () => {
      const entries: FeedbackEntry[] = [];

      for (let i = 0; i < 5; i++) {
        entries.push({ id: `g${i}`, timestamp: '', skill: 'a11y', ruleId: 'excellent', action: 'accept' });
      }

      for (let i = 0; i < 7; i++) {
        entries.push({ id: `b${i}`, timestamp: '', skill: 'security', ruleId: 'terrible', action: 'reject' });
      }

      seedFeedback(entries);

      const recs = engine.generateRecommendations();

      expect(recs).toHaveLength(2);
      const types = recs.map(r => r.type);
      expect(types).toContain('disable');
      expect(types).toContain('promote');
    });

    it('rejectRate 恰好 83.3% (>80%) 触发 disable', () => {
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'edge', action: 'reject' },
        { id: '2', timestamp: '', skill: 'a11y', ruleId: 'edge', action: 'reject' },
        { id: '3', timestamp: '', skill: 'a11y', ruleId: 'edge', action: 'reject' },
        { id: '4', timestamp: '', skill: 'a11y', ruleId: 'edge', action: 'reject' },
        { id: '5', timestamp: '', skill: 'a11y', ruleId: 'edge', action: 'reject' },
        { id: '6', timestamp: '', skill: 'a11y', ruleId: 'edge', action: 'accept' },
      ];
      seedFeedback(entries);

      const recs = engine.generateRecommendations();

      const edgeRecs = recs.filter(r => r.ruleId === 'edge');
      expect(edgeRecs).toHaveLength(1);
      expect(edgeRecs[0].type).toBe('disable');
    });

    it('acceptRate 恰好 50% 且 >= 3 条触发 tune', () => {
      const entries: FeedbackEntry[] = [
        { id: '1', timestamp: '', skill: 'a11y', ruleId: 'tune-edge', action: 'accept' },
        { id: '2', timestamp: '', skill: 'a11y', ruleId: 'tune-edge', action: 'accept' },
        { id: '3', timestamp: '', skill: 'a11y', ruleId: 'tune-edge', action: 'reject' },
        { id: '4', timestamp: '', skill: 'a11y', ruleId: 'tune-edge', action: 'reject' },
      ];
      seedFeedback(entries);

      const recs = engine.generateRecommendations();

      const tuneRecs = recs.filter(r => r.ruleId === 'tune-edge');
      expect(tuneRecs).toHaveLength(1);
      expect(tuneRecs[0].type).toBe('tune');
      expect(tuneRecs[0].reason).toContain('50% accept rate');
    });
  });
});
