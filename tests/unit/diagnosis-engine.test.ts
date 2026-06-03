/**
 * Tests for the Diagnosis engine
 */

import { describe, it, expect } from 'bun:test';
import { DiagnosisEngine } from '../../src/engines/diagnosis';
import type { Diagnosis, ProjectInfo, Config } from '../../src/types';

const project: ProjectInfo = {
  name: 'test',
  path: '/tmp/test',
  type: 'webapp',
};

const config: Config = {
  version: 1,
};

function makeDiagnosis(overrides: Partial<Diagnosis> = {}): Diagnosis {
  return {
    id: 'd-' + Math.random().toString(36).slice(2, 8),
    skill: 'a11y',
    type: 'accessibility',
    severity: 'warning',
    title: 'Missing alt text',
    description: 'desc',
    location: { file: 'src/foo.ts', line: 10 },
    fixSuggestion: {
      description: 'Add alt',
      autoApplicable: true,
      riskLevel: 'low',
    },
    ...overrides,
  };
}

/**
 * Same as makeDiagnosis but with a deterministic location so the
 * dedup-by-file:line:title step doesn't collapse tests.
 */
function makeUniqueDiagnosis(seed: string, overrides: Partial<Diagnosis> = {}): Diagnosis {
  return makeDiagnosis({
    id: `d-${seed}`,
    location: { file: `src/${seed}.ts`, line: parseInt(seed, 10) || 1 },
    title: `Issue ${seed}`,
    ...overrides,
  });
}

describe('DiagnosisEngine.deduplicate', () => {
  it('removes duplicates by file:line:title', () => {
    const engine = new DiagnosisEngine();
    const a = makeDiagnosis({ location: { file: 'x.ts', line: 1 }, title: 'A' });
    const b = makeDiagnosis({ location: { file: 'x.ts', line: 1 }, title: 'A' });
    const c = makeDiagnosis({ location: { file: 'x.ts', line: 1 }, title: 'B' });
    expect(engine.deduplicate([a, b, c])).toHaveLength(2);
  });
});

describe('DiagnosisEngine.prioritize', () => {
  it('orders by severity: critical before warning before info', () => {
    const engine = new DiagnosisEngine();
    // Use unique locations so dedup doesn't collapse them, and disable
    // autoFixSuggestion so the priority math isn't skewed by the bonus.
    const info = makeUniqueDiagnosis('i', { severity: 'info', fixSuggestion: undefined });
    const crit = makeUniqueDiagnosis('c', { severity: 'critical', fixSuggestion: undefined });
    const warn = makeUniqueDiagnosis('w', { severity: 'warning', fixSuggestion: undefined });
    const sorted = engine.prioritize([info, crit, warn]);
    expect(sorted[0].severity).toBe('critical');
    expect(sorted[1].severity).toBe('warning');
    expect(sorted[2].severity).toBe('info');
  });

  it('enriches with impactScore and rootCause', () => {
    const engine = new DiagnosisEngine();
    const d = makeDiagnosis({ type: 'accessibility', title: 'Missing alt text' });
    const out = engine.prioritize([d])[0];
    expect(out.priority).toBeGreaterThan(0);
    expect(out.impactScore).toBeGreaterThan(0);
    expect(out.rootCause).toBeTruthy();
  });
});

describe('DiagnosisEngine.buildReport', () => {
  it('produces a complete report with summary + dimensions + score', () => {
    const engine = new DiagnosisEngine();
    const issues = [
      makeUniqueDiagnosis('a1', { skill: 'a11y', severity: 'critical', fixSuggestion: undefined }),
      makeUniqueDiagnosis('a2', { skill: 'a11y', severity: 'warning', fixSuggestion: undefined }),
      makeUniqueDiagnosis('e1', { skill: 'e2e', severity: 'info', fixSuggestion: undefined }),
    ];

    const report = engine.buildReport({
      diagnoses: [
        { skill: 'a11y', diagnoses: issues.filter(i => i.skill === 'a11y') },
        { skill: 'e2e', diagnoses: issues.filter(i => i.skill === 'e2e') },
      ],
      project,
      config,
      duration: 100,
    });

    expect(report.summary.totalIssues).toBe(3);
    expect(report.summary.critical).toBe(1);
    expect(report.summary.warning).toBe(1);
    expect(report.summary.info).toBe(1);
    expect(report.summary.autoFixable).toBe(0);
    expect(report.summary.score).toBeGreaterThanOrEqual(0);
    expect(report.summary.score).toBeLessThanOrEqual(100);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(report.summary.grade);
    expect(report.dimensions.a11y).toBeDefined();
    expect(report.dimensions.e2e).toBeDefined();
    expect(report.exitCode).toBe(1);
  });

  it('exitCode 0 when no critical issues and failOn=critical', () => {
    const engine = new DiagnosisEngine();
    const report = engine.buildReport({
      diagnoses: [
        { skill: 'a11y', diagnoses: [makeUniqueDiagnosis('w', { severity: 'warning', fixSuggestion: undefined })] },
      ],
      project,
      config,
      duration: 0,
    });
    expect(report.exitCode).toBe(0);
  });
});
