/**
 * Performance Skill Tests
 *
 * 覆盖：
 * - estimatePerformanceScore: 纯函数按 severity 扣分
 * - performanceGrade: score → A/B/C/D/F
 * - runLighthouseAudit: v0.3.0 占位返回 null
 * - SEVERITY_WEIGHT 暴露严重度权重
 */

import { describe, it, expect } from 'bun:test';
import {
  estimatePerformanceScore,
  performanceGrade,
  runLighthouseAudit,
} from '../../src/skills/builtin/performance';
import type { Diagnosis, Severity } from '../../src/types';

function makeDiagnosis(severity: Severity, id = 'test'): Diagnosis {
  return {
    id,
    skill: 'performance',
    type: 'performance',
    severity,
    title: 'test',
    description: 'test',
    location: { file: 'src/foo.ts', line: 1 },
  };
}

describe('estimatePerformanceScore', () => {
  it('returns 100 for no diagnoses (clean code)', () => {
    expect(estimatePerformanceScore([])).toBe(100);
  });

  it('subtracts 5 per critical', () => {
    const d = [makeDiagnosis('critical')];
    expect(estimatePerformanceScore(d)).toBe(95);
  });

  it('subtracts 3 per warning', () => {
    const d = [makeDiagnosis('warning')];
    expect(estimatePerformanceScore(d)).toBe(97);
  });

  it('subtracts 1 per info', () => {
    const d = [makeDiagnosis('info')];
    expect(estimatePerformanceScore(d)).toBe(99);
  });

  it('handles mixed severities correctly', () => {
    const d = [
      makeDiagnosis('critical'),
      makeDiagnosis('warning'),
      makeDiagnosis('warning'),
      makeDiagnosis('info'),
    ];
    // 5 + 3 + 3 + 1 = 12 → 88
    expect(estimatePerformanceScore(d)).toBe(88);
  });

  it('applies extra -10 penalty when diagnoses > 20', () => {
    const d = Array.from({ length: 21 }, (_, i) => makeDiagnosis('warning', `d${i}`));
    // 21 * 3 + 10 = 73 → 27
    expect(estimatePerformanceScore(d)).toBe(27);
  });

  it('does not apply extra penalty at exactly 20 diagnoses', () => {
    const d = Array.from({ length: 20 }, (_, i) => makeDiagnosis('warning', `d${i}`));
    // 20 * 3 = 60 → 40 (no extra penalty)
    expect(estimatePerformanceScore(d)).toBe(40);
  });

  it('floors at 0 (never goes negative)', () => {
    const d = Array.from({ length: 50 }, (_, i) => makeDiagnosis('critical', `e${i}`));
    // 50 * 5 + 10 = 260 → max(0, 100-260) = 0
    expect(estimatePerformanceScore(d)).toBe(0);
  });

  it('uses default weight 1 for unknown severities', () => {
    const d = [
      { ...makeDiagnosis('warning'), severity: 'weird' as Severity },
    ];
    // 1 (default) → 99
    expect(estimatePerformanceScore(d)).toBe(99);
  });
});

describe('performanceGrade', () => {
  it('returns A for score 90-100', () => {
    expect(performanceGrade(100)).toBe('A');
    expect(performanceGrade(95)).toBe('A');
    expect(performanceGrade(90)).toBe('A');
  });

  it('returns B for score 80-89', () => {
    expect(performanceGrade(89)).toBe('B');
    expect(performanceGrade(85)).toBe('B');
    expect(performanceGrade(80)).toBe('B');
  });

  it('returns C for score 70-79', () => {
    expect(performanceGrade(79)).toBe('C');
    expect(performanceGrade(75)).toBe('C');
    expect(performanceGrade(70)).toBe('C');
  });

  it('returns D for score 50-69', () => {
    expect(performanceGrade(69)).toBe('D');
    expect(performanceGrade(60)).toBe('D');
    expect(performanceGrade(50)).toBe('D');
  });

  it('returns F for score 0-49', () => {
    expect(performanceGrade(49)).toBe('F');
    expect(performanceGrade(25)).toBe('F');
    expect(performanceGrade(0)).toBe('F');
  });

  it('estimatePerformanceScore + performanceGrade round-trip', () => {
    // 0 diagnoses → 100 → A
    expect(performanceGrade(estimatePerformanceScore([]))).toBe('A');
    // 1 critical → 95 → A
    expect(performanceGrade(estimatePerformanceScore([makeDiagnosis('critical')]))).toBe('A');
    // 5 criticals → 75 → C
    const many = Array.from({ length: 5 }, (_, i) => makeDiagnosis('critical', `c${i}`));
    expect(performanceGrade(estimatePerformanceScore(many))).toBe('C');
  });
});

describe('runLighthouseAudit (v0.3.0 placeholder)', () => {
  it('returns null (v0.3.0 not implemented yet)', async () => {
    const result = await runLighthouseAudit('http://localhost:3000');
    expect(result).toBeNull();
  });

  it('does not throw for any URL', async () => {
    await expect(runLighthouseAudit('http://example.com')).resolves.toBeNull();
    await expect(runLighthouseAudit('not-a-url')).resolves.toBeNull();
    await expect(runLighthouseAudit('')).resolves.toBeNull();
  });
});
