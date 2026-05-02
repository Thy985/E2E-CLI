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
import { initCommand } from './commands/init';
import { guiCommand } from './commands/gui';
import { uxAuditCommand } from './commands/ux-audit';
import { designCommand } from './commands/design';
import { bestPracticesCommand } from './commands/best-practices';
import { seoCommand } from './commands/seo';
import { dependencyCommand } from './commands/dependency';
import { version } from '../../package.json';

const program = new Command();

program
  .name('qa-agent')
  .description('AI Quality Doctor - Diagnose, Fix, Verify')
  .version(version);

// Init command
program
  .command('init')
  .description('Initialize configuration')
  .option('-f, --format <format>', 'Config format: yaml, json, ts', 'yaml')
  .option('--force', 'Overwrite existing config')
  .action(initCommand);

// Diagnose command
program
  .command('diagnose')
  .description('Run quality diagnosis')
  .option('-s, --skills <skills>', 'Specify diagnosis dimensions, comma-separated (e2e, a11y, performance, security, seo, api, dependency, complexity)', 'e2e,a11y,performance,security')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-u, --url <url>', 'Diagnosis URL')
  .option('-o, --output <format>', 'Output format: html, json, markdown, compact', 'html')
  .option('-f, --output-file <file>', 'Output file path')
  .option('--fail-on <level>', 'Failure level: critical, warning', 'critical')
  .option('-q, --quiet', 'Quiet mode, only output results')
  .option('-v, --verbose', 'Verbose mode')
  .option('--ci', 'CI mode (non-interactive, JSON output)')
  .action(diagnoseCommand);

// Audit command
program
  .command('audit')
  .description('Comprehensive project audit')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-o, --output <format>', 'Output format: html, json, markdown', 'html')
  .option('-f, --output-file <file>', 'Output file path')
  .option('--comprehensive', 'Comprehensive audit (including security scan)')
  .option('--compliance <standards>', 'Compliance audit: WCAG2.2, ADA, GDPR')
  .option('-q, --quiet', 'Quiet mode')
  .option('-v, --verbose', 'Verbose mode')
  .action(auditCommand);

// Skill command
program
  .command('skill')
  .description('Manage skills')
  .addCommand(
    new Command('list')
      .description('List installed skills')
      .action(skillCommand.list)
  )
  .addCommand(
    new Command('install')
      .description('Install skill')
      .argument('<name>', 'Skill name')
      .action(skillCommand.install)
  )
  .addCommand(
    new Command('update')
      .description('Update skill')
      .argument('<name>', 'Skill name')
      .action(skillCommand.update)
  )
  .addCommand(
    new Command('create')
      .description('Create custom skill')
      .argument('<name>', 'Skill name')
      .action(skillCommand.create)
  );

// Web command
program
  .command('web')
  .description('Start web interface')
  .option('-p, --port <port>', 'Port number', '3000')
  .option('-o, --open', 'Auto-open browser')
  .action(webCommand);

// CI command
program
  .command('ci')
  .description('CI/CD integration commands')
  .addCommand(
    new Command('generate')
      .description('Generate CI configuration')
      .option('-p, --provider <provider>', 'CI provider: github, gitlab, jenkins, azure', 'github')
      .option('-o, --output <file>', 'Output file path')
      .action(ciCommand.generate)
  )
  .addCommand(
    new Command('run')
      .description('Run in CI mode')
      .option('-p, --path <path>', 'Project path', process.cwd())
      .action(ciCommand.run)
  );

// GUI command
program
  .command('gui')
  .description('GUI automation commands')
  .option('-u, --url <url>', 'Target URL')
  .option('-s, --scenario <scenario>', 'Test scenario description')
  .option('--record', 'Record user actions')
  .option('--play', 'Play recorded actions')
  .option('--visual', 'Run visual regression test')
  .action(guiCommand);

// UI/UX Audit command
program.addCommand(uxAuditCommand);

// Design command
program.addCommand(designCommand);

// Best Practices command
program.addCommand(bestPracticesCommand);

// SEO command
program.addCommand(seoCommand);

// Dependency command
program.addCommand(dependencyCommand);

// Parse arguments
program.parse();
