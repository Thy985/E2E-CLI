/**
 * SEO Command
 * 
 * SEO 优化检查
 */

import { Command } from 'commander';
import { createLogger } from '../../utils/logger';
import { SEOSkill } from '../../skills/builtin/seo';
import { loadConfig } from '../../config';

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
        project: { rootPath: options.path, name: 'test', type: 'web' },
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
        console.log(JSON.stringify(result, null, 2));
      } else if (options.output === 'html') {
        const html = generateHTMLReport(result);
        if (options.outputFile) {
          const fs = await import('fs');
          fs.writeFileSync(options.outputFile, html, 'utf-8');
          logger.info(`\n✅ Report saved to: ${options.outputFile}`);
        } else {
          console.log(html);
        }
      } else {
        printTextReport(result);
      }

      process.exit(issues.length > 0 ? 1 : 0);

    } catch (error) {
      logger.error('❌ Check failed:', error);
      process.exit(1);
    }
  });

function printTextReport(result: any) {
  const { issues, summary } = result;

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                    SEO Report');
  console.log('═══════════════════════════════════════════════════════════\n');

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
      
      if (issue.metadata?.suggestion) {
        console.log(`     Suggestion: ${issue.metadata.suggestion}`);
      }
    });
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');
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
