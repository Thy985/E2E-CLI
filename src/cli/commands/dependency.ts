/**
 * Dependency Command — 依赖健康检查
 */

import { Command } from 'commander';
import { createLogger } from '../../utils/logger';
import { DependencySkill } from '../../skills/builtin/dependency';
import { loadConfig } from '../../config';
import {
  buildCommandContext,
  summarizeIssues,
  writeOutput,
  exitWithIssueCount,
} from '../shared/report-helper';

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
      const context = buildCommandContext(options.path, config, logger);
      const issues = await skill.diagnose(context);
      const summary = summarizeIssues(issues);

      await writeOutput('Dependency Health Report', issues, summary, {
        format: options.output,
        outputFile: options.outputFile,
      });
      if (options.outputFile) {
        logger.info(`\n✅ Report saved to: ${options.outputFile}`);
      }
      exitWithIssueCount(issues);
    } catch (error) {
      logger.error('❌ Check failed:', error);
      process.exit(1);
    }
  });

export default dependencyCommand;
