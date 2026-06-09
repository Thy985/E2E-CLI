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
  generateReport,
  checkQualityGate,
  runEval,
} from '../../engines/harness/evaluation-engine';
import {
  loadEvalHistory,
  saveEvalHistory,
  type EvalHistoryEntry,
} from '../../engines/harness/eval-history';
import { generateDashboard } from '../../engines/harness/dashboard';

const logger = createLogger();

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
  .option('--no-dashboard', 'Skip dashboard generation')
  .option('--dashboard-only', 'Only generate dashboard from history without running evaluation')
  .option('--output <file>', 'Dashboard output file path', 'qa-dashboard.html')
  .action(async (options: {
    skill?: string;
    difficulty?: string;
    threshold: string;
    list?: boolean;
    stats?: boolean;
    verbose?: boolean;
    noDashboard?: boolean;
    dashboardOnly?: boolean;
    output: string;
  }) => {
    // --dashboard-only
    if (options.dashboardOnly) {
      const history = loadEvalHistory();
      const dashboardHtml = generateDashboard({ entries: history });
      const fs = await import('fs');
      fs.writeFileSync(options.output, dashboardHtml);
      logger.info(`Dashboard generated: ${options.output}`);
      logger.info(`History entries: ${history.length}`);
      return;
    }

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

    try {
      const { overall, skipped } = await runEval({
        skill: options.skill,
        difficulty: options.difficulty as 'easy' | 'medium' | 'hard' | undefined,
        threshold: parseInt(options.threshold, 10),
        verbose: options.verbose,
        onProgress: (ev) => {
          if (options.verbose) {
            logger.info(
              `[${ev.caseId}] Diag F1=${ev.diagnosis.f1.toFixed(3)}  Fix F1=${ev.fix.f1.toFixed(3)}  Overall F1=${ev.overall.f1.toFixed(3)}  ` +
              `expected=${ev.diagnosis.expectedCount}  actual=${ev.diagnosis.actualCount}  ` +
              `TP=${ev.diagnosis.truePositives}  FP=${ev.diagnosis.falsePositives}  FN=${ev.diagnosis.falseNegatives}`,
            );
            if (ev.diagnosis.issueTypes.missed.length > 0) {
              logger.info(`  Missed: ${ev.diagnosis.issueTypes.missed.join(', ')}`);
            }
            if (ev.diagnosis.issueTypes.extra.length > 0) {
              logger.info(`  Extra:  ${ev.diagnosis.issueTypes.extra.join(', ')}`);
            }
          } else {
            const icon = ev.overall.passed ? '✅' : '❌';
            logger.info(
              `${icon} ${ev.caseId}  F1=${ev.overall.f1.toFixed(3)}  (${ev.diagnosis.actualCount} found / ${ev.diagnosis.expectedCount} expected)`,
            );
          }
        },
      });

      logger.info('');

      const report = generateReport(overall);
      logger.info(report);
      logger.info('');

      if (skipped > 0) {
        logger.info(`(Skipped ${skipped} cases — no matching skill)`);
        logger.info('');
      }

      // Quality gate
      const gate = checkQualityGate(overall, parseInt(options.threshold, 10));
      for (const line of gate.details) {
        logger.info(`  ${line}`);
      }
      logger.info('');

      // Save to evaluation history
      const historyEntry: EvalHistoryEntry = {
        timestamp: new Date().toISOString(),
        totalCases: overall.totalCases,
        passedCases: overall.passedCases,
        failedCases: overall.failedCases,
        avgPrecision: overall.avgPrecision,
        avgRecall: overall.avgRecall,
        avgF1: overall.avgF1,
        passRate: overall.passRate,
        bySkill: overall.bySkill,
        byDifficulty: overall.byDifficulty,
        qualityGatePassed: gate.passed,
      };
      saveEvalHistory(historyEntry);
      logger.info('📈 Evaluation saved to history');

      // Auto-generate dashboard (unless --no-dashboard)
      if (!options.noDashboard) {
        const history = loadEvalHistory();
        const dashboardHtml = generateDashboard({ entries: history });
        const fs = await import('fs');
        fs.writeFileSync(options.output, dashboardHtml);
        logger.info(`📊 Dashboard generated: ${options.output}`);
      }

      logger.info('');

      if (gate.passed) {
        logger.info('✅ Quality gate PASSED');
      } else {
        logger.warn('❌ Quality gate FAILED');
        process.exit(1);
      }
    } catch (err) {
      logger.error(`Evaluation failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });
