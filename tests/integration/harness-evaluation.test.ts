/**
 * Harness 评估引擎集成测试
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  evaluateDiagnosis,
  computeOverallEvaluation,
  checkQualityGate,
  detectRegression,
  generateReport,
} from '../../src/engines/harness/evaluation-engine';
import {
  getAllCases,
  getCasesBySkill,
  getGoldenSetStats,
} from '../../src/engines/harness/golden-set';
import type {
  Diagnosis,
  Severity,
  DiagnosisType,
  SkillContext,
  FileSystemTool,
  Logger,
} from '../../src/types';
import type { CaseEvaluation, GoldenTestCase } from '../../src/engines/harness/types';

// ---------------------------------------------------------------------------
// Virtual filesystem for e2e testing
// ---------------------------------------------------------------------------

function createVirtualFS(
  filePath: string,
  content: string,
): FileSystemTool {
  const normalized = filePath.replace(/^\//, '');

  return {
    async readFile(p: string): Promise<string> {
      const target = p.replace(/^\//, '');
      if (target === normalized || target.endsWith(normalized)) {
        return content;
      }
      throw new Error(`File not found in virtual FS: ${p}`);
    },

    async writeFile(): Promise<void> {
      throw new Error('writeFile not supported in virtual FS');
    },

    async exists(p: string): Promise<boolean> {
      const target = p.replace(/^\//, '');
      return target === normalized || target.endsWith(normalized);
    },

    async glob(pattern: string): Promise<string[]> {
      const ext = normalized.split('.').pop() ?? '';
      const baseGlob = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
      const re = new RegExp(`^${baseGlob}$`);
      if (re.test(normalized)) return [normalized];

      // Fallback: match by extension
      if (pattern.includes('*.' + ext)) return [normalized];
      if (pattern === `**/*.${ext}`) return [normalized];

      return [];
    },

    async mkdir(): Promise<void> {},

    async remove(): Promise<void> {
      throw new Error('remove not supported in virtual FS');
    },

    async stat(p: string): Promise<{ size: number; isFile: boolean; isDirectory: boolean }> {
      const target = p.replace(/^\//, '');
      if (target === normalized || target.endsWith(normalized)) {
        return { size: Buffer.byteLength(content), isFile: true, isDirectory: false };
      }
      throw new Error(`File not found: ${p}`);
    },
  };
}

function createSilentLogger(): Logger {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

/** Build a SkillContext for a single golden case */
function buildSkillContext(testCase: GoldenTestCase): SkillContext {
  const { code, filePath } = testCase.input;

  return {
    project: {
      name: `golden-${testCase.id}`,
      path: '/tmp/qa-eval',
      type: 'webapp',
    },
    config: {
      version: 1,
      rules: {},
      ignore: [],
    },
    logger: createSilentLogger(),
    tools: {
      fs: createVirtualFS(filePath, code),
      git: {
        async getChangedFiles() { return []; },
        async getCurrentBranch() { return 'main'; },
        async getCommitHash() { return 'golden'; },
      },
      shell: {
        async execute() {
          return { stdout: '', stderr: '', exitCode: 0 };
        },
      },
    },
    model: {
      async chat() {
        return { content: '' };
      },
      isMock: true,
    },
    storage: {
      async get() { return null; },
      async set() {},
      async delete() {},
      async clear() {},
    },
  };
}

function makeDiagnosis(ruleIds: string[]): Diagnosis[] {
  return ruleIds.map((ruleId, i) => ({
    id: `test-${i}`,
    skill: 'a11y',
    type: 'a11y' as DiagnosisType,
    severity: 'warning' as Severity,
    title: ruleId,
    description: `Test diagnosis for ${ruleId}`,
    location: { file: 'test.html', line: 1 },
    metadata: { ruleId },
  }));
}

function makeEvaluation(caseId: string, skill: string, f1: number, passed: boolean): CaseEvaluation {
  return {
    caseId,
    skill,
    difficulty: 'easy' as const,
    diagnosis: {
      precision: f1,
      recall: f1,
      f1,
      truePositives: 1,
      falsePositives: 0,
      falseNegatives: 0,
      expectedCount: 1,
      actualCount: 1,
      issueTypes: { expected: ['test'], actual: ['test'], missed: [], extra: [] },
    },
    fix: { precision: 0, recall: 0, f1: 0, fixedCount: 0, expectedFixCount: 0 },
    overall: { precision: f1, recall: f1, f1, passed },
    duration: 10,
  };
}

// ---------------------------------------------------------------------------
// Golden Set 加载测试
// ---------------------------------------------------------------------------

describe('Golden Set loading', () => {
  it('should load all 30 golden cases', () => {
    const cases = getAllCases();
    expect(cases.length).toBe(30);
  });

  it('should have unique IDs for all cases', () => {
    const cases = getAllCases();
    const ids = new Set(cases.map((c) => c.id));
    expect(ids.size).toBe(cases.length);
  });

  it('should filter by skill correctly', () => {
    expect(getCasesBySkill('a11y').length).toBe(10);
    expect(getCasesBySkill('security').length).toBe(10);
    expect(getCasesBySkill('performance').length).toBe(10);
    expect(getCasesBySkill('unknown').length).toBe(0);
  });

  it('should return correct stats', () => {
    const stats = getGoldenSetStats();
    expect(stats.total).toBe(30);
    expect(stats.bySkill.a11y).toBe(10);
    expect(stats.bySkill.security).toBe(10);
    expect(stats.bySkill.performance).toBe(10);
    expect(stats.byDifficulty.easy).toBe(15);
    expect(stats.byDifficulty.medium).toBe(10);
    expect(stats.byDifficulty.hard).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 诊断评估测试
// ---------------------------------------------------------------------------

describe('evaluateDiagnosis', () => {
  it('should return perfect metrics when actual matches expected', () => {
    const testCase = getCasesBySkill('a11y')[0]; // a11y-missing-alt-001, expects img-alt
    const actual = makeDiagnosis(['img-alt']);

    const result = evaluateDiagnosis(testCase, actual);

    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.f1).toBe(1);
    expect(result.truePositives).toBe(1);
    expect(result.falsePositives).toBe(0);
    expect(result.falseNegatives).toBe(0);
  });

  it('should detect false positives', () => {
    const testCase = getCasesBySkill('a11y')[0]; // expects img-alt, falsePositives: [button-name, label]
    const actual = makeDiagnosis(['img-alt', 'button-name']);

    const result = evaluateDiagnosis(testCase, actual);

    expect(result.falsePositives).toBe(1);
    expect(result.precision).toBeLessThan(1);
  });

  it('should detect missed issues (false negatives)', () => {
    const testCase = getCasesBySkill('a11y')[0]; // expects img-alt
    const actual = makeDiagnosis([]);

    const result = evaluateDiagnosis(testCase, actual);

    expect(result.falseNegatives).toBe(1);
    expect(result.recall).toBe(0);
    expect(result.f1).toBe(0);
  });

  it('should handle empty actual diagnosis', () => {
    const testCase = getCasesBySkill('a11y')[0];
    const actual: Diagnosis[] = [];

    const result = evaluateDiagnosis(testCase, actual);

    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.f1).toBe(0);
  });

  it('should detect extra issues and count them as FP', () => {
    const testCase = getCasesBySkill('a11y')[0];
    const actual = makeDiagnosis(['img-alt', 'unknown-rule']);

    const result = evaluateDiagnosis(testCase, actual);

    expect(result.issueTypes.extra).toContain('unknown-rule');
    // Extra rules that are not in expectedTypes or falsePositiveTypes should count as FP
    expect(result.falsePositives).toBe(1);
    expect(result.precision).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// 整体评估测试
// ---------------------------------------------------------------------------

describe('computeOverallEvaluation', () => {
  it('should compute metrics for empty evaluations', () => {
    const result = computeOverallEvaluation([]);

    expect(result.totalCases).toBe(0);
    expect(result.avgF1).toBe(0);
    expect(result.passRate).toBe(0);
  });

  it('should compute averages for mixed evaluations', () => {
    const evaluations = [
      makeEvaluation('case-1', 'a11y', 1.0, true),
      makeEvaluation('case-2', 'a11y', 0.5, false),
      makeEvaluation('case-3', 'security', 0.8, true),
    ];

    const result = computeOverallEvaluation(evaluations);

    expect(result.totalCases).toBe(3);
    expect(result.passedCases).toBe(2);
    expect(result.failedCases).toBe(1);
    expect(result.passRate).toBeCloseTo(2 / 3, 5);
    expect(result.avgF1).toBeCloseTo((1.0 + 0.5 + 0.8) / 3, 5);
    expect(result.bySkill.a11y.cases).toBe(2);
    expect(result.bySkill.security.cases).toBe(1);
  });

  it('should group by difficulty', () => {
    const evaluations = [
      makeEvaluation('case-1', 'a11y', 1.0, true),
    ];
    evaluations[0].difficulty = 'easy';

    const result = computeOverallEvaluation(evaluations);

    expect(result.byDifficulty.easy.cases).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 质量门禁测试
// ---------------------------------------------------------------------------

describe('checkQualityGate', () => {
  it('should pass when metrics exceed threshold', () => {
    const overall: Parameters<typeof computeOverallEvaluation>[0] = [
      makeEvaluation('case-1', 'a11y', 0.9, true),
      makeEvaluation('case-2', 'security', 0.85, true),
    ];
    const result = computeOverallEvaluation(overall);
    const gate = checkQualityGate(result, 80);

    expect(gate.passed).toBe(true);
    expect(gate.details.some((d) => d.startsWith('✅'))).toBe(true);
  });

  it('should fail when pass rate is below threshold', () => {
    const overall = [
      makeEvaluation('case-1', 'a11y', 0.3, false),
      makeEvaluation('case-2', 'a11y', 0.2, false),
    ];
    const result = computeOverallEvaluation(overall);
    const gate = checkQualityGate(result, 80);

    expect(gate.passed).toBe(false);
    expect(gate.details.some((d) => d.startsWith('❌'))).toBe(true);
  });

  it('should check per-skill F1', () => {
    const overall = [
      makeEvaluation('case-1', 'a11y', 0.9, true),
      makeEvaluation('case-2', 'security', 0.3, false),
    ];
    const result = computeOverallEvaluation(overall);
    const gate = checkQualityGate(result, 80);

    expect(gate.passed).toBe(false);
    expect(gate.details.some((d) => d.includes('security'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 回归检测测试
// ---------------------------------------------------------------------------

describe('detectRegression', () => {
  it('should not detect regression when metrics improve', () => {
    const previous = computeOverallEvaluation([
      makeEvaluation('case-1', 'a11y', 0.5, false),
    ]);
    const current = computeOverallEvaluation([
      makeEvaluation('case-1', 'a11y', 0.9, true),
    ]);

    const result = detectRegression(previous, current);

    expect(result.isRegression).toBe(false);
    expect(result.details.length).toBe(0);
  });

  it('should detect F1 drop', () => {
    const previous = computeOverallEvaluation([
      makeEvaluation('case-1', 'a11y', 0.9, true),
    ]);
    const current = computeOverallEvaluation([
      makeEvaluation('case-1', 'a11y', 0.3, false),
    ]);

    const result = detectRegression(previous, current);

    expect(result.isRegression).toBe(true);
    expect(result.details.some((d) => d.includes('F1 dropped'))).toBe(true);
  });

  it('should detect pass rate drop', () => {
    const previous = computeOverallEvaluation([
      makeEvaluation('case-1', 'a11y', 0.9, true),
      makeEvaluation('case-2', 'a11y', 0.9, true),
    ]);
    const current = computeOverallEvaluation([
      makeEvaluation('case-1', 'a11y', 0.3, false),
      makeEvaluation('case-2', 'a11y', 0.3, false),
    ]);

    const result = detectRegression(previous, current);

    expect(result.isRegression).toBe(true);
  });

  it('should detect increased failed cases', () => {
    const previous = computeOverallEvaluation([
      makeEvaluation('case-1', 'a11y', 0.9, true),
    ]);
    const current = computeOverallEvaluation([
      makeEvaluation('case-1', 'a11y', 0.9, true),
      makeEvaluation('case-2', 'a11y', 0.3, false),
    ]);

    const result = detectRegression(previous, current);

    expect(result.details.some((d) => d.includes('Failed cases increased'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 报告生成测试
// ---------------------------------------------------------------------------

describe('generateReport', () => {
  it('should generate a report string', () => {
    const overall = computeOverallEvaluation([
      makeEvaluation('case-1', 'a11y', 0.8, true),
    ]);
    const report = generateReport(overall);

    expect(report).toContain('QA-Agent Evaluation Report');
    expect(report).toContain('Total Cases:  1');
    expect(report).toContain('By Skill');
    expect(report).toContain('By Difficulty');
  });

  it('should include per-skill breakdown', () => {
    const overall = computeOverallEvaluation([
      makeEvaluation('case-1', 'a11y', 0.8, true),
      makeEvaluation('case-2', 'security', 0.6, false),
    ]);
    const report = generateReport(overall);

    expect(report).toContain('a11y');
    expect(report).toContain('security');
  });
});

// ---------------------------------------------------------------------------
// 端到端测试 — 真实 skill 诊断 + Golden Set 对比
// ---------------------------------------------------------------------------

describe('E2E: Golden case → skill.diagnose() → evaluateDiagnosis', () => {
  it('should detect img-alt issues in a11y golden case', async () => {
    const { A11ySkill } = await import('../../src/skills/builtin/a11y');
    const skill = new A11ySkill();
    const testCase = getCasesBySkill('a11y')[0]; // a11y-missing-alt-001

    const context = buildSkillContext(testCase);

    const actualDiagnosis = await skill.diagnose(context);
    const result = evaluateDiagnosis(testCase, actualDiagnosis);

    // The a11y case has 2 images without alt
    expect(actualDiagnosis.length).toBeGreaterThanOrEqual(1);
    expect(result.truePositives).toBeGreaterThanOrEqual(1);
    expect(result.recall).toBeGreaterThan(0);
  });

  it('should detect eval-usage in security golden case', async () => {
    const { SecuritySkill } = await import('../../src/skills/builtin/security');
    const skill = new SecuritySkill();
    // Find the eval golden case
    const evalCase = getCasesBySkill('security').find((c) => c.id === 'sec-eval-002')!;

    const context = buildSkillContext(evalCase);

    const actualDiagnosis = await skill.diagnose(context);
    const result = evaluateDiagnosis(evalCase, actualDiagnosis);

    // AST-based eval detection should find eval-usage
    expect(result.truePositives).toBeGreaterThanOrEqual(1);
    expect(result.recall).toBeGreaterThan(0);
  });

  it('should detect console-statement in performance golden case', async () => {
    const { PerformanceSkill } = await import('../../src/skills/builtin/performance');
    const skill = new PerformanceSkill();
    const consoleCase = getCasesBySkill('performance').find((c) => c.id === 'perf-console-log-003')!;

    const context = buildSkillContext(consoleCase);

    const actualDiagnosis = await skill.diagnose(context);
    const result = evaluateDiagnosis(consoleCase, actualDiagnosis);

    expect(result.truePositives).toBeGreaterThanOrEqual(1);
    expect(result.recall).toBeGreaterThan(0);
  });
});
