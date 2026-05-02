/**
 * Fix Command
 * 
 * 修复命令 - 支持单问题修复和批量修复
 */

import { Command } from 'commander';
import { createLogger } from '../../utils/logger';
import { loadConfig } from '../../config';
import { FixEngine } from '../../engines/fix';
import { BatchFixEngine } from '../../engines/fix/batch';
import { VerifyEngine } from '../../engines/verify';
import { UIUXSkill } from '../../skills/builtin/uiux';
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
        // 批量修复模式
        await runBatchFix(options, config, logger);
      } else if (options.issue) {
        // 单问题修复模式
        await runSingleFix(options, config, logger);
      } else {
        // 交互式修复模式
        await runInteractiveFix(options, config, logger);
      }

    } catch (error) {
      logger.error('Fix failed:', error);
      process.exit(1);
    }
  });

async function runBatchFix(options: any, config: any, logger: any) {
  logger.info('Running batch fix...\n');

  // 收集所有问题
  const allIssues = await collectAllIssues(options.path, config, logger);
  
  if (allIssues.length === 0) {
    logger.info('No issues found to fix.');
    return;
  }

  // 创建批量修复引擎
  const batchEngine = new BatchFixEngine();
  
  // 执行批量修复
  const result = await batchEngine.batchFix(
    allIssues,
    {
      project: { rootPath: options.path, name: 'project', type: 'web' },
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

  // 输出结果
  console.log('\n' + result.report);

  // 保存报告
  if (!options.dryRun) {
    const fs = await import('fs');
    const path = await import('path');
    const reportPath = path.join(options.path, '.qa-agent', 'fix-report.md');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, result.report, 'utf-8');
    logger.info(`Report saved to: ${reportPath}`);
  }

  process.exit(result.failedFixes.length > 0 ? 1 : 0);
}

async function runSingleFix(options: any, config: any, logger: any) {
  logger.info(`Fixing issue: ${options.issue}\n`);
  
  // 查找问题
  const issue = await findIssueById(options.issue, options.path, config, logger);
  
  if (!issue) {
    logger.error(`Issue not found: ${options.issue}`);
    process.exit(1);
  }

  // 生成并应用修复
  const fixEngine = new FixEngine({
    autoApproveLowRisk: true,
    sandboxEnabled: options.preview,
    previewBeforeApply: options.preview,
    verifyAfterFix: options.verify,
  });

  // 这里应该调用 Skill 的 fix 方法
  logger.info(`Would fix: ${issue.title}`);
  
  if (options.dryRun) {
    logger.info('[DRY-RUN] No changes applied.');
  }
}

async function runInteractiveFix(options: any, config: any, logger: any) {
  logger.info('Interactive fix mode\n');
  
  // 收集所有问题
  const allIssues = await collectAllIssues(options.path, config, logger);
  
  if (allIssues.length === 0) {
    logger.info('No issues found to fix.');
    return;
  }

  // 显示问题列表
  logger.info(`Found ${allIssues.length} issues:\n`);
  
  allIssues.forEach((issue, index) => {
    const autoFixable = issue.severity !== 'critical' ? '[Auto-fixable]' : '[Manual]';
    logger.info(`${index + 1}. [${issue.severity}] ${issue.title} ${autoFixable}`);
  });

  logger.info('\nUse --batch to fix all auto-fixable issues.');
  logger.info('Use --issue <id> to fix a specific issue.');
}

// 辅助函数

async function collectAllIssues(projectPath: string, config: any, logger: any): Promise<any[]> {
  const issues: any[] = [];
  const context = {
    project: { rootPath: projectPath, name: 'project', type: 'web' },
    config,
    logger,
    tools: {} as any,
    model: {} as any,
    storage: {} as any,
  };

  // UI/UX
  try {
    const uiuxSkill = new UIUXSkill();
    const uiuxIssues = await uiuxSkill.diagnose(context);
    issues.push(...uiuxIssues);
  } catch (e) {
    // 忽略错误
  }

  // Best Practices
  try {
    const bpSkill = new BestPracticesSkill();
    const bpIssues = await bpSkill.diagnose(context);
    issues.push(...bpIssues);
  } catch (e) {
    // 忽略错误
  }

  // SEO
  try {
    const seoSkill = new SEOSkill();
    const seoIssues = await seoSkill.diagnose(context);
    issues.push(...seoIssues);
  } catch (e) {
    // 忽略错误
  }

  // Dependency
  try {
    const depSkill = new DependencySkill();
    const depIssues = await depSkill.diagnose(context);
    issues.push(...depIssues);
  } catch (e) {
    // 忽略错误
  }

  return issues;
}

async function findIssueById(id: string, projectPath: string, config: any, logger: any): Promise<any | null> {
  const allIssues = await collectAllIssues(projectPath, config, logger);
  return allIssues.find(issue => issue.id === id) || null;
}

export default fixCommand;
