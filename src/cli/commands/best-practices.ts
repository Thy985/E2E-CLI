/**
 * Best Practices Command
 * 
 * 前端最佳实践检查
 */

import { Command } from 'commander';
import { createLogger } from '../../utils/logger';
import { BestPracticesSkill } from '../../skills/builtin/best-practices';
import { loadConfig } from '../../config';
import { outputResult } from '../output/report-renderer';

export const bestPracticesCommand = new Command('best-practices')
  .description('Check frontend best practices')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-o, --output <format>', 'Output format: text, json, html', 'text')
  .option('-f, --output-file <file>', 'Output file path')
  .action(async (options) => {
    const logger = createLogger({ level: 'info' });

    try {
      logger.info('🔍 Checking best practices...\n');

      const config = await loadConfig(options.path);
      const skill = new BestPracticesSkill();

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
        title: 'Best Practices Report',
        getCategoryName,
      }, logger);

      process.exit(issues.length > 0 ? 1 : 0);

    } catch (error) {
      logger.error('❌ Check failed:', error);
      process.exit(1);
    }
  });

function getCategoryName(category: string): string {
  const names: Record<string, string> = {
    html: '📄 HTML',
    css: '🎨 CSS',
    image: '🖼️ Image',
    performance: '⚡ Performance',
    other: '📋 Other',
  };
  return names[category] || category;
}

export default bestPracticesCommand;
