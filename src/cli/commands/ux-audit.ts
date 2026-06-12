/**
 * UI/UX 审查命令
 * 
 * 命令: qa-agent ux-audit
 */

import { Command } from 'commander';
import { loadConfig } from '../../config';
import { createLogger } from '../../utils/logger';
import { UIUXSkill } from '../../skills/builtin/uiux';
import { createSkillRegistry } from '../../skills/registry';
import { FixEngine } from '../../engines/fix';
import { createTools } from '../../tools';
import { createModelClient, ModelProvider } from '../../models';
import { createStorage } from '../../storage';
import { outputResult } from '../output/report-renderer';

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

      // 加载配置
      const config = await loadConfig(options.path);
      
      // 创建 Skill Registry
      const registry = createSkillRegistry(logger);
      
      // 注册 UI/UX Skill
      const uiuxSkill = new UIUXSkill();
      registry.register(uiuxSkill);

      // Create Skill Context
      const VALID_PROVIDERS: ModelProvider[] = ['deepseek', 'openai', 'claude', 'siliconflow', 'groq', 'minimax'];
      const provider = (config.model?.provider && VALID_PROVIDERS.includes(config.model?.provider as ModelProvider))
        ? config.model?.provider as ModelProvider
        : undefined;

      const context = {
        project: { path: options.path, name: 'test', type: 'webapp' as const },
        config,
        logger,
        tools: createTools(options.path),
        model: createModelClient({
          provider,
          model: config.model?.model,
          apiKey: config.model?.apiKey,
          baseUrl: config.model?.baseUrl,
        }),
        storage: createStorage(),
      };

      // 执行审查
      const issues = await uiuxSkill.diagnose(context);

      // 构建结果
      const result = {
        issues,
        summary: {
          total: issues.length,
          critical: issues.filter((i: any) => i.severity === 'critical').length,
          warning: issues.filter((i: any) => i.severity === 'warning').length,
          info: issues.filter((i: any) => i.severity === 'info').length,
        }
      };

      // 渲染输出（之前该步骤缺失，导致命令只退出码不打印报告）
      await outputResult(result, {
        output: options.output,
        outputFile: options.outputFile,
        title: 'UI/UX Audit Report',
        getCategoryName,
        renderIssueMetadata: (issue: any) => {
          const lines: string[] = [];
          if (issue.evidence?.code) {
            lines.push(`Code: ${issue.evidence.code}`);
          }
          return lines;
        },
      }, logger);

      // 如果有 --preview 选项，预览修复效果
      if (options.preview && options.fix) {
        logger.info('🔍 Previewing fixes in sandbox...');
        
        const fixEngine = new FixEngine({
          autoApproveLowRisk: false,
          sandboxEnabled: true,
          previewBeforeApply: true,
          verifyAfterFix: true,
          compileCheck: true,
        });

        for (const issue of issues) {
          if (uiuxSkill.canAutoFix(issue)) {
            try {
              const fix = await uiuxSkill.fix(issue, context);
              const previewResult = await fixEngine.previewFix(issue, fix, options.path);
              
              if (previewResult.success) {
                logger.info(`✅ Preview ready for ${issue.title}`);
                logger.info(`   Before: ${previewResult.beforeScreenshot}`);
                logger.info(`   After: ${previewResult.afterScreenshot}`);
                if (previewResult.diffPercentage !== undefined) {
                  logger.info(`   Diff: ${previewResult.diffPercentage.toFixed(2)}%`);
                }
              }
            } catch (error) {
              logger.error(`Failed to preview fix for ${issue.title}:`, error);
            }
          }
        }
      }

      // 如果有 --fix 选项，执行自动修复
      let fixAppliedCount = 0;
      if (options.fix && !options.preview) {
        const fixEngine = new FixEngine({
          autoApproveLowRisk: true,
          sandboxEnabled: false,
          previewBeforeApply: false,
          verifyAfterFix: true,
          compileCheck: true,
        });

        for (const issue of issues) {
          if (uiuxSkill.canAutoFix(issue)) {
            try {
              const fix = await uiuxSkill.fix(issue, context);
              const result = await fixEngine.applyFix(fix, options.path);
              if (result.success) {
                fixAppliedCount++;
                logger.info(`✅ Fixed: ${issue.title}`);
              }
            } catch (error) {
              logger.error(`Failed to fix ${issue.title}:`, error);
            }
          }
        }
      }

      // 返回码逻辑：
      // --strict 模式：任何 issues 都返回 1
      // --fix 且修复成功：即使有 info 级别问题也返回 0
      // 默认：只有 critical/warning 才返回 1
      let exitCode = 0;
      if (options.strict) {
        exitCode = issues.length > 0 ? 1 : 0;
      } else if (options.fix && fixAppliedCount > 0) {
        // --fix was used and fixes were applied; exit 0 even with info issues
        const remainingCriticalOrWarning = issues.filter(
          (i: any) => i.severity === 'critical' || i.severity === 'warning'
        ).length;
        exitCode = remainingCriticalOrWarning > 0 ? 1 : 0;
      } else {
        const criticalOrWarning = issues.filter(
          (i: any) => i.severity === 'critical' || i.severity === 'warning'
        ).length;
        exitCode = criticalOrWarning > 0 ? 1 : 0;
      }
      process.exit(exitCode);

    } catch (error) {
      logger.error('❌ Audit failed:', error);
      process.exit(1);
    }
  });

function getCategoryName(category: string): string {
  const names: Record<string, string> = {
    visual: '🎨 Visual',
    layout: '📐 Layout',
    interaction: '👆 Interaction',
    other: '📋 Other',
  };
  return names[category] || category;
}
