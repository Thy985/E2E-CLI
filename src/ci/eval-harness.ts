/**
 * CI Entry Point for AI Harness Evaluation
 *
 * Run by GitHub Actions to evaluate Golden Set and check quality gate.
 * Exits with non-zero code if F1 score is below threshold.
 *
 * Usage:
 *   bun run src/ci/eval-harness.ts
 *   bun run src/ci/eval-harness.ts --skill security --threshold 85
 */

import {
  getAllCases,
  getCasesBySkill,
} from '../engines/harness/golden-set';
import {
  evaluateDiagnosis,
  evaluateFix,
  computeOverallEvaluation,
  generateReport,
  checkQualityGate,
  detectRegression,
} from '../engines/harness/evaluation-engine';
import type { Diagnosis, Fix, SkillContext, FileSystemTool, Logger } from '../types';
import type { GoldenTestCase, OverallEvaluation, CaseEvaluation } from '../engines/harness/types';

// Skill instances
import { A11ySkill } from '../skills/builtin/a11y';
import { SecuritySkill } from '../skills/builtin/security';
import { PerformanceSkill } from '../skills/builtin/performance';
import { ReactSkill } from '../skills/builtin/react';
import { VueSkill } from '../skills/builtin/vue';
import { NextJSSkill } from '../skills/builtin/framework/nextjs';
import { NuxtSkill } from '../skills/builtin/framework/nuxt';
import { E2ESkill } from '../skills/builtin/e2e';
import { UIUXSkill } from '../skills/builtin/uiux';
import { SEOSkill } from '../skills/builtin/seo';
import { APISkill } from '../skills/builtin/api';
import { DependencySkill } from '../skills/builtin/dependency';
import { ComplexitySkill } from '../skills/builtin/complexity';
import type { BaseSkill } from '../skills/base-skill';

import * as fs from 'fs';
import * as path from 'path';

const CACHE_DIR = '.qa-eval-cache';
const CACHE_FILE = 'latest-eval.json';

const skillInstances: Record<string, BaseSkill> = {
  a11y: new A11ySkill(),
  security: new SecuritySkill(),
  performance: new PerformanceSkill(),
  react: new ReactSkill(),
  vue: new VueSkill(),
  nextjs: new NextJSSkill(),
  nuxt: new NuxtSkill(),
  e2e: new E2ESkill(),
  uiux: new UIUXSkill(),
  seo: new SEOSkill(),
  api: new APISkill(),
  dependency: new DependencySkill(),
  complexity: new ComplexitySkill(),
};

// ---------------------------------------------------------------------------
// Virtual filesystem for golden-case evaluation
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

      const braceMatch = pattern.match(/\{([^}]+)\}/);
      if (braceMatch) {
        const exts = braceMatch[1].split(',');
        if (exts.includes(ext)) return [normalized];
      }

      if (pattern.includes('*.' + ext)) return [normalized];
      if (pattern === `**/*.${ext}`) return [normalized];

      return [];
    },

    async mkdir(): Promise<void> { /* no-op */ },

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
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

function buildSkillContext(
  testCase: GoldenTestCase,
): SkillContext {
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

async function runSkillDiagnosis(
  skill: BaseSkill,
  testCase: GoldenTestCase,
): Promise<Diagnosis[]> {
  const context = buildSkillContext(testCase);

  try {
    if (skill.init) {
      await skill.init(context);
    }
    return await skill.diagnose(context);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[WARN] Skill "${skill.name}" failed on ${testCase.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

function applyFileChanges(
  originalCode: string,
  changes: { type: string; oldContent?: string; content?: string; position?: { line: number } }[],
): string {
  let result = originalCode;

  for (const change of changes) {
    switch (change.type) {
      case 'replace':
        if (change.oldContent) {
          result = result.split(change.oldContent).join(change.content ?? '');
        }
        break;
      case 'insert':
        if (change.position) {
          const lines = result.split('\n');
          const insertLine = Math.min(change.position.line, lines.length);
          lines.splice(insertLine - 1, 0, change.content ?? '');
          result = lines.join('\n');
        } else {
          result += change.content ?? '';
        }
        break;
      case 'delete':
        if (change.oldContent) {
          result = result.split(change.oldContent).join('');
        } else if (change.position) {
          const lines = result.split('\n');
          lines.splice(change.position.line - 1, 1);
          result = lines.join('\n');
        }
        break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cache management for regression detection
// ---------------------------------------------------------------------------

function loadCachedEval(): OverallEvaluation | null {
  try {
    const cachePath = path.join(CACHE_DIR, CACHE_FILE);
    if (!fs.existsSync(cachePath)) return null;
    const content = fs.readFileSync(cachePath, 'utf-8');
    return JSON.parse(content) as OverallEvaluation;
  } catch {
    return null;
  }
}

function saveEvalCache(overall: OverallEvaluation): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  const cachePath = path.join(CACHE_DIR, CACHE_FILE);
  fs.writeFileSync(cachePath, JSON.stringify(overall, null, 2));
}

// ---------------------------------------------------------------------------
// Main evaluation runner
// ---------------------------------------------------------------------------

interface EvalOptions {
  skill?: string;
  threshold: number;
  jsonOutput?: string;
}

export async function runEvalHarness(options: EvalOptions = { threshold: 80 }): Promise<{
  success: boolean;
  overall: OverallEvaluation;
  regression?: { isRegression: boolean; details: string[] };
}> {
  // eslint-disable-next-line no-console
  console.log('='.repeat(60));
  console.log('  QA-Agent AI Harness Evaluation (CI Mode)');
  console.log('='.repeat(60));
  console.log('');

  let cases = getAllCases();

  if (options.skill) {
    cases = getCasesBySkill(options.skill);
    if (cases.length === 0) {
      // eslint-disable-next-line no-console
      console.error(`[ERROR] Unknown skill: ${options.skill}`);
      process.exit(1);
    }
  }

  if (cases.length === 0) {
    // eslint-disable-next-line no-console
    console.error('[ERROR] No cases match the filters');
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`Running evaluation on ${cases.length} cases...`);
  console.log('');

  interface CaseEval {
    caseId: string;
    skill: string;
    difficulty: string;
    diagnosis: ReturnType<typeof evaluateDiagnosis>;
    fix: ReturnType<typeof evaluateFix>;
    overall: { precision: number; recall: number; f1: number; passed: boolean };
    duration: number;
  }

  const evaluations: CaseEval[] = [];

  for (const testCase of cases) {
    const skill = skillInstances[testCase.skill];
    if (!skill) {
      // eslint-disable-next-line no-console
      console.warn(`[SKIP] ${testCase.id}: no skill for "${testCase.skill}"`);
      continue;
    }

    const startTime = Date.now();
    const actualDiagnosis = await runSkillDiagnosis(skill, testCase);
    const diagMetrics = evaluateDiagnosis(testCase, actualDiagnosis);

    let fixMetrics = evaluateFix(testCase, null);
    if (skill.fix && actualDiagnosis.length > 0) {
      try {
        const fixes: Fix[] = [];
        for (const d of actualDiagnosis) {
          if ((skill as BaseSkill).canAutoFix(d)) {
            const fixResult = await skill.fix(d, buildSkillContext(testCase));
            fixes.push(fixResult);
          }
        }

        if (fixes.length > 0) {
          const allChanges = fixes.flatMap((f) => f.changes);
          const fixedCode = applyFileChanges(testCase.input.code, allChanges);
          fixMetrics = evaluateFix(testCase, fixedCode);
        }
      } catch {
        // Fix failed — keep zero metrics
      }
    }

    const duration = Date.now() - startTime;

    const overallPrecision = (diagMetrics.precision + fixMetrics.precision) / 2;
    const overallRecall = (diagMetrics.recall + fixMetrics.recall) / 2;
    const overallF1 = overallPrecision + overallRecall > 0
      ? (2 * overallPrecision * overallRecall) / (overallPrecision + overallRecall)
      : 0;

    // eslint-disable-next-line no-console
    const icon = overallF1 >= 0.8 ? '✅' : '❌';
    // eslint-disable-next-line no-console
    console.log(
      `${icon} ${testCase.id}  F1=${overallF1.toFixed(3)}  ` +
      `(${diagMetrics.actualCount} found / ${diagMetrics.expectedCount} expected)`,
    );

    evaluations.push({
      caseId: testCase.id,
      skill: testCase.skill,
      difficulty: testCase.difficulty,
      diagnosis: diagMetrics,
      fix: fixMetrics,
      overall: {
        precision: overallPrecision,
        recall: overallRecall,
        f1: overallF1,
        passed: overallF1 >= 0.8,
      },
      duration,
    });
  }

  // eslint-disable-next-line no-console
  console.log('');

  const overall = computeOverallEvaluation(evaluations as unknown as CaseEvaluation[]);
  const report = generateReport(overall);
  // eslint-disable-next-line no-console
  console.log(report);
  // eslint-disable-next-line no-console
  console.log('');

  // Quality gate
  const gate = checkQualityGate(overall, options.threshold);
  for (const line of gate.details) {
    // eslint-disable-next-line no-console
    console.log(`  ${line}`);
  }
  // eslint-disable-next-line no-console
  console.log('');

  // Regression detection
  let regressionResult: { isRegression: boolean; details: string[] } | undefined;
  const cached = loadCachedEval();
  if (cached) {
    regressionResult = detectRegression(cached, overall);
    if (regressionResult.isRegression) {
      // eslint-disable-next-line no-console
      console.warn('⚠️  Regression detected:');
      for (const detail of regressionResult.details) {
        // eslint-disable-next-line no-console
        console.warn(`  - ${detail}`);
      }
      // eslint-disable-next-line no-console
      console.log('');
    }
  }

  // Save cache for next regression comparison
  saveEvalCache(overall);

  // Write JSON report if requested
  if (options.jsonOutput) {
    const outputPath = options.jsonOutput;
    const reportData = {
      timestamp: new Date().toISOString(),
      overall,
      regression: regressionResult,
      qualityGate: gate,
    };
    fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2));
    // eslint-disable-next-line no-console
    console.log(`JSON report written to: ${outputPath}`);
    // eslint-disable-next-line no-console
    console.log('');
  }

  if (gate.passed) {
    // eslint-disable-next-line no-console
    console.log('✅ Quality gate PASSED');
    return { success: true, overall, regression: regressionResult };
  } else {
    // eslint-disable-next-line no-console
    console.error('❌ Quality gate FAILED');
    return { success: false, overall, regression: regressionResult };
  }
}

// ---------------------------------------------------------------------------
// CLI entry point (when run directly)
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  let skill: string | undefined;
  let threshold = 80;
  let jsonOutput = 'qa-eval-report.json';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--skill' && i + 1 < args.length) {
      skill = args[++i];
    } else if (args[i] === '--threshold' && i + 1 < args.length) {
      threshold = parseInt(args[++i], 10);
    } else if (args[i] === '--json-output' && i + 1 < args.length) {
      jsonOutput = args[++i];
    }
  }

  const result = await runEvalHarness({ skill, threshold, jsonOutput });

  if (!result.success) {
    process.exit(1);
  }
}

// Run if executed directly (not imported)
if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
