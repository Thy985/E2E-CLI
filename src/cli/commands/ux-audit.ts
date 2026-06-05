/**
 * UI/UX 审查命令
 */

import { Command } from 'commander';
import { loadConfig } from '../../config';
import { createLogger } from '../../utils/logger';
import { UIUXSkill } from '../../skills/builtin/uiux';
import { FixEngine } from '../../engines/fix';
import {
  buildCommandContext,
  summarizeIssues,
  writeOutput,
  exitWithIssueCount,
} from '../shared/report-helper';

export const uxAuditCommand = new Command('ux-audit')
  .description('UI/UX视觉规范审查')
  .option('-u, --url <url>', '目标URL（用于审查线上页面）')
  .option('-p, --path <path>', '项目路径', process.cwd())
  .option('-f, --focus <dimensions>', '审查维度 (visual,layout,interaction)', 'visual,layout,interaction')
  .option('--strict', '严格模式（零容忍）', false)
  .option('--fix', '自动修复问题', false)
  .option('--preview', '沙箱预览修复效果', false)
  .option('--dry-run', '仅预览不实际应用', false)
  .option('--output <format>', '输出格式 (text,json,html)', 'text')
  .option('-o, --output-file <file>', '输出文件路径')
  .action(async (options) => {
    const logger = createLogger({ level: 'info' });
    try {
      logger.info('🔍 Starting UI/UX Audit...\n');

      const config = await loadConfig(options.path);
      const uiuxSkill = new UIUXSkill();
      const context = buildCommandContext(options.path, config, logger);

      const issues = await uiuxSkill.diagnose(context);
      const summary = summarizeIssues(issues);

      await writeOutput('UI/UX Audit Report', issues, summary, {
        format: options.output,
        outputFile: options.outputFile,
      });
      if (options.outputFile) {
        logger.info(`\n✅ Report saved to: ${options.outputFile}`);
      }

      // --preview 与 --fix 联用：在沙箱里预览修复
      if (options.preview && options.fix) {
        logger.info('🔍 Previewing fixes in sandbox...');
        const fixEngine = new FixEngine({
          autoApproveLowRisk: false,
          sandboxEnabled: true,
          previewBeforeApply: true,
          verifyAfterFix: true,
        });
        for (const issue of issues) {
          if (uiuxSkill.canAutoFix(issue)) {
            try {
              const fix = await uiuxSkill.fix(issue, context);
              const previewResult = await fixEngine.previewFix(issue, fix, options.path);
              if (previewResult.success) {
                logger.info(`✅ Preview ready for ${issue.title}`);
                logger.info(`   URL: ${previewResult.previewUrl ?? 'n/a'}`);
              }
            } catch (error) {
              logger.error(`Failed to preview fix for ${issue.title}:`, error);
            }
          }
        }
      }

      exitWithIssueCount(issues);
    } catch (error) {
      logger.error('❌ Audit failed:', error);
      process.exit(1);
    }
  });

export default uxAuditCommand;
