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

      // Expand braces: {tsx,jsx,ts,js} → try each variant
      const braceMatch = pattern.match(/\{([^}]+)\}/);
      if (braceMatch) {
        const alternatives = braceMatch[1].split(',');
        for (const alt of alternatives) {
          const expanded = pattern.replace(braceMatch[0], alt);
          const baseGlob = expanded.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
          const re = new RegExp(`^${baseGlob}$`);
          if (re.test(normalized)) return [normalized];
        }
        // Fallback for brace-expanded patterns: match by extension
        if (alternatives.includes(ext)) return [normalized];
      } else {
        const baseGlob = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
        const re = new RegExp(`^${baseGlob}$`);
        if (re.test(normalized)) return [normalized];
      }

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
  it('should load all 70 golden cases', () => {
    const cases = getAllCases();
    expect(cases.length).toBe(70);
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
    expect(getCasesBySkill('react').length).toBe(10);
    expect(getCasesBySkill('vue').length).toBe(10);
    expect(getCasesBySkill('nextjs').length).toBe(10);
    expect(getCasesBySkill('nuxt').length).toBe(10);
    expect(getCasesBySkill('unknown').length).toBe(0);
  });

  it('should return correct stats', () => {
    const stats = getGoldenSetStats();
    expect(stats.total).toBe(70);
    expect(stats.bySkill.a11y).toBe(10);
    expect(stats.bySkill.security).toBe(10);
    expect(stats.bySkill.performance).toBe(10);
    expect(stats.bySkill.react).toBe(10);
    expect(stats.bySkill.vue).toBe(10);
    expect(stats.bySkill.nextjs).toBe(10);
    expect(stats.bySkill.nuxt).toBe(10);
    expect(stats.byDifficulty.easy).toBe(35);
    expect(stats.byDifficulty.medium).toBe(21);
    expect(stats.byDifficulty.hard).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// 诊断评估测试
// ---------------------------------------------------------------------------

describe('evaluateDiagnosis', () => {
  it('should return perfect metrics when actual matches expected', () => {
    const testCase = getCasesBySkill('a11y')[0]; // a11y-missing-alt-001, expects img-alt (issueCount=2)
    const actual = makeDiagnosis(['img-alt', 'img-alt']); // 2 instances to match expected count

    const result = evaluateDiagnosis(testCase, actual);

    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.f1).toBe(1);
    expect(result.truePositives).toBe(2);
    expect(result.falsePositives).toBe(0);
    expect(result.falseNegatives).toBe(0);
  });

  it('should detect false positives', () => {
    const testCase = getCasesBySkill('a11y')[0]; // expects img-alt (issueCount=2), falsePositives: [button-name, label]
    const actual = makeDiagnosis(['img-alt', 'button-name']);

    const result = evaluateDiagnosis(testCase, actual);

    expect(result.falsePositives).toBe(1);
    expect(result.precision).toBeLessThan(1);
  });

  it('should detect missed issues (false negatives)', () => {
    const testCase = getCasesBySkill('a11y')[0]; // expects img-alt (issueCount=2)
    const actual = makeDiagnosis([]);

    const result = evaluateDiagnosis(testCase, actual);

    expect(result.falseNegatives).toBe(2);
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

  it('should detect missing-key-prop in react golden case', async () => {
    const { ReactSkill } = await import('../../src/skills/builtin/react');
    const skill = new ReactSkill();
    const keyCase = getCasesBySkill('react').find((c) => c.id === 'react-missing-key-001')!;

    const context = buildSkillContext(keyCase);
    const actualDiagnosis = await skill.diagnose(context);
    const result = evaluateDiagnosis(keyCase, actualDiagnosis);

    expect(actualDiagnosis.length).toBeGreaterThanOrEqual(1);
    expect(actualDiagnosis.some((d) => d.metadata?.ruleId === 'missing-key-prop')).toBe(true);
    expect(result.truePositives).toBeGreaterThanOrEqual(1);
    expect(result.recall).toBeGreaterThan(0);
  });

  it('should detect hook-misuse in react golden case', async () => {
    const { ReactSkill } = await import('../../src/skills/builtin/react');
    const skill = new ReactSkill();
    const hookCase = getCasesBySkill('react').find((c) => c.id === 'react-hook-misuse-001')!;

    const context = buildSkillContext(hookCase);
    const actualDiagnosis = await skill.diagnose(context);
    const result = evaluateDiagnosis(hookCase, actualDiagnosis);

    expect(actualDiagnosis.some((d) => d.metadata?.ruleId === 'hook-misuse')).toBe(true);
    expect(result.truePositives).toBeGreaterThanOrEqual(1);
  });

  it('should detect v-for without key in vue golden case', async () => {
    const { VueSkill } = await import('../../src/skills/builtin/vue');
    const skill = new VueSkill();
    const vueCase = getCasesBySkill('vue').find((c) => c.id === 'vue-001')!;

    const context = buildSkillContext(vueCase);
    const actualDiagnosis = await skill.diagnose(context);
    const result = evaluateDiagnosis(vueCase, actualDiagnosis);

    expect(actualDiagnosis.length).toBeGreaterThanOrEqual(1);
    expect(actualDiagnosis.some((d) => d.metadata?.ruleId === 'missing-v-for-key')).toBe(true);
    expect(result.truePositives).toBeGreaterThanOrEqual(1);
  });

  it('should detect next-image-missing in nextjs golden case', async () => {
    const { NextJSSkill } = await import('../../src/skills/builtin/framework/nextjs');
    const skill = new NextJSSkill();
    const nextCase = getCasesBySkill('nextjs').find((c) => c.id === 'nextjs-001')!;

    const context = buildSkillContext(nextCase);
    const actualDiagnosis = await skill.diagnose(context);
    const result = evaluateDiagnosis(nextCase, actualDiagnosis);

    expect(actualDiagnosis.length).toBeGreaterThanOrEqual(1);
    expect(actualDiagnosis.some((d) => d.metadata?.ruleId === 'next-image-missing')).toBe(true);
    expect(result.truePositives).toBeGreaterThanOrEqual(1);
  });

  it('should detect nuxt-image-missing in nuxt golden case', async () => {
    const { NuxtSkill } = await import('../../src/skills/builtin/framework/nuxt');
    const skill = new NuxtSkill();
    const nuxtCase = getCasesBySkill('nuxt').find((c) => c.id === 'nuxt-001')!;

    const context = buildSkillContext(nuxtCase);
    const actualDiagnosis = await skill.diagnose(context);
    const result = evaluateDiagnosis(nuxtCase, actualDiagnosis);

    expect(actualDiagnosis.length).toBeGreaterThanOrEqual(1);
    expect(actualDiagnosis.some((d) => d.metadata?.ruleId === 'nuxt-image-missing')).toBe(true);
    expect(result.truePositives).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// E2E Fix Evaluation Tests
// ---------------------------------------------------------------------------

import { evaluateFix, applyChanges } from '../../src/engines/harness/evaluation-engine';
import type { FileChange, Fix } from '../../src/types';

describe('evaluateFix', () => {
  it('should return zeros when no fix produced', () => {
    const testCase: GoldenTestCase = {
      id: 'test-fix-001',
      skill: 'a11y',
      input: { code: '<img src="photo.jpg">', filePath: 'index.html', stack: ['html'] },
      expectedDiagnosis: { issueCount: 1, issueTypes: ['img-alt'] },
      expectedFix: { codePattern: 'alt=', shouldNotExist: ['<img src="photo.jpg">'] },
      difficulty: 'easy',
      tags: ['images'],
    };

    const result = evaluateFix(testCase, null);

    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.f1).toBe(0);
  });

  it('should return perfect score when fix matches expectations', () => {
    const testCase: GoldenTestCase = {
      id: 'test-fix-002',
      skill: 'a11y',
      input: { code: '<img src="photo.jpg">', filePath: 'index.html', stack: ['html'] },
      expectedDiagnosis: { issueCount: 1, issueTypes: ['img-alt'] },
      expectedFix: { codePattern: 'alt=', shouldNotExist: ['<img src="photo.jpg">'] },
      difficulty: 'easy',
      tags: ['images'],
    };

    const fixedCode = '<img src="photo.jpg" alt="Photo">';
    const result = evaluateFix(testCase, fixedCode);

    expect(result.recall).toBe(1); // contains 'alt='
    expect(result.precision).toBe(1); // removed '<img src="photo.jpg">'
    expect(result.f1).toBe(1);
  });

  it('should handle partial fix correctly', () => {
    const testCase: GoldenTestCase = {
      id: 'test-fix-003',
      skill: 'performance',
      input: { code: 'console.log("debug")', filePath: 'src/app.ts', stack: ['typescript'] },
      expectedDiagnosis: { issueCount: 1, issueTypes: ['console-log'] },
      expectedFix: { codePattern: 'process.env.NODE_ENV', shouldNotExist: ['console.log("debug")'] },
      difficulty: 'medium',
      tags: ['console'],
    };

    // Fix added env check but didn't remove console.log
    const fixedCode = 'if (process.env.NODE_ENV !== "production") { console.log("debug") }';
    const result = evaluateFix(testCase, fixedCode);

    expect(result.recall).toBe(1); // contains 'process.env.NODE_ENV'
    expect(result.precision).toBe(0); // still contains 'console.log("debug")'
  });
});

describe('applyChanges', () => {
  it('should apply replace change correctly', () => {
    const changes: FileChange[] = [
      {
        file: 'index.html',
        type: 'replace',
        oldContent: '<img src="photo.jpg">',
        content: '<img src="photo.jpg" alt="Photo">',
      },
    ];

    const result = applyChanges('<img src="photo.jpg">', changes);
    expect(result).toBe('<img src="photo.jpg" alt="Photo">');
  });

  it('should apply delete change correctly', () => {
    const changes: FileChange[] = [
      {
        file: 'app.ts',
        type: 'delete',
        oldContent: 'console.log("debug");\n',
      },
    ];

    const result = applyChanges('import { foo } from "./foo";\nconsole.log("debug");\nexport default foo;', changes);
    expect(result).toBe('import { foo } from "./foo";\nexport default foo;');
  });

  it('should apply insert change with position', () => {
    const changes: FileChange[] = [
      {
        file: 'index.html',
        type: 'insert',
        position: { line: 2 },
        content: '  <meta charset="utf-8">',
      },
    ];

    const result = applyChanges('<!DOCTYPE html>\n<html>', changes);
    expect(result).toBe('<!DOCTYPE html>\n  <meta charset="utf-8">\n<html>');
  });

  it('should apply multiple changes in sequence', () => {
    const changes: FileChange[] = [
      {
        file: 'app.ts',
        type: 'replace',
        oldContent: "import _ from 'lodash';",
        content: "import { debounce } from 'lodash-es';",
      },
      {
        file: 'app.ts',
        type: 'delete',
        oldContent: 'console.log("test");\n',
      },
    ];

    const original = "import _ from 'lodash';\nconsole.log(\"test\");\nconst fn = debounce(someFn, 300);";
    const result = applyChanges(original, changes);

    expect(result).toContain("import { debounce } from 'lodash-es';");
    expect(result).not.toContain('console.log("test")');
    expect(result).toContain('debounce(someFn, 300)');
  });
});

describe('E2E: Golden case → skill.diagnose() → skill.fix() → evaluateFix', () => {
  it('should fix img-alt issues in a11y golden case', async () => {
    const { A11ySkill } = await import('../../src/skills/builtin/a11y');
    const skill = new A11ySkill();
    const imgCase = getCasesBySkill('a11y').find((c) => c.id === 'a11y-missing-alt-001')!;

    const context = buildSkillContext(imgCase);

    // Run diagnosis
    const actualDiagnosis = await skill.diagnose(context);
    expect(actualDiagnosis.length).toBeGreaterThanOrEqual(1);

    // Run fix
    const fixes: Fix[] = [];
    for (const d of actualDiagnosis) {
      if (skill.canAutoFix(d)) {
        const fixResult = await skill.fix(d, context);
        fixes.push(fixResult);
      }
    }

    expect(fixes.length).toBeGreaterThanOrEqual(1);

    // Apply all changes
    const allChanges = fixes.flatMap((f) => f.changes);
    const fixedCode = applyChanges(imgCase.input.code, allChanges);

    // Evaluate fix against expectedFix
    const fixResult = evaluateFix(imgCase, fixedCode);
    expect(fixResult.recall).toBeGreaterThan(0);
    expect(fixedCode).toContain('alt=');
  });

  it('should fix console-log issues in performance golden case', async () => {
    const { PerformanceSkill } = await import('../../src/skills/builtin/performance');
    const skill = new PerformanceSkill();
    const consoleCase = getCasesBySkill('performance').find((c) => c.id === 'perf-console-log-003')!;

    const context = buildSkillContext(consoleCase);

    // Run diagnosis
    const actualDiagnosis = await skill.diagnose(context);
    expect(actualDiagnosis.length).toBeGreaterThanOrEqual(1);

    // Run fix
    const fixes: Fix[] = [];
    for (const d of actualDiagnosis) {
      if (skill.canAutoFix(d)) {
        const fixResult = await skill.fix(d, context);
        fixes.push(fixResult);
      }
    }

    // Apply all changes
    const allChanges = fixes.flatMap((f) => f.changes);
    const fixedCode = applyChanges(consoleCase.input.code, allChanges);

    // Evaluate fix
    const fixResult = evaluateFix(consoleCase, fixedCode);

    // The fix should wrap console in env check or remove it
    if (fixes.length > 0) {
      expect(fixResult.f1).toBeGreaterThan(0);
    }
  });

  it('should fix eval-usage in security golden case', async () => {
    const { SecuritySkill } = await import('../../src/skills/builtin/security');
    const skill = new SecuritySkill();
    const evalCase = getCasesBySkill('security').find((c) => c.id === 'sec-eval-002')!;

    const context = buildSkillContext(evalCase);

    // Run diagnosis
    const actualDiagnosis = await skill.diagnose(context);
    expect(actualDiagnosis.length).toBeGreaterThanOrEqual(1);

    // Run fix
    const fixes: Fix[] = [];
    for (const d of actualDiagnosis) {
      if (skill.canAutoFix(d)) {
        const fixResult = await skill.fix(d, context);
        fixes.push(fixResult);
      }
    }

    expect(fixes.length).toBeGreaterThanOrEqual(1);

    // Apply all changes
    const allChanges = fixes.flatMap((f) => f.changes);
    const fixedCode = applyChanges(evalCase.input.code, allChanges);

    // Evaluate fix
    const fixResult = evaluateFix(evalCase, fixedCode);
    expect(fixedCode).toContain('JSON.parse');
    expect(fixedCode).not.toContain('eval(');
  });

  it('should fix innerHTML XSS in security golden case', async () => {
    const { SecuritySkill } = await import('../../src/skills/builtin/security');
    const skill = new SecuritySkill();
    const xssCase = getCasesBySkill('security').find((c) => c.id === 'sec-innerhtml-003')!;

    const context = buildSkillContext(xssCase);

    // Run diagnosis
    const actualDiagnosis = await skill.diagnose(context);
    expect(actualDiagnosis.length).toBeGreaterThanOrEqual(1);

    // Run fix
    const fixes: Fix[] = [];
    for (const d of actualDiagnosis) {
      if (skill.canAutoFix(d)) {
        const fixResult = await skill.fix(d, context);
        fixes.push(fixResult);
      }
    }

    expect(fixes.length).toBeGreaterThanOrEqual(1);

    // Apply all changes
    const allChanges = fixes.flatMap((f) => f.changes);
    const fixedCode = applyChanges(xssCase.input.code, allChanges);

    // Evaluate fix
    const fixResult = evaluateFix(xssCase, fixedCode);
    expect(fixedCode).toContain('textContent');
    expect(fixedCode).not.toContain('innerHTML =');
  });

  it('should fix hardcoded-secret in security golden case', async () => {
    const { SecuritySkill } = await import('../../src/skills/builtin/security');
    const skill = new SecuritySkill();
    const secretCase = getCasesBySkill('security').find((c) => c.id === 'sec-hardcoded-key-001')!;

    const context = buildSkillContext(secretCase);

    // Run diagnosis
    const actualDiagnosis = await skill.diagnose(context);
    expect(actualDiagnosis.length).toBeGreaterThanOrEqual(1);

    // Run fix
    const fixes: Fix[] = [];
    for (const d of actualDiagnosis) {
      if (skill.canAutoFix(d)) {
        const fixResult = await skill.fix(d, context);
        fixes.push(fixResult);
      }
    }

    expect(fixes.length).toBeGreaterThanOrEqual(1);

    // Apply all changes
    const allChanges = fixes.flatMap((f) => f.changes);
    const fixedCode = applyChanges(secretCase.input.code, allChanges);

    // Evaluate fix
    expect(fixedCode).toContain('process.env');
    expect(fixedCode).not.toContain("'sk-1234567890abcdef'");
  });
});

