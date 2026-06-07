/**
 * Unit tests for A/B Testing Framework
 *
 * Covers: determineWinner, history storage (load/save/recent),
 * and ABTestRunner (runTest, determineWinner, saveResult, loadHistory, getBestConfigurations).
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

// ---------- Temp directory helpers ----------

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

// ---------- generateId mock ----------
mock.module('../../src/utils', () => ({
  generateId: mock(() => 'test-id-001'),
}));

import {
  determineWinner,
  loadABHistory,
  saveABHistory,
  getRecentABTests,
  ABTestRunner,
  type ABTestConfig,
  type ABTestResult,
  type ABTestHistoryEntry,
} from '../../src/engines/harness/ab-testing';

// ---------- Helpers ----------

function makeResult(
  winner: 'A' | 'B' | 'tie' = 'A',
  significance = 0.7,
  overrides: Partial<ABTestResult> = {},
): ABTestResult {
  return {
    config: {
      name: 'test',
      description: 'test desc',
      skill: 'a11y',
      variantA: { label: 'vA' },
      variantB: { label: 'vB' },
    },
    timestamp: '2025-01-01T00:00:00.000Z',
    variantA: { label: 'vA', f1: 0.85, precision: 0.80, recall: 0.90, passedCases: 8, totalCases: 10, avgDuration: 100 },
    variantB: { label: 'vB', f1: 0.75, precision: 0.70, recall: 0.80, passedCases: 7, totalCases: 10, avgDuration: 120 },
    winner,
    significance,
    ...overrides,
  };
}

function makeHistoryEntry(
  id: string,
  winner: 'A' | 'B' | 'tie' = 'A',
  significance = 0.7,
  overrides: Partial<ABTestHistoryEntry> = {},
): ABTestHistoryEntry {
  return {
    id,
    ...makeResult(winner, significance, overrides),
  };
}

// ===========================================================================
// describe: determineWinner
// ===========================================================================
describe('determineWinner', () => {
  it('A wins when F1 diff > 0.05 with high significance', () => {
    const result = determineWinner(
      { f1: 0.85, passedCases: 10, totalCases: 20 },
      { f1: 0.75, passedCases: 8, totalCases: 20 },
    );
    expect(result.winner).toBe('A');
    expect(result.significance).toBeGreaterThan(0.5);
  });

  it('B wins when B has higher F1 and diff > 0.05', () => {
    const result = determineWinner(
      { f1: 0.70, passedCases: 7, totalCases: 20 },
      { f1: 0.82, passedCases: 9, totalCases: 20 },
    );
    expect(result.winner).toBe('B');
    expect(result.significance).toBeGreaterThan(0.5);
  });

  it('returns tie with low significance when F1 diff < 0.02', () => {
    const result = determineWinner(
      { f1: 0.80, passedCases: 8, totalCases: 10 },
      { f1: 0.81, passedCases: 8, totalCases: 10 },
    );
    expect(result.winner).toBe('tie');
    expect(result.significance).toBeLessThan(0.5);
  });

  it('returns tie with low confidence when F1 diff between 0.02 and 0.05', () => {
    const result = determineWinner(
      { f1: 0.80, passedCases: 8, totalCases: 10 },
      { f1: 0.83, passedCases: 8, totalCases: 10 },
    );
    expect(result.winner).toBe('tie');
    expect(result.significance).toBeLessThan(0.5);
  });

  it('significance increases with more samples (sample boost)', () => {
    // Use diff = 0.06 → base significance = 0.06/0.1 = 0.6, then capped at min(1, 0.6 + boost)
    // With small samples (4 total): boost = min(0.2, 4/100*0.2) = 0.008 → sig = 0.608
    // With large samples (100 total): boost = min(0.2, 100/100*0.2) = 0.2 → sig = 0.8
    const small = determineWinner(
      { f1: 0.80, passedCases: 2, totalCases: 2 },
      { f1: 0.74, passedCases: 2, totalCases: 2 },
    );
    const large = determineWinner(
      { f1: 0.80, passedCases: 50, totalCases: 50 },
      { f1: 0.74, passedCases: 50, totalCases: 50 },
    );
    expect(large.significance).toBeGreaterThan(small.significance);
  });

  it('returns exact significance with proper rounding', () => {
    // diff = 0.15, so base significance = min(1, 0.15/0.1) = 1.0
    // totalSamples = 40, sampleBoost = min(0.2, 40/100*0.2) = 0.08
    // final significance = min(1, 1.0 + 0.08) = 1.0
    const result = determineWinner(
      { f1: 0.90, passedCases: 20, totalCases: 20 },
      { f1: 0.75, passedCases: 20, totalCases: 20 },
    );
    expect(result.winner).toBe('A');
    expect(result.significance).toBe(1);
  });

  it('tie significance formula for very small diff (near 0)', () => {
    // f1Diff = 0.001 → (1 - 0.001/0.02) * 0.5 ≈ 0.475
    const result = determineWinner(
      { f1: 0.80, passedCases: 5, totalCases: 5 },
      { f1: 0.801, passedCases: 5, totalCases: 5 },
    );
    expect(result.winner).toBe('tie');
    expect(result.significance).toBeCloseTo(0.475, 2);
  });
});

// ===========================================================================
// describe: History storage functions (using real FS in temp dirs)
// ===========================================================================
describe('History storage', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir('ab-history');
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  // For history tests we use the real filesystem but in a dedicated temp dir.
  // The module uses `.qa-ab-history` relative to process.cwd(), so we
  // temporarily change cwd.
  describe('loadABHistory', () => {
    it('returns empty array when history file does not exist', () => {
      // The temp dir has no .qa-ab-history/ab-test-history.json
      const savedCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        const result = loadABHistory();
        expect(result).toEqual([]);
      } finally {
        process.chdir(savedCwd);
      }
    });

    it('returns empty array when file exists but parsing fails', () => {
      const historyDir = path.join(tmpDir, '.qa-ab-history');
      fs.mkdirSync(historyDir, { recursive: true });
      fs.writeFileSync(
        path.join(historyDir, 'ab-test-history.json'),
        'not valid json',
        'utf-8',
      );
      const savedCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        const result = loadABHistory();
        expect(result).toEqual([]);
      } finally {
        process.chdir(savedCwd);
      }
    });

    it('parses valid JSON and returns history entries', () => {
      const historyDir = path.join(tmpDir, '.qa-ab-history');
      fs.mkdirSync(historyDir, { recursive: true });
      const historyData = [
        {
          id: 'abc123',
          config: { name: 't1', description: 'd1', skill: 'a11y', variantA: { label: 'A' }, variantB: { label: 'B' } },
          timestamp: '2025-01-01T00:00:00.000Z',
          variantA: { label: 'A', f1: 0.8, precision: 0.7, recall: 0.9, passedCases: 8, totalCases: 10, avgDuration: 100 },
          variantB: { label: 'B', f1: 0.7, precision: 0.6, recall: 0.8, passedCases: 7, totalCases: 10, avgDuration: 110 },
          winner: 'A',
          significance: 0.6,
        },
      ];
      fs.writeFileSync(
        path.join(historyDir, 'ab-test-history.json'),
        JSON.stringify(historyData),
        'utf-8',
      );
      const savedCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        const result = loadABHistory();
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('abc123');
        expect(result[0].winner).toBe('A');
        expect(result[0].variantA.f1).toBe(0.8);
      } finally {
        process.chdir(savedCwd);
      }
    });
  });

  describe('saveABHistory', () => {
    it('writes a new entry to history file', () => {
      const historyDir = path.join(tmpDir, '.qa-ab-history');
      fs.mkdirSync(historyDir, { recursive: true });
      // Pre-populate with one entry
      const existing = [makeHistoryEntry('prev-001')];
      fs.writeFileSync(
        path.join(historyDir, 'ab-test-history.json'),
        JSON.stringify(existing),
        'utf-8',
      );
      const savedCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        const result = makeResult('A', 0.7);
        saveABHistory(result);

        const raw = fs.readFileSync(
          path.join(historyDir, 'ab-test-history.json'),
          'utf-8',
        );
        const written = JSON.parse(raw);
        expect(written).toHaveLength(2);
        expect(written[1].id).toBe('test-id-001');
        expect(written[1].winner).toBe('A');
      } finally {
        process.chdir(savedCwd);
      }
    });

    it('creates directory if it does not exist', () => {
      const savedCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        const result = makeResult('B', 0.8);
        saveABHistory(result);

        const historyDir = path.join(tmpDir, '.qa-ab-history');
        expect(fs.existsSync(historyDir)).toBe(true);
      } finally {
        process.chdir(savedCwd);
      }
    });
  });

  describe('getRecentABTests', () => {
    it('returns limited entries in reverse order', () => {
      const historyDir = path.join(tmpDir, '.qa-ab-history');
      fs.mkdirSync(historyDir, { recursive: true });
      const history = Array.from({ length: 20 }, (_, i) =>
        makeHistoryEntry(`id-${i}`, 'A', 0.5),
      );
      fs.writeFileSync(
        path.join(historyDir, 'ab-test-history.json'),
        JSON.stringify(history),
        'utf-8',
      );
      const savedCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        const recent = getRecentABTests(5);
        expect(recent).toHaveLength(5);
        expect(recent[0].id).toBe('id-19');
        expect(recent[4].id).toBe('id-15');
      } finally {
        process.chdir(savedCwd);
      }
    });

    it('returns all entries reversed when count exceeds history length', () => {
      const historyDir = path.join(tmpDir, '.qa-ab-history');
      fs.mkdirSync(historyDir, { recursive: true });
      const history = [makeHistoryEntry('x1'), makeHistoryEntry('x2')];
      fs.writeFileSync(
        path.join(historyDir, 'ab-test-history.json'),
        JSON.stringify(history),
        'utf-8',
      );
      const savedCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        const recent = getRecentABTests(100);
        expect(recent).toHaveLength(2);
        expect(recent[0].id).toBe('x2');
        expect(recent[1].id).toBe('x1');
      } finally {
        process.chdir(savedCwd);
      }
    });

    it('returns empty array when history is empty', () => {
      const historyDir = path.join(tmpDir, '.qa-ab-history');
      fs.mkdirSync(historyDir, { recursive: true });
      fs.writeFileSync(
        path.join(historyDir, 'ab-test-history.json'),
        '[]',
        'utf-8',
      );
      const savedCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        const recent = getRecentABTests(10);
        expect(recent).toEqual([]);
      } finally {
        process.chdir(savedCwd);
      }
    });
  });
});

// ===========================================================================
// describe: ABTestRunner
// ===========================================================================
describe('ABTestRunner', () => {
  let runner: ABTestRunner;

  const baseConfig: ABTestConfig = {
    name: 'prompt-comparison',
    description: 'Compare prompt A vs prompt B for a11y skill',
    skill: 'a11y',
    variantA: { label: 'prompt-v1', prompt: 'You are an accessibility expert...' },
    variantB: { label: 'prompt-v2', prompt: 'You are a senior accessibility engineer...' },
  };

  const baseCases = [
    {
      id: 'case-1',
      skill: 'a11y',
      description: 'Missing alt text',
      input: {
        code: '<img src="photo.jpg">',
        filePath: 'src/App.vue',
        stack: ['vue' as const],
      },
      expectedDiagnosis: {
        issueCount: 1,
        issueTypes: ['missing-alt'],
      },
      expectedFix: {
        codePattern: 'alt=',
      },
      difficulty: 'easy' as const,
      tags: ['images'],
    },
    {
      id: 'case-2',
      skill: 'a11y',
      description: 'Missing label on input',
      input: {
        code: '<input type="text">',
        filePath: 'src/Form.vue',
        stack: ['vue' as const],
      },
      expectedDiagnosis: {
        issueCount: 1,
        issueTypes: ['missing-label'],
      },
      expectedFix: {
        codePattern: '<label',
      },
      difficulty: 'medium' as const,
      tags: ['forms'],
    },
  ];

  beforeEach(() => {
    runner = new ABTestRunner();
  });

  // -----------------------------------------------------------------------
  // runTest — with mocked diagnoseFn
  // -----------------------------------------------------------------------
  describe('runTest', () => {
    it('runs both variants and determines a winner', async () => {
      // Variant A: returns correct diagnosis for both cases → high F1
      // Variant B: returns empty diagnoses → zero F1
      const diagnoseFn = mock(async (skill: string, variant: { prompt?: string }, testCase: { expectedDiagnosis: { issueTypes: string[] } }) => {
        const isVariantA = variant.prompt?.includes('expert');
        if (isVariantA) {
          // Perfect match — return all expected types
          return testCase.expectedDiagnosis.issueTypes.map(type => ({
            id: 'd1',
            skill,
            type: 'accessibility' as const,
            severity: 'critical' as const,
            title: 'issue',
            description: 'desc',
            location: { filePath: 'x', line: 1, column: 1 },
            metadata: { ruleId: type },
          }));
        } else {
          // Return nothing — B misses all issues
          return [];
        }
      });

      const result = await runner.runTest(baseConfig, baseCases, diagnoseFn);

      expect(result.config).toBe(baseConfig);
      expect(result.variantA.label).toBe('prompt-v1');
      expect(result.variantB.label).toBe('prompt-v2');
      expect(result.variantA.totalCases).toBe(2);
      expect(result.variantB.totalCases).toBe(2);
      expect(result.variantA.f1).toBeGreaterThan(result.variantB.f1);
      expect(result.winner).toBe('A');
      expect(result.significance).toBeGreaterThan(0);
    });

    it('filters cases by skill', async () => {
      const mixedCases = [
        ...baseCases,
        {
          id: 'case-sec',
          skill: 'security',
          description: 'XSS',
          input: { code: 'innerHTML = x', filePath: 'src/app.ts', stack: ['typescript' as const] },
          expectedDiagnosis: { issueCount: 1, issueTypes: ['xss'] },
          expectedFix: { codePattern: 'textContent' },
          difficulty: 'hard' as const,
          tags: [],
        },
      ];

      const diagnoseFn = mock(async () => []);
      const result = await runner.runTest(baseConfig, mixedCases, diagnoseFn);

      expect(result.variantA.totalCases).toBe(2);
    });

    it('handles missing diagnoseFn gracefully (returns zero metrics)', async () => {
      const result = await runner.runTest(baseConfig, baseCases, undefined);

      expect(result.variantA.f1).toBe(0);
      expect(result.variantA.precision).toBe(0);
      expect(result.variantA.recall).toBe(0);
      expect(result.variantA.passedCases).toBe(0);
      expect(result.variantA.totalCases).toBe(2);
      expect(result.variantB.f1).toBe(0);
      expect(result.winner).toBe('tie');
    });

    it('handles empty case list', async () => {
      const diagnoseFn = mock(async () => []);
      const result = await runner.runTest(baseConfig, [], diagnoseFn);

      expect(result.variantA.totalCases).toBe(0);
      expect(result.variantA.f1).toBe(0);
      expect(result.winner).toBe('tie');
    });
  });

  // -----------------------------------------------------------------------
  // determineWinner — delegates to standalone function
  // -----------------------------------------------------------------------
  describe('determineWinner', () => {
    it('delegates to the standalone determineWinner function', () => {
      const methodResult = runner.determineWinner(
        { f1: 0.90, passedCases: 10, totalCases: 10 },
        { f1: 0.70, passedCases: 7, totalCases: 10 },
      );

      const standaloneResult = determineWinner(
        { f1: 0.90, passedCases: 10, totalCases: 10 },
        { f1: 0.70, passedCases: 7, totalCases: 10 },
      );

      expect(methodResult).toEqual(standaloneResult);
    });
  });

  // -----------------------------------------------------------------------
  // saveResult and loadHistory — round-trip (real FS in temp dir)
  // -----------------------------------------------------------------------
  describe('saveResult and loadHistory', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = createTempDir('ab-runner');
      const savedCwd = process.cwd();
      process.chdir(tmpDir);
    });

    afterEach(() => {
      process.chdir('/workspace');
      cleanupDir(tmpDir);
    });

    it('round-trips a result through save and load', () => {
      const result = makeResult('A', 0.85);
      runner.saveResult(result);

      const loaded = runner.loadHistory();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('test-id-001');
      expect(loaded[0].winner).toBe('A');
      expect(loaded[0].significance).toBe(0.85);
      expect(loaded[0].config.name).toBe('test');
    });

    it('loadHistory returns empty array when no file exists', () => {
      const runner2 = new ABTestRunner();
      // tmpDir has no .qa-ab-history yet
      const loaded = runner2.loadHistory();
      expect(loaded).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getBestConfigurations
  // -----------------------------------------------------------------------
  describe('getBestConfigurations', () => {
    it('groups by skill and picks the best variant', () => {
      const history: ABTestHistoryEntry[] = [
        makeHistoryEntry('h1', 'A', 0.8, {
          config: { name: 't1', description: '', skill: 'a11y', variantA: { label: 'prompt-A' }, variantB: { label: 'prompt-B' } },
          variantA: { ...makeResult().variantA, label: 'prompt-A', f1: 0.88 },
          variantB: { ...makeResult().variantB, label: 'prompt-B', f1: 0.78 },
        }),
        makeHistoryEntry('h2', 'B', 0.7, {
          config: { name: 't2', description: '', skill: 'security', variantA: { label: 'v1' }, variantB: { label: 'v2' } },
          variantA: { ...makeResult().variantA, label: 'v1', f1: 0.60 },
          variantB: { ...makeResult().variantB, label: 'v2', f1: 0.72 },
        }),
      ];

      const best = runner.getBestConfigurations(history);

      expect(best).toHaveLength(2);
      const a11y = best.find(b => b.skill === 'a11y');
      const security = best.find(b => b.skill === 'security');
      expect(a11y).toBeDefined();
      expect(a11y!.bestVariant.label).toBe('prompt-A');
      expect(a11y!.bestVariant.f1).toBe(0.88);
      expect(security).toBeDefined();
      expect(security!.bestVariant.label).toBe('v2');
      expect(security!.bestVariant.f1).toBe(0.72);
    });

    it('skips skills where all tests are ties', () => {
      const history: ABTestHistoryEntry[] = [
        makeHistoryEntry('h1', 'tie', 0.3, {
          config: { name: 't1', description: '', skill: 'performance', variantA: { label: 'A' }, variantB: { label: 'B' } },
        }),
      ];

      const best = runner.getBestConfigurations(history);
      expect(best).toHaveLength(0);
    });

    it('picks the most recent decisive test per skill', () => {
      const history: ABTestHistoryEntry[] = [
        makeHistoryEntry('old', 'B', 0.6, {
          config: { name: 'old', description: '', skill: 'a11y', variantA: { label: 'A' }, variantB: { label: 'B' } },
          variantA: { ...makeResult().variantA, f1: 0.60 },
          variantB: { ...makeResult().variantB, f1: 0.80 },
        }),
        makeHistoryEntry('new', 'A', 0.7, {
          config: { name: 'new', description: '', skill: 'a11y', variantA: { label: 'A-v2' }, variantB: { label: 'B-v2' } },
          variantA: { ...makeResult().variantA, label: 'A-v2', f1: 0.90 },
          variantB: { ...makeResult().variantB, label: 'B-v2', f1: 0.70 },
        }),
      ];

      const best = runner.getBestConfigurations(history);

      expect(best).toHaveLength(1);
      expect(best[0].bestVariant.label).toBe('A-v2');
    });

    it('returns empty array for empty history', () => {
      const best = runner.getBestConfigurations([]);
      expect(best).toEqual([]);
    });

    it('calculates improvement as relative change when loser f1 > 0', () => {
      // winner 0.90, loser 0.72 → improvement = (0.90-0.72)/0.72 = 0.25
      const history: ABTestHistoryEntry[] = [
        makeHistoryEntry('h1', 'A', 0.8, {
          config: { name: 't1', description: '', skill: 'a11y', variantA: { label: 'A' }, variantB: { label: 'B' } },
          variantA: { ...makeResult().variantA, f1: 0.90 },
          variantB: { ...makeResult().variantB, f1: 0.72 },
        }),
      ];

      const best = runner.getBestConfigurations(history);
      expect(best[0].improvement).toBe(0.25);
    });

    it('calculates improvement as absolute winner f1 when loser f1 = 0', () => {
      const history: ABTestHistoryEntry[] = [
        makeHistoryEntry('h1', 'A', 0.8, {
          config: { name: 't1', description: '', skill: 'a11y', variantA: { label: 'A' }, variantB: { label: 'B' } },
          variantA: { ...makeResult().variantA, f1: 0.85 },
          variantB: { ...makeResult().variantB, f1: 0 },
        }),
      ];

      const best = runner.getBestConfigurations(history);
      expect(best[0].improvement).toBe(0.85);
    });
  });
});
