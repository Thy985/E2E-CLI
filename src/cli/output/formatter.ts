/**
 * CLI Output Formatter
 * Handles terminal output with colors, tables, and progress indicators
 */

import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { Diagnosis, ReportSummary, Severity } from '../../types';

export class OutputFormatter {
  private spinner: Ora | null = null;
  private quiet: boolean = false;

  constructor(options: { quiet?: boolean } = {}) {
    this.quiet = options.quiet || false;
  }

  // ============================================
  // Spinner Methods
  // ============================================

  startSpinner(message: string): void {
    if (this.quiet) return;
    this.spinner = ora(message).start();
  }

  updateSpinner(message: string): void {
    if (this.quiet || !this.spinner) return;
    this.spinner.text = message;
  }

  succeedSpinner(message?: string): void {
    if (this.quiet || !this.spinner) return;
    this.spinner.succeed(message);
    this.spinner = null;
  }

  failSpinner(message?: string): void {
    if (this.quiet || !this.spinner) return;
    this.spinner.fail(message);
    this.spinner = null;
  }

  warnSpinner(message?: string): void {
    if (this.quiet || !this.spinner) return;
    this.spinner.warn(message);
    this.spinner = null;
  }

  // ============================================
  // Basic Output Methods
  // ============================================

  info(message: string): void {
    if (this.quiet) return;
    console.log(chalk.blue('ℹ'), message);
  }

  success(message: string): void {
    if (this.quiet) return;
    console.log(chalk.green('✓'), message);
  }

  warn(message: string): void {
    if (this.quiet) return;
    console.log(chalk.yellow('⚠'), message);
  }

  error(message: string): void {
    if (this.quiet) return;
    console.log(chalk.red('✖'), message);
  }

  debug(message: string, data?: any): void {
    if (this.quiet) return;
    console.log(chalk.gray('🔍'), message, data || '');
  }

  // ============================================
  // Structured Output Methods
  // ============================================

  header(title: string): void {
    if (this.quiet) return;
    console.log();
    console.log(chalk.bold.blue(`═`.repeat(60)));
    console.log(chalk.bold.blue(`  ${title}`));
    console.log(chalk.bold.blue(`═`.repeat(60)));
    console.log();
  }

  section(title: string): void {
    if (this.quiet) return;
    console.log();
    console.log(chalk.bold(`▶ ${title}`));
    console.log(chalk.gray('─'.repeat(50)));
  }

  keyValue(key: string, value: string | number): void {
    if (this.quiet) return;
    console.log(`  ${chalk.gray(key)}: ${value}`);
  }

  table(data: Record<string, any>[], columns: string[]): void {
    if (this.quiet) return;
    console.table(data, columns);
  }

  // ============================================
  // Diagnosis Output Methods
  // ============================================

  printSummary(summary: ReportSummary): void {
    if (this.quiet) return;

    const scoreColor = this.getScoreColor(summary.score);
    const gradeEmoji = this.getGradeEmoji(summary.grade);

    console.log();
    console.log(chalk.bold('📊 诊断摘要'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log();
    console.log(`  综合得分: ${scoreColor(`${summary.score}/100`)} ${gradeEmoji}`);
    console.log(`  质量等级: ${chalk.bold(summary.grade)}`);
    console.log();
    console.log(`  问题总数: ${summary.totalIssues}`);
    console.log(`    - ${chalk.red('严重')}: ${summary.critical}`);
    console.log(`    - ${chalk.yellow('警告')}: ${summary.warning}`);
    console.log(`    - ${chalk.blue('建议')}: ${summary.info}`);
    console.log();

    if (summary.autoFixable > 0) {
      console.log(chalk.green(`  💡 ${summary.autoFixable} 个问题可自动修复`));
      console.log(chalk.gray(`     运行 qa-agent fix 进行修复`));
    }
  }

  printIssues(issues: Diagnosis[], maxDisplay: number = 20): void {
    if (this.quiet) return;

    const grouped = this.groupBySeverity(issues);

    // Critical issues
    if (grouped.critical && grouped.critical.length > 0) {
      this.section('🔴 严重问题');
      grouped.critical.slice(0, maxDisplay).forEach(issue => {
        this.printIssue(issue);
      });
      if (grouped.critical.length > maxDisplay) {
        console.log(chalk.gray(`  ... 还有 ${grouped.critical.length - maxDisplay} 个问题`));
      }
    }

    // Warning issues
    if (grouped.warning && grouped.warning.length > 0) {
      this.section('🟡 警告');
      grouped.warning.slice(0, maxDisplay).forEach(issue => {
        this.printIssue(issue);
      });
      if (grouped.warning.length > maxDisplay) {
        console.log(chalk.gray(`  ... 还有 ${grouped.warning.length - maxDisplay} 个问题`));
      }
    }

    // Info issues
    if (grouped.info && grouped.info.length > 0) {
      this.section('🔵 建议');
      grouped.info.slice(0, maxDisplay).forEach(issue => {
        this.printIssue(issue);
      });
      if (grouped.info.length > maxDisplay) {
        console.log(chalk.gray(`  ... 还有 ${grouped.info.length - maxDisplay} 个问题`));
      }
    }
  }

  private printIssue(issue: Diagnosis): void {
    const severityIcon = this.getSeverityIcon(issue.severity);
    const location = `${issue.location.file}${issue.location.line ? `:${issue.location.line}` : ''}`;
    
    console.log();
    console.log(`  ${severityIcon} ${chalk.bold(issue.id)}: ${issue.title}`);
    console.log(chalk.gray(`     位置: ${location}`));
    console.log(chalk.gray(`     描述: ${issue.description}`));
    
    if (issue.fixSuggestion) {
      console.log(chalk.gray(`     修复: ${issue.fixSuggestion.description}`));
    }
  }

  // ============================================
  // Progress Methods
  // ============================================

  printProgress(current: number, total: number, message: string): void {
    if (this.quiet) return;
    const percent = Math.round((current / total) * 100);
    const bar = this.progressBar(percent, 20);
    console.log(`  ${bar} ${percent}% ${message}`);
  }

  private progressBar(percent: number, width: number): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }

  // ============================================
  // JSON Output
  // ============================================

  printJSON(data: any): void {
    console.log(JSON.stringify(data, null, 2));
  }

  // ============================================
  // Helper Methods
  // ============================================

  private getScoreColor(score: number): (text: string) => string {
    if (score >= 80) return chalk.green;
    if (score >= 60) return chalk.yellow;
    return chalk.red;
  }

  private getGradeEmoji(grade: string): string {
    const emojis: Record<string, string> = {
      A: '🏆',
      B: '✅',
      C: '⚠️',
      D: '🔶',
      F: '❌',
    };
    return emojis[grade] || '';
  }

  private getSeverityIcon(severity: Severity): string {
    const icons: Record<Severity, string> = {
      critical: '🔴',
      warning: '🟡',
      info: '🔵',
    };
    return icons[severity];
  }

  private groupBySeverity(issues: Diagnosis[]): Record<Severity, Diagnosis[]> {
    return {
      critical: issues.filter(i => i.severity === 'critical'),
      warning: issues.filter(i => i.severity === 'warning'),
      info: issues.filter(i => i.severity === 'info'),
    };
  }
}

/**
 * Create default formatter instance
 */
export function createFormatter(options?: { quiet?: boolean }): OutputFormatter {
  return new OutputFormatter(options);
}
