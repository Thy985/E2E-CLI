/**
 * Dependency Command
 * 
 * 依赖健康检查
 */

import { Command } from 'commander';
import { createLogger } from '../../utils/logger';
import { DependencySkill } from '../../skills/builtin/dependency';
import { loadConfig } from '../../config';
import { outputResult } from '../output/report-renderer';

export const dependencyCommand = new Command('dependency')
  .description('Check dependency health')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-o, --output <format>', 'Output format: text, json, html', 'text')
  .option('-f, --output-file <file>', 'Output file path')
  .action(async (options) => {
    const logger = createLogger({ level: 'info' });

    try {
      logger.info('🔍 Checking dependency health...\n');

      const config = await loadConfig(options.path);
      const skill = new DependencySkill();

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
      await outputResult(result, {
        output: options.output,
        outputFile: options.outputFile,
        title: 'Dependency Health Report',
        getCategoryName,
        renderIssueMetadata: (issue: any) => {
          const lines: string[] = [];
          if (issue.metadata?.package) {
            lines.push(`Package: ${issue.metadata.package}`);
          }
          if (issue.metadata?.current && issue.metadata?.latest) {
            lines.push(`Current: ${issue.metadata.current} → Latest: ${issue.metadata.latest}`);
          }
          return lines;
        },
        renderIssueMetadataHTML: (issue: any) => {
          let html = '';
          if (issue.metadata?.package) {
            html += `<p><strong>Package:</strong> ${issue.metadata.package}</p>`;
          }
          if (issue.metadata?.current && issue.metadata?.latest) {
            html += `<p><strong>Version:</strong> ${issue.metadata.current} → ${issue.metadata.latest}</p>`;
          }
          return html;
        },
      }, logger);

      process.exit(issues.length > 0 ? 1 : 0);

    } catch (error) {
      logger.error('❌ Check failed:', error);
      process.exit(1);
    }
  });

function getCategoryName(category: string): string {
  const names: Record<string, string> = {
    dependency: '📦 Dependencies',
    other: '📋 Other',
  };
  return names[category] || category;
}

export default dependencyCommand;
