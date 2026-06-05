/**
 * Fix Command — 修复命令（支持单问题修复和批量修复）
 *
 * 之前 6 个 `any` + 4 段 try/catch 硬编码 4 个 skill —— 现在用
 * BUILTIN_SKILLS 静态注册表，与 BatchFixEngine 保持一致。sync fs
 * 调用也换成了 fs/promises。
 */

import { Command } from 'commander';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { createLogger, Logger } from '../../utils/logger';
import { loadConfig, QAConfig } from '../../config';
import { FixEngine } from '../../engines/fix';
import { BatchFixEngine } from '../../engines/fix/batch';
import { buildCommandContext } from '../shared/report-helper';
import { BUILTIN_SKILLS, SkillCtor } from '../../skills/builtin';
import { Diagnosis, Fix, Skill } from '../../types';

interface FixCommandOptions {
  path: string;
  issue?: string;
  skill?: string;
  batch?: boolean;
  autoApprove: string;        // "low" / "low,medium" / "low,medium,high"
  dryRun?: boolean;
  preview?: boolean;
  verify?: boolean;
  yes?: boolean;
}

/**
 * skill 字符串名 → SkillCtor 的映射。和 BatchFixEngine 用同一份数据源，
 * 避免 pickSkillFor 和 collectAllIssues 各自维护一份硬编码列表。
 */
const SKILL_MAP: Record<string, SkillCtor> = Object.fromEntries(
  BUILTIN_SKILLS.map((Ctor) => [(new Ctor()).name, Ctor])
);

function pickSkillFor(skillName: string): Skill | null {
  const Ctor = SKILL_MAP[skillName];
  if (!Ctor) return null;
  const skill = new Ctor();
  if (typeof skill.fix !== 'function') return null;
  return skill;
}

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
  .action(async (rawOptions) => {
    const options = rawOptions as FixCommandOptions;
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

async function runBatchFix(options: FixCommandOptions, config: QAConfig, logger: Logger): Promise<void> {
  logger.info('Running batch fix...\n');

  const allIssues = await collectAllIssues(options.path, config, logger);

  if (allIssues.length === 0) {
    logger.info('No issues found to fix.');
    return;
  }

  const batchEngine = new BatchFixEngine();

  const result = await batchEngine.batchFix(
    allIssues,
    buildCommandContext(options.path, config, logger),
    {
      autoApproveLowRisk: options.autoApprove.includes('low'),
      autoApproveMediumRisk: options.autoApprove.includes('medium'),
      autoApproveHighRisk: options.autoApprove.includes('high'),
      dryRun: !!options.dryRun,
      preview: !!options.preview,
      verify: !!options.verify,
    }
  );

  console.log('\n' + result.report);

  if (!options.dryRun) {
    const reportPath = path.join(options.path, '.qa-agent', 'fix-report.md');
    await fsp.mkdir(path.dirname(reportPath), { recursive: true });
    await fsp.writeFile(reportPath, result.report, 'utf-8');
    logger.info(`Report saved to: ${reportPath}`);
  }

  process.exit(result.failedFixes.length > 0 ? 1 : 0);
}

async function runSingleFix(options: FixCommandOptions, config: QAConfig, logger: Logger): Promise<void> {
  logger.info(`Fixing issue: ${options.issue}\n`);

  const issue = await findIssueById(options.issue!, options.path, config, logger);
  if (!issue) {
    logger.error(`Issue not found: ${options.issue}`);
    process.exit(1);
  }

  const context = buildCommandContext(options.path, config, logger);
  const skill = pickSkillFor(issue.skill);
  if (!skill || !skill.fix) {
    logger.error(`No fixer available for skill: ${issue.skill}`);
    process.exit(1);
  }

  const fixEngine = new FixEngine({
    autoApproveLowRisk: true,
    sandboxEnabled: !!options.preview,
    previewBeforeApply: !!options.preview,
    verifyAfterFix: !!options.verify,
  });

  try {
    const fix: Fix = await skill.fix(issue, context);
    logger.info(`Would fix: ${issue.title} (${fix.changes?.length ?? 0} changes)`);

    if (options.dryRun) {
      logger.info('[DRY-RUN] No changes applied.');
      return;
    }

    if (fix.changes && fix.changes.length > 0) {
      const result = await fixEngine.applyFix(fix, options.path);
      if (result.success) {
        logger.info(`✅ Fix applied: ${issue.title}`);
        if (options.verify) {
          const verified = await fixEngine.verifyFix(fix, options.path);
          logger.info(verified ? '✅ Verification passed' : '⚠️ Verification failed');
        }
      } else {
        logger.error(`❌ Fix failed: ${result.error ?? 'unknown'}`);
        process.exit(1);
      }
    } else {
      logger.info('No changes produced for this issue.');
    }
  } catch (error) {
    logger.error(`Failed to fix issue: ${error}`);
    process.exit(1);
  }
}

async function runInteractiveFix(options: FixCommandOptions, config: QAConfig, logger: Logger): Promise<void> {
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

// 辅助函数

async function collectAllIssues(
  projectPath: string,
  config: QAConfig,
  logger: Logger
): Promise<Diagnosis[]> {
  const context = buildCommandContext(projectPath, config, logger);
  const issues: Diagnosis[] = [];

  // 数据驱动：遍历 BUILTIN_SKILLS，一个 try/catch 取代 4 段重复。
  for (const Ctor of BUILTIN_SKILLS) {
    try {
      const skill = new Ctor();
      const skillIssues = await skill.diagnose(context);
      issues.push(...skillIssues);
    } catch {
      // 单个 skill 诊断失败不应阻断其他 skill
    }
  }

  return issues;
}

async function findIssueById(
  id: string,
  projectPath: string,
  config: QAConfig,
  logger: Logger
): Promise<Diagnosis | null> {
  const allIssues = await collectAllIssues(projectPath, config, logger);
  return allIssues.find((issue) => issue.id === id) ?? null;
}

export default fixCommand;
