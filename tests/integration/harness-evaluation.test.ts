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
import type { Diagnosis, Severity, DiagnosisType } from '../../src/types';
import type { CaseEvaluation } from '../../src/engines/harness/types';

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

  it('should detect extra issues (not expected, not false positive)', () => {
    const testCase = getCasesBySkill('a11y')[0];
    const actual = makeDiagnosis(['img-alt', 'unknown-rule']);

    const result = evaluateDiagnosis(testCase, actual);

    expect(result.issueTypes.extra).toContain('unknown-rule');
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
