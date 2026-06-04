/**
 * Fix Command
 *
 * CLI-only orchestration over `core/previewFixes` + `core/applyFixes`
 * + `engines/fix/batch.BatchFixEngine` for batch mode.
 *
 * Three modes:
 * - --batch : collect all issues via skills, run BatchFixEngine
 * - --issue : fix a single issue by id
 * - (no flag) : interactive listing
 */

import { Command } from 'commander';
import { createLogger } from '../../utils/logger';
import { loadConfig } from '../../config';
import { FixEngine } from '../../engines/fix';
import { BatchFixEngine } from '../../engines/fix/batch';
import { VerifyEngine } from '../../engines/verify';
import { UIUXSkill } from '../../skills/builtin/ui-ux';
import { BestPracticesSkill } from '../../skills/builtin/best-practices';
import { SEOSkill } from '../../skills/builtin/seo';
import { DependencySkill } from '../../skills/builtin/dependency';

export const fixCommand = new Command('fix')
  .description('Fix diagnosed issues')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-i, --issue <id>', 'Fix specific issue by ID')
  .option('-s, --skill <skill>', 'Fix issues from specific skill')
  .option('--batch', 'Batch fix all auto-fixable issues')
  .option('--auto-approve <level>', 'Auto-approve fixes: low, medium, high', 'low')
  .option('--dry-run', 'Preview fixes without applying')
  .option('--preview', 'Preview fixes in sandbox')
  .option('--verify', 'Verify fixes after applying')
  .option('-y, --yes', 'Skip confirmation and apply all fixes')
  .action(async (options) => {
    const logger = createLogger({ level: 'info' });

    try {
      const config = await loadConfig(options.path);

      if (options.batch) {
        await runBatchFix(options, config, logger);
      } else if (options.issue) {
        await runSingleFix(options, config, logger);
      } else {
        await runInteractiveFix(options, config, logger);
      }
    } catch (error) {
      logger.error('Fix failed:', error);
      process.exit(1);
    }
  });

async function runBatchFix(options: any, config: any, logger: any) {
  logger.info('Running batch fix...\n');

  const allIssues = await collectAllIssues(options.path, config, logger);

  if (allIssues.length === 0) {
    logger.info('No issues found to fix.');
    return;
  }

  const batchEngine = new BatchFixEngine();

  const result = await batchEngine.batchFix(
    allIssues,
    {
      project: { path: options.path, name: 'project', type: 'webapp' as const },
      config,
      logger,
      tools: {} as any,
      model: {} as any,
      storage: {} as any,
    },
    {
      autoApproveLowRisk: options.autoApprove.includes('low'),
      autoApproveMediumRisk: options.autoApprove.includes('medium'),
      dryRun: options.dryRun,
      preview: options.preview,
      verify: options.verify,
    }
  );

  console.log('\n' + result.report);

  if (!options.dryRun) {
    const fs = await import('fs/promises');
    const path = await import('path');
    const reportPath = path.join(options.path, '.qa-agent', 'fix-report.md');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, result.report, 'utf-8');
    logger.info(`Report saved to: ${reportPath}`);
  }

  process.exit(result.failedFixes.length > 0 ? 1 : 0);
}

async function runSingleFix(options: any, config: any, logger: any) {
  logger.info(`Fixing issue: ${options.issue}\n`);

  const issue = await findIssueById(options.issue, options.path, config, logger);

  if (!issue) {
    logger.error(`Issue not found: ${options.issue}`);
    process.exit(1);
  }

  const fixEngine = new FixEngine({
    autoApproveLowRisk: true,
    sandboxEnabled: options.preview,
    previewBeforeApply: options.preview,
    verifyAfterApply: options.verify,
  });

  logger.info(`Would fix: ${issue.title}`);

  if (options.dryRun) {
    logger.info('[DRY-RUN] No changes applied.');
  }
}

async function runInteractiveFix(options: any, config: any, logger: any) {
  logger.info('Interactive fix mode\n');

  const allIssues = await collectAllIssues(options.path, config, logger);

  if (allIssues.length === 0) {
    logger.info('No issues found to fix.');
    return;
  }

  logger.info(`Found ${allIssues.length} issues:\n`);

  allIssues.forEach((issue, index) => {
    const autoFixable = issue.severity !== 'critical' ? '[Auto-fixable]' : '[Manual]';
    logger.info(`${index + 1}. [${issue.severity}] ${issue.title} ${autoFixable}`);
  });

  logger.info('\nUse --batch to fix all auto-fixable issues.');
  logger.info('Use --issue <id> to fix a specific issue.');
}

async function collectAllIssues(projectPath: string, config: any, logger: any): Promise<any[]> {
  const issues: any[] = [];
  const context = {
    project: { path: projectPath, name: 'project', type: 'webapp' as const },
    config,
    logger,
    tools: {} as any,
    model: {} as any,
    storage: {} as any,
  };

  for (const SkillCtor of [UIUXSkill, BestPracticesSkill, SEOSkill, DependencySkill]) {
    try {
      const skill = new SkillCtor();
      issues.push(...(await skill.diagnose(context)));
    } catch {
      // ignore
    }
  }

  return issues;
}

async function findIssueById(id: string, projectPath: string, config: any, logger: any): Promise<any | null> {
  const allIssues = await collectAllIssues(projectPath, config, logger);
  return allIssues.find((issue) => issue.id === id) || null;
}

export default fixCommand;
