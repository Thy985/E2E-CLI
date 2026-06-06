/**
 * Eval Command — AI Harness evaluation against Golden Set
 *
 * Runs each golden case through the real skill.diagnose() pipeline,
 * compares actual output against expectedDiagnosis, and computes
 * Precision / Recall / F1 metrics.
 */

import { Command } from 'commander';
import { createLogger } from '../../utils/logger';
import { getAllCases, getCasesBySkill, getGoldenSetStats } from '../../engines/harness/golden-set';
import {
  evaluateDiagnosis,
  computeOverallEvaluation,
  generateReport,
  checkQualityGate,
} from '../../engines/harness/evaluation-engine';
import type {
  Diagnosis,
  SkillContext,
  FileSystemTool,
  Logger,
} from '../../types';
import type { CaseEvaluation, GoldenTestCase } from '../../engines/harness/types';

// ---------------------------------------------------------------------------
// Skill instances
// ---------------------------------------------------------------------------
import { A11ySkill } from '../../skills/builtin/a11y';
import { SecuritySkill } from '../../skills/builtin/security';
import { PerformanceSkill } from '../../skills/builtin/performance';
import type { BaseSkill } from '../../skills/base-skill';

const logger = createLogger();

const skillInstances: Record<string, BaseSkill> = {
  a11y: new A11ySkill(),
  security: new SecuritySkill(),
  performance: new PerformanceSkill(),
};

// ---------------------------------------------------------------------------
// Virtual filesystem for golden-case evaluation
//
// Skills call tools.fs.glob() to discover files and tools.fs.readFile()
// to read them.  For evaluation we provide a single in-memory file that
// contains the golden-case source code.
// ---------------------------------------------------------------------------

function createVirtualFS(
  filePath: string,
  content: string,
): FileSystemTool {
  const normalized = filePath.replace(/^\//, ''); // strip leading slash

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
      // Match the virtual file against the glob pattern using simple heuristics
      const ext = normalized.split('.').pop() ?? '';
      const baseGlob = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
      const re = new RegExp(`^${baseGlob}$`);
      if (re.test(normalized)) return [normalized];

      // Handle brace expansion patterns like **/*.{js,ts,jsx,tsx}
      const braceMatch = pattern.match(/\{([^}]+)\}/);
      if (braceMatch) {
        const exts = braceMatch[1].split(',');
        if (exts.includes(ext)) return [normalized];
      }

      // Fallback: match by extension
      if (pattern.includes('*.' + ext)) return [normalized];
      if (pattern === `**/*.${ext}`) return [normalized];

      return [];
    },

    async mkdir(): Promise<void> {
      // no-op
    },

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

/** Minimal logger that discards output for quiet evaluation runs */
function createSilentLogger(): Logger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

// ---------------------------------------------------------------------------
// Build a SkillContext for a single golden case
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Run diagnosis on a single golden case
// ---------------------------------------------------------------------------

async function runSkillDiagnosis(
  skill: BaseSkill,
  testCase: GoldenTestCase,
): Promise<Diagnosis[]> {
  const context = buildSkillContext(testCase);

  try {
    // Some skills need init() before diagnose()
    if (skill.init) {
      await skill.init(context);
    }
    return await skill.diagnose(context);
  } catch (err) {
    logger.warn(
      `Skill "${skill.name}" failed on ${testCase.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// Eval command
// ---------------------------------------------------------------------------

export const evalCommand = new Command('eval')
  .description('Run evaluation against the Golden Set benchmark')
  .option('--skill <skill>', 'Evaluate specific skill (a11y, security, performance)')
  .option('--difficulty <level>', 'Filter by difficulty (easy, medium, hard)')
  .option('--threshold <number>', 'Pass threshold percentage (default: 80)', '80')
  .option('--list', 'List all golden cases without running')
  .option('--stats', 'Show golden set statistics')
  .option('--verbose', 'Show per-case details')
  .action(async (options: {
    skill?: string;
    difficulty?: string;
    threshold: string;
    list?: boolean;
    stats?: boolean;
    verbose?: boolean;
  }) => {
    const threshold = parseInt(options.threshold, 10);

    // --stats
    if (options.stats) {
      const stats = getGoldenSetStats();
      logger.info('Golden Set Statistics');
      logger.info(`Total cases: ${stats.total}`);
      logger.info('');
      logger.info('By Skill:');
      for (const [skill, count] of Object.entries(stats.bySkill)) {
        logger.info(`  ${skill}: ${count}`);
      }
      logger.info('');
      logger.info('By Difficulty:');
      for (const [diff, count] of Object.entries(stats.byDifficulty)) {
        logger.info(`  ${diff}: ${count}`);
      }
      return;
    }

    // --list
    if (options.list) {
      let cases = getAllCases();
      if (options.skill) {
        cases = getCasesBySkill(options.skill);
      }
      logger.info(`Golden Cases (${cases.length}):`);
      for (const c of cases) {
        logger.info(
          `  ${c.id}  skill=${c.skill}  difficulty=${c.difficulty}  expected=${c.expectedDiagnosis.issueCount} issues`,
        );
      }
      return;
    }

    // ---- Run evaluation ----
    logger.info('Running Golden Set evaluation...');
    logger.info('');

    let cases = getAllCases();
    if (options.skill) {
      cases = getCasesBySkill(options.skill);
      if (cases.length === 0) {
        logger.warn(`Unknown skill: ${options.skill}`);
        logger.info('Available skills: a11y, security, performance');
        process.exit(1);
      }
    }
    if (options.difficulty) {
      cases = cases.filter((c) => c.difficulty === options.difficulty);
    }

    if (cases.length === 0) {
      logger.warn('No cases match the filters');
      process.exit(1);
    }

    const evaluations: CaseEvaluation[] = [];
    let skipped = 0;

    for (const testCase of cases) {
      const skill = skillInstances[testCase.skill];
      if (!skill) {
        logger.warn(`Skipping ${testCase.id}: no skill for "${testCase.skill}"`);
        skipped++;
        continue;
      }

      // Run REAL skill diagnosis
      const startTime = Date.now();
      const actualDiagnosis = await runSkillDiagnosis(skill, testCase);
      const duration = Date.now() - startTime;

      // Evaluate against expected
      const diagMetrics = evaluateDiagnosis(testCase, actualDiagnosis);

      if (options.verbose) {
        logger.info(
          `[${testCase.id}] F1=${diagMetrics.f1.toFixed(3)}  ` +
          `expected=${diagMetrics.expectedCount}  actual=${diagMetrics.actualCount}  ` +
          `TP=${diagMetrics.truePositives}  FP=${diagMetrics.falsePositives}  FN=${diagMetrics.falseNegatives}`,
        );
        if (diagMetrics.issueTypes.missed.length > 0) {
          logger.info(`  Missed: ${diagMetrics.issueTypes.missed.join(', ')}`);
        }
        if (diagMetrics.issueTypes.extra.length > 0) {
          logger.info(`  Extra:  ${diagMetrics.issueTypes.extra.join(', ')}`);
        }
      } else {
        const icon = diagMetrics.f1 >= 0.8 ? '✅' : '❌';
        logger.info(
          `${icon} ${testCase.id}  F1=${diagMetrics.f1.toFixed(3)}  (${diagMetrics.actualCount} found / ${diagMetrics.expectedCount} expected)`,
        );
      }

      evaluations.push({
        caseId: testCase.id,
        skill: testCase.skill,
        difficulty: testCase.difficulty,
        diagnosis: diagMetrics,
        fix: {
          precision: 0,
          recall: 0,
          f1: 0,
          fixedCount: 0,
          expectedFixCount: 0,
        },
        overall: {
          precision: diagMetrics.precision,
          recall: diagMetrics.recall,
          f1: diagMetrics.f1,
          passed: diagMetrics.f1 >= 0.8,
        },
        duration,
      });
    }

    logger.info('');

    const overall = computeOverallEvaluation(evaluations);
    const report = generateReport(overall);
    logger.info(report);
    logger.info('');

    if (skipped > 0) {
      logger.info(`(Skipped ${skipped} cases — no matching skill)`);
      logger.info('');
    }

    // Quality gate
    const gate = checkQualityGate(overall, threshold);
    for (const line of gate.details) {
      logger.info(`  ${line}`);
    }
    logger.info('');

    if (gate.passed) {
      logger.info('✅ Quality gate PASSED');
    } else {
      logger.warn('❌ Quality gate FAILED');
      process.exit(1);
    }
  });
