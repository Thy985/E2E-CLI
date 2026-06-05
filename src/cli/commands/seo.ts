/**
 * SEO Command
 * 
 * SEO 优化检查
 */

import { Command } from 'commander';
import { createLogger } from '../../utils/logger';
import { SEOSkill } from '../../skills/builtin/seo';
import { loadConfig } from '../../config';
import * as fs from 'fs/promises';

export const seoCommand = new Command('seo')
  .description('Check SEO optimization')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-o, --output <format>', 'Output format: text, json, html', 'text')
  .option('-f, --output-file <file>', 'Output file path')
  .action(async (options) => {
    const logger = createLogger({ level: 'info' });

    try {
      logger.info('🔍 Checking SEO optimization...\n');

      const config = await loadConfig(options.path);
      const skill = new SEOSkill();

      const context = {
        project: { path: options.path, name: 'test', type: 'webapp' as const },
        config,
        logger,
        tools: {} as any,
        model: {} as any,
        storage: {} as any,
      };

      const issues = await skill.diagnose(context);

      const result = {
        issues,
        summary: {
          total: issues.length,
          critical: issues.filter((i: any) => i.severity === 'critical').length,
          warning: issues.filter((i: any) => i.severity === 'warning').length,
          info: issues.filter((i: any) => i.severity === 'info').length,
        }
      };

      // 输出结果
      if (options.output === 'json') {
        logger.info(JSON.stringify(result, null, 2));
        if (options.outputFile) {
          await fs.writeFile(options.outputFile, JSON.stringify(result, null, 2), 'utf-8');
          logger.info(`\n✅ Report saved to: ${options.outputFile}`);
        }
      } else if (options.output === 'html') {
        const html = generateHTMLReport(result);
        if (options.outputFile) {
          await fs.writeFile(options.outputFile, html, 'utf-8');
          logger.info(`\n✅ Report saved to: ${options.outputFile}`);
        } else {
          logger.info(html);
        }
      } else {
        printTextReport(result, logger);
        if (options.outputFile) {
          const text = generateTextReport(result);
          await fs.writeFile(options.outputFile, text, 'utf-8');
          logger.info(`\n✅ Report saved to: ${options.outputFile}`);
        }
      }

      process.exit(issues.length > 0 ? 1 : 0);

    } catch (error) {
      logger.error('❌ Check failed:', error);
      process.exit(1);
    }
  });

function printTextReport(result: any, logger: any) {
  const { issues, summary } = result;

  logger.info('\n═══════════════════════════════════════════════════════════');
  logger.info('                    SEO Report');
  logger.info('═══════════════════════════════════════════════════════════\n');

  logger.info(`📊 Total: ${summary.total} issues`);
  logger.info(`   🔴 Critical: ${summary.critical}`);
  logger.info(`   🟡 Warning:  ${summary.warning}`);
  logger.info(`   🔵 Info:     ${summary.info}\n`);

  // 按类别分组
  const byCategory = groupBy(issues, (i: any) => i.metadata?.category || 'other');

  for (const [category, categoryIssues] of Object.entries(byCategory)) {
    const categoryName = getCategoryName(category);
    logger.info(`\n${categoryName} (${(categoryIssues as any[]).length})`);
    logger.info('─'.repeat(50));

    (categoryIssues as any[]).forEach((issue: any) => {
      const severity = getSeverityIcon(issue.severity);
      logger.info(`\n  ${severity} ${issue.title}`);
      logger.info(`     File: ${issue.location.file}:${issue.location.line}`);
      logger.info(`     Description: ${issue.description}`);
      
      if (issue.metadata?.suggestion) {
        logger.info(`     Suggestion: ${issue.metadata.suggestion}`);
      }
    });
  }

  logger.info('\n═══════════════════════════════════════════════════════════\n');
}

function generateTextReport(result: any): string {
  const { issues, summary } = result;
  const lines: string[] = [];

  lines.push('\n═══════════════════════════════════════════════════════════');
  lines.push('                    SEO Report');
  lines.push('═══════════════════════════════════════════════════════════\n');

  lines.push(`📊 Total: ${summary.total} issues`);
  lines.push(`   🔴 Critical: ${summary.critical}`);
  lines.push(`   🟡 Warning:  ${summary.warning}`);
  lines.push(`   🔵 Info:     ${summary.info}\n`);

  const byCategory = groupBy(issues, (i: any) => i.metadata?.category || 'other');

  for (const [category, categoryIssues] of Object.entries(byCategory)) {
    const categoryName = getCategoryName(category);
    lines.push(`\n${categoryName} (${(categoryIssues as any[]).length})`);
    lines.push('─'.repeat(50));

    (categoryIssues as any[]).forEach((issue: any) => {
      const severity = getSeverityIcon(issue.severity);
      lines.push(`\n  ${severity} ${issue.title}`);
      lines.push(`     File: ${issue.location.file}:${issue.location.line}`);
      lines.push(`     Description: ${issue.description}`);
      
      if (issue.metadata?.suggestion) {
        lines.push(`     Suggestion: ${issue.metadata.suggestion}`);
      }
    });
  }

  lines.push('\n═══════════════════════════════════════════════════════════\n');
  return lines.join('\n');
}

function generateHTMLReport(result: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>SEO Report</title>
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
    <h1>SEO Report</h1>
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
    seo: '🔍 SEO',
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

export default seoCommand;
