/**
 * CI Command
 * Generate CI/CD configuration and run in CI mode
 */

import { createLogger } from '../../utils/logger';
import { createFormatter } from '../output/formatter';
import {
  CIConfig,
  DEFAULT_CI_CONFIG,
  writeCIConfig,
  detectCIPlatform,
  generateCIConfig,
} from '../../ci';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface CICommandOptions {
  platform?: string;
  skills?: string;
  failOn?: string;
  output?: string;
  schedule?: string;
  init?: boolean;
  path?: string;
}

export const ciCommand = {
  generate: async (options: CICommandOptions) => {
    const logger = createLogger({ level: 'info' });
    const formatter = createFormatter();
    await initCI(options, formatter, logger);
  },
  run: async (options: CICommandOptions) => {
    const logger = createLogger({ level: 'info' });
    const formatter = createFormatter();
    await runCI(options, formatter, logger);
  },
};

export async function ciCommandOld(action: string, options: CICommandOptions) {
  const logger = createLogger({ level: 'info' });
  const formatter = createFormatter();

  switch (action) {
    case 'init':
      await initCI(options, formatter, logger);
      break;
    
    case 'detect':
      await detectCI(options, formatter, logger);
      break;
    
    case 'run':
      await runCI(options, formatter, logger);
      break;
    
    default:
      formatter.error(`未知操作: ${action}`);
      formatter.info('可用操作: init, detect, run');
      process.exit(1);
  }
}

async function initCI(
  options: CICommandOptions,
  formatter: ReturnType<typeof createFormatter>,
  logger: ReturnType<typeof createLogger>
) {
  const projectPath = options.path || process.cwd();

  // Build config
  const config: CIConfig = {
    ...DEFAULT_CI_CONFIG,
    platform: (options.platform as CIConfig['platform']) || 'github',
    skills: options.skills?.split(',').map(s => s.trim()) || DEFAULT_CI_CONFIG.skills,
    failOn: (options.failOn as CIConfig['failOn']) || 'critical',
    outputFormat: (options.output as CIConfig['outputFormat']) || 'json',
    triggers: {
      ...DEFAULT_CI_CONFIG.triggers,
      schedule: options.schedule || '0 0 * * *',
    },
  };

  // Auto-detect platform if not specified
  if (!options.platform) {
    const detected = await detectCIPlatform(projectPath);
    if (detected) {
      config.platform = detected;
      formatter.info(`检测到 CI 平台: ${detected}`);
    }
  }

  formatter.info(`生成 ${config.platform} CI 配置...`);

  try {
    const filePath = await writeCIConfig(projectPath, config);
    formatter.success(`CI 配置已生成: ${filePath}`);
    
    // Print next steps
    logger.info('');
    logger.info('下一步:');
    logger.info(`1. 检查生成的配置文件: ${filePath}`);
    logger.info('2. 根据需要调整配置');
    logger.info('3. 提交到版本控制');
    logger.info('');
    logger.info('测试 CI 配置:');
    
    if (config.platform === 'github') {
      logger.info('  - Push 到分支触发');
      logger.info('  - 或在 Actions 页面手动触发');
    } else if (config.platform === 'gitlab') {
      logger.info('  - Push 到分支触发');
      logger.info('  - 或在 CI/CD > Pipelines 手动触发');
    }
    
  } catch (error: any) {
    formatter.error(`生成失败: ${error.message}`);
    process.exit(1);
  }
}

async function detectCI(
  options: CICommandOptions,
  formatter: ReturnType<typeof createFormatter>,
  logger: ReturnType<typeof createLogger>
) {
  const projectPath = options.path || process.cwd();
  
  const platform = await detectCIPlatform(projectPath);
  
  if (platform) {
    formatter.success(`检测到 CI 平台: ${platform}`);
    
    // Show existing config
    const { filename } = generateCIConfig({ ...DEFAULT_CI_CONFIG, platform });
    logger.info('');
    logger.info(`配置文件: ${filename}`);
  } else {
    formatter.info('未检测到 CI 配置');
    logger.info('');
    logger.info('支持的 CI 平台:');
    logger.info('  - github    (GitHub Actions)');
    logger.info('  - gitlab    (GitLab CI)');
    logger.info('  - jenkins   (Jenkins)');
    logger.info('  - circleci  (CircleCI)');
    logger.info('');
    logger.info('运行 qa-agent ci init 生成配置');
  }
}

async function runCI(
  options: CICommandOptions,
  _formatter: ReturnType<typeof createFormatter>,
  logger: ReturnType<typeof createLogger>
) {
  // Import diagnose and audit commands
  const { diagnoseCommand } = await import('./diagnose');
  const { auditCommand } = await import('./audit');
  
  const projectPath = options.path || process.cwd();
  const skills = options.skills || 'e2e,a11y,performance,security';
  const failOn = options.failOn || 'critical';
  const output = options.output || 'json';

  logger.info('════════════════════════════════════════════════════════════');
  logger.info('  QA-Agent CI Mode');
  logger.info('════════════════════════════════════════════════════════════');
  logger.info('');
  logger.info(`项目: ${projectPath}`);
  logger.info(`维度: ${skills}`);
  logger.info(`失败级别: ${failOn}`);
  logger.info('');

  let exitCode = 0;

  try {
    // Run diagnose
    logger.info('▶ 运行诊断...');
    await diagnoseCommand({
      path: projectPath,
      skills,
      output,
      outputFile: 'qa-report.json',
      failOn,
      quiet: true,
      ci: true,
    });
  } catch (error: any) {
    logger.error(`✗ 诊断失败: ${error.message}`);
    exitCode = 2;
  }

  try {
    // Run audit
    logger.info('▶ 运行审计...');
    await auditCommand({
      path: projectPath,
      output,
      outputFile: 'qa-audit.json',
      quiet: true,
      ci: true,
    });
  } catch (error: any) {
    logger.error(`✗ 审计失败: ${error.message}`);
    if (exitCode === 0) exitCode = 1;
  }

  // Check quality gate
  try {
    const reportPath = path.join(projectPath, 'qa-report.json');
    const content = await fs.readFile(reportPath, 'utf-8');
    const report = JSON.parse(content);
    
    logger.info('');
    logger.info('────────────────────────────────────────────────────────────');
    logger.info('  质量报告');
    logger.info('────────────────────────────────────────────────────────────');
    logger.info(`  得分: ${report.summary?.score || 0}/100`);
    logger.info(`  等级: ${report.summary?.grade || 'F'}`);
    logger.info(`  问题: ${report.summary?.totalIssues || 0}`);
    logger.info(`  严重: ${report.summary?.critical || 0}`);
    logger.info(`  警告: ${report.summary?.warning || 0}`);
    logger.info('');
    
    if (report.summary?.critical > 0) {
      logger.error('✗ 发现严重问题，质量门禁未通过');
      exitCode = 2;
    } else if (failOn === 'warning' && report.summary?.warning > 0) {
      logger.warn('⚠ 发现警告，质量门禁未通过');
      exitCode = 1;
    } else {
      logger.info('✓ 质量门禁通过');
    }
  } catch {
    logger.warn('⚠ 无法读取报告');
  }

  process.exit(exitCode);
}
