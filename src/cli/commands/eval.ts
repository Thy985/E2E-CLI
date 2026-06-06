import { Command } from 'commander';
import { createLogger } from '../../utils/logger';

const logger = createLogger();
import { getAllCases, getGoldenSetStats, getCasesBySkill } from '../../engines/harness/golden-set';
import {
  evaluateDiagnosis,
  computeOverallEvaluation,
  generateReport,
  checkQualityGate,
} from '../../engines/harness/evaluation-engine';
import type { Diagnosis } from '../../types';
import type { CaseEvaluation } from '../../engines/harness/types';

// ---------------------------------------------------------------------------
// Skill 映射 — 将 golden case 映射到实际的 skill 诊断函数
// ---------------------------------------------------------------------------
import { A11ySkill } from '../../skills/builtin/a11y';
import { SecuritySkill } from '../../skills/builtin/security';
import { PerformanceSkill } from '../../skills/builtin/performance';

const skillInstances: Record<string, InstanceType<typeof A11ySkill>> = {
  a11y: new A11ySkill(),
  security: new SecuritySkill() as unknown as InstanceType<typeof A11ySkill>,
  performance: new PerformanceSkill() as unknown as InstanceType<typeof A11ySkill>,
};

// ---------------------------------------------------------------------------
// Eval 命令
// ---------------------------------------------------------------------------
export const evalCommand = new Command('eval')
  .description('Run evaluation against the Golden Set benchmark')
  .option('--skill <skill>', 'Evaluate specific skill (a11y, security, performance)')
  .option('--difficulty <level>', 'Filter by difficulty (easy, medium, hard)')
  .option('--threshold <number>', 'Pass threshold percentage (default: 80)', '80')
  .option('--list', 'List all golden cases without running')
  .option('--stats', 'Show golden set statistics')
  .action(async (options: {
    skill?: string;
    difficulty?: string;
    threshold: string;
    list?: boolean;
    stats?: boolean;
  }) => {
    const threshold = parseInt(options.threshold, 10);

    // --stats: show golden set stats
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

    // --list: list cases
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

    // Run evaluation
    logger.info('Running Golden Set evaluation...');
    logger.info('');

    let cases = getAllCases();
    if (options.skill) {
      cases = getCasesBySkill(options.skill);
      if (cases.length === 0) {
        logger.warn(`Unknown skill: ${options.skill}`);
        logger.info(`Available skills: a11y, security, performance`);
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

    for (const testCase of cases) {
      const skill = skillInstances[testCase.skill as keyof typeof skillInstances];
      if (!skill) {
        logger.warn(`Skipping ${testCase.id}: no skill instance for "${testCase.skill}"`);
        continue;
      }

      // TODO: 需要 skill 暴露 checkFile 或通过 SkillManager 调用
      // 当前跳过实际评估，直接输出占位结果
      const dummyDiagnosis: Diagnosis[] = [];
      const diagMetrics = evaluateDiagnosis(testCase, dummyDiagnosis);

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
        duration: 0,
      });
    }

    const overall = computeOverallEvaluation(evaluations);
    const report = generateReport(overall);
    logger.info(report);
    logger.info('');

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
