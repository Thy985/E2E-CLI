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

      // 解析审查维度
      const dimensions = options.focus.split(',').map((d: string) => d.trim());

      // 创建 Skill Context
      const context = {
        project: { path: options.path, name: 'test', type: 'webapp' as const },
        config,
        logger,
        tools: {} as any,
        model: {} as any,
        storage: {} as any,
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

      // 如果有 --preview 选项，预览修复效果
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

      // 返回码：有问题返回1，用于CI/CD
      process.exit(issues.length > 0 ? 1 : 0);

    } catch (error) {
      logger.error('❌ Audit failed:', error);
      process.exit(1);
    }
  });

async function outputResult(result: any, options: any, logger: any) {
  const { output } = options;

  switch (output) {
    case 'json':
      const jsonOutput = JSON.stringify(result, null, 2);
      if (options.outputFile) {
        await Bun.write(options.outputFile, jsonOutput);
        logger.info(`报告已保存到: ${options.outputFile}`);
      } else {
        console.log(jsonOutput);
      }
      break;

    case 'html':
      const htmlReport = generateHTMLReport(result);
      if (options.outputFile) {
        await Bun.write(options.outputFile, htmlReport);
        logger.info(`HTML报告已保存到: ${options.outputFile}`);
      } else {
        console.log(htmlReport);
      }
      break;

    case 'text':
    default:
      printTextReport(result);
      break;
  }
}

function printTextReport(result: any) {
  const { issues, summary } = result;

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                    UI/UX Audit Report');
  console.log('═══════════════════════════════════════════════════════════\n');

  // 统计信息
  console.log(`📊 Total: ${summary.total} issues`);
  console.log(`   🔴 Critical: ${summary.critical}`);
  console.log(`   🟡 Warning:  ${summary.warning}`);
  console.log(`   🔵 Info:     ${summary.info}\n`);

  // 按类别分组
  const byCategory = groupBy(issues, (i: any) => i.metadata?.category || 'other');

  for (const [category, categoryIssues] of Object.entries(byCategory)) {
    const categoryName = getCategoryName(category);
    console.log(`\n${categoryName} (${(categoryIssues as any[]).length})`);
    console.log('─'.repeat(50));

    (categoryIssues as any[]).forEach((issue: any) => {
      const severity = getSeverityIcon(issue.severity);
      console.log(`\n  ${severity} ${issue.title}`);
      console.log(`     File: ${issue.location.file}:${issue.location.line}`);
      console.log(`     Description: ${issue.description}`);
      
      if (issue.evidence?.code) {
        console.log(`     Code: ${issue.evidence.code}`);
      }
      
      if (issue.metadata?.suggestion) {
        console.log(`     Suggestion: ${issue.metadata.suggestion}`);
      }
    });
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');
}

function generateHTMLReport(result: any): string {
  // 简化版HTML报告
  return `
<!DOCTYPE html>
<html>
<head>
  <title>UI/UX Audit Report</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .issue { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .critical { border-left: 4px solid #ff4d4f; }
    .warning { border-left: 4px solid #faad14; }
    .info { border-left: 4px solid #1890ff; }
    .stats { display: flex; gap: 20px; margin: 20px 0; }
    .stat { padding: 10px 20px; background: #f5f5f5; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>UI/UX Audit Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
  </div>
  <div class="stats">
    <div class="stat">Total: ${result.summary.total}</div>
    <div class="stat">Critical: ${result.summary.critical}</div>
    <div class="stat">Warning: ${result.summary.warning}</div>
    <div class="stat">Info: ${result.summary.info}</div>
  </div>
  <div class="issues">
    ${result.issues.map((issue: any) => `
      <div class="issue ${issue.severity}">
        <h3>${issue.title}</h3>
        <p><strong>File:</strong> ${issue.location.file}:${issue.location.line}</p>
        <p><strong>Description:</strong> ${issue.description}</p>
        ${issue.metadata?.suggestion ? `<p><strong>Suggestion:</strong> ${issue.metadata.suggestion}</p>` : ''}
      </div>
    `).join('')}
  </div>
</body>
</html>
  `;
}

function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce((result, item) => {
    const key = keyFn(item);
    (result[key] = result[key] || []).push(item);
    return result;
  }, {} as Record<string, T[]>);
}

function getCategoryName(category: string): string {
  const names: Record<string, string> = {
    visual: '🎨 Visual',
    layout: '📐 Layout',
    interaction: '👆 Interaction',
    other: '📋 Other',
  };
  return names[category] || category;
}

function getSeverityIcon(severity: string): string {
  const icons: Record<string, string> = {
    critical: '🔴',
    warning: '🟡',
    info: '🔵',
  };
  return icons[severity] || '⚪';
}
