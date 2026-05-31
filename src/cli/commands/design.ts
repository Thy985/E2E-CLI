/**
 * Design Command
 * 
 * 设计规范管理命令
 * 
 * Commands:
 * - qa-agent design sync     从 Figma 同步设计令牌
 * - qa-agent design compare  对比代码与 Figma 设计稿
 * - qa-agent design export   导出设计规范文档
 */

import { Command } from 'commander';
import { createLogger } from '../../utils/logger';
import { FigmaSync } from '../../integrations/figma/sync';
import { FigmaCompare } from '../../integrations/figma/compare';
import { DesignTokenExtractor } from '../../skills/builtin/uiux/design-token-extractor';
import { loadConfig } from '../../config';

export const designCommand = new Command('design')
  .description('Design system management')
  .addCommand(
    new Command('sync')
      .description('Sync design tokens from Figma')
      .option('-t, --token <token>', 'Figma access token')
      .option('-f, --file <fileKey>', 'Figma file key')
      .option('-p, --path <path>', 'Project path', process.cwd())
      .option('--format <format>', 'Output format: css, scss, js, ts, json', 'css')
      .option('-o, --output <path>', 'Output file path')
      .option('--prefix <prefix>', 'CSS variable prefix')
      .action(async (options) => {
        const logger = createLogger({ level: 'info' });

        try {
          // 获取 token
          const token = options.token || process.env.FIGMA_ACCESS_TOKEN;
          if (!token) {
            logger.error('❌ Figma access token is required. Set FIGMA_ACCESS_TOKEN env var or use --token');
            process.exit(1);
          }

          // 获取 file key
          const fileKey = options.file;
          if (!fileKey) {
            logger.error('❌ Figma file key is required. Use --file');
            process.exit(1);
          }

          logger.info('🔄 Syncing design tokens from Figma...');

          const sync = new FigmaSync(token);
          await sync.sync(fileKey, {
            projectPath: options.path,
            format: options.format,
            outputPath: options.output,
            prefix: options.prefix,
          });

          const outputPath = options.output || `src/styles/tokens.${options.format}`;
          logger.info(`✅ Design tokens synced to: ${outputPath}`);

        } catch (error) {
          logger.error('❌ Sync failed:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('compare')
      .description('Compare code with Figma design')
      .option('-t, --token <token>', 'Figma access token')
      .option('-f, --file <fileKey>', 'Figma file key')
      .option('-p, --path <path>', 'Project path', process.cwd())
      .option('-o, --output <path>', 'Report output path')
      .action(async (options) => {
        const logger = createLogger({ level: 'info' });

        try {
          // 获取 token
          const token = options.token || process.env.FIGMA_ACCESS_TOKEN;
          if (!token) {
            logger.error('❌ Figma access token is required');
            process.exit(1);
          }

          // 获取 file key
          const fileKey = options.file;
          if (!fileKey) {
            logger.error('❌ Figma file key is required');
            process.exit(1);
          }

          logger.info('🔍 Comparing code with Figma design...');

          // 提取代码中的设计令牌
          const extractor = new DesignTokenExtractor();
          const config = await loadConfig(options.path);
          const codeTokens = await extractor.extract(options.path, config);

          // 对比
          const compare = new FigmaCompare(token);
          const result = await compare.compareTokens(fileKey, codeTokens, options.path);

          // 生成报告
          const report = compare.generateReport(result);

          // 输出报告
          if (options.output) {
            const fs = await import('fs');
            fs.writeFileSync(options.output, report, 'utf-8');
            logger.info(`✅ Report saved to: ${options.output}`);
          } else {
            console.log('\n' + report);
          }

          // 统计
          const total = result.matches.length + result.mismatches.length + result.missing.length;
          const matchRate = total > 0 ? (result.matches.length / total) * 100 : 100;
          
          logger.info(`\n📊 Match Rate: ${matchRate.toFixed(1)}%`);
          
          if (result.mismatches.length > 0 || result.missing.length > 0) {
            process.exit(1);
          }

        } catch (error) {
          logger.error('❌ Comparison failed:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('export')
      .description('Export design tokens documentation')
      .option('-p, --path <path>', 'Project path', process.cwd())
      .option('-o, --output <path>', 'Output path', 'DESIGN_TOKENS.md')
      .action(async (options) => {
        const logger = createLogger({ level: 'info' });

        try {
          logger.info('📄 Exporting design tokens documentation...');

          // 提取设计令牌
          const extractor = new DesignTokenExtractor();
          const config = await loadConfig(options.path);
          const tokens = await extractor.extract(options.path, config);

          // 生成文档
          let doc = '# Design Tokens\n\n';
          doc += 'This document contains all design tokens used in the project.\n\n';

          // 颜色
          if (Object.keys(tokens.colors).length > 0) {
            doc += '## Colors\n\n';
            doc += '| Name | Value |\n';
            doc += '|------|-------|\n';
            for (const [name, value] of Object.entries(tokens.colors)) {
              doc += `| ${name} | ${value} |\n`;
            }
            doc += '\n';
          }

          // 间距
          if (Object.keys(tokens.spacing).length > 0) {
            doc += '## Spacing\n\n';
            doc += '| Name | Value |\n';
            doc += '|------|-------|\n';
            for (const [name, value] of Object.entries(tokens.spacing)) {
              doc += `| ${name} | ${value} |\n`;
            }
            doc += '\n';
          }

          // 圆角
          if (Object.keys(tokens.borderRadius).length > 0) {
            doc += '## Border Radius\n\n';
            doc += '| Name | Value |\n';
            doc += '|------|-------|\n';
            for (const [name, value] of Object.entries(tokens.borderRadius)) {
              doc += `| ${name} | ${value} |\n`;
            }
            doc += '\n';
          }

          // 写入文件
          const fs = await import('fs');
          fs.writeFileSync(options.output, doc, 'utf-8');

          logger.info(`✅ Documentation exported to: ${options.output}`);

        } catch (error) {
          logger.error('❌ Export failed:', error);
          process.exit(1);
        }
      })
  );

export default designCommand;
