#!/usr/bin/env node
/**
 * QA-Agent CLI Entry Point
 */

import { Command } from 'commander';
import { diagnoseCommand } from './commands/diagnose';
import { fixCommand } from './commands/fix';
import { auditCommand } from './commands/audit';
import { skillCommand } from './commands/skill';
import { webCommand } from './commands/web';
import { ciCommand } from './commands/ci';
import { version } from '../../package.json';

const program = new Command();

program
  .name('qa-agent')
  .description('AI 质量医生 - 能诊断、能开药、能验证疗效')
  .version(version);

// Diagnose command
program
  .command('diagnose')
  .description('运行质量诊断')
  .option('-s, --skills <skills>', '指定诊断维度，逗号分隔', 'e2e,a11y,performance,security')
  .option('-p, --path <path>', '项目路径', process.cwd())
  .option('-u, --url <url>', '诊断 URL')
  .option('-o, --output <format>', '输出格式: html, json, markdown, compact', 'html')
  .option('-f, --output-file <file>', '输出文件路径')
  .option('--fail-on <level>', '失败级别: critical, warning', 'critical')
  .option('-q, --quiet', '静默模式，只输出结果')
  .option('-v, --verbose', '详细模式')
  .option('--ci', 'CI 模式（非交互、JSON 输出）')
  .action(diagnoseCommand);

// Fix command
program
  .command('fix')
  .description('修复诊断发现的问题')
  .option('-p, --path <path>', '项目路径', process.cwd())
  .option('-r, --report <path>', '指定诊断报告路径')
  .option('-i, --issue <id>', '指定修复问题 ID')
  .option('--dry-run', '预览修复，不实际修改')
  .option('-y, --yes', '跳过确认，自动应用修复')
  .option('-q, --quiet', '静默模式')
  .option('-v, --verbose', '详细模式')
  .action(fixCommand);

// Audit command
program
  .command('audit')
  .description('项目健康度审计')
  .option('-p, --path <path>', '项目路径', process.cwd())
  .option('--comprehensive', '全面审计（含安全扫描）')
  .option('--compliance <standards>', '合规标准: WCAG2.2, ADA, GDPR')
  .option('-o, --output <format>', '输出格式: html, json, markdown, compact', 'html')
  .option('-f, --output-file <file>', '输出文件路径')
  .option('-q, --quiet', '静默模式')
  .option('-v, --verbose', '详细模式')
  .option('--ci', 'CI 模式（非交互、JSON 输出）')
  .action(auditCommand);

// Web command
program
  .command('web')
  .description('启动 Web Dashboard')
  .option('-p, --port <port>', '端口号', '3000')
  .option('--no-open', '不自动打开浏览器')
  .option('--path <path>', '项目路径', process.cwd())
  .action(webCommand);

// CI command
program
  .command('ci')
  .description('CI/CD 集成')
  .argument('<action>', '操作: init, detect, run')
  .option('--platform <platform>', 'CI 平台: github, gitlab, jenkins, circleci')
  .option('--skills <skills>', '诊断维度，逗号分隔')
  .option('--fail-on <level>', '失败级别: critical, warning, any')
  .option('--output <format>', '输出格式: json, junit, sarif')
  .option('--schedule <cron>', '定时任务 cron 表达式')
  .option('-p, --path <path>', '项目路径', process.cwd())
  .action(ciCommand);

// Skill command
program
  .command('skill')
  .description('Skills 管理')
  .argument('<action>', '操作: list, install, update, create')
  .argument('[name]', 'Skill 名称')
  .action(skillCommand);

// Parse arguments
program.parse();
