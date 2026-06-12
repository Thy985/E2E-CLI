/**
 * Report Generator
 * Generates diagnosis reports in various formats
 */

import {
  DiagnosisReport,
  ReportSummary,
  Diagnosis,
  ProjectInfo,
  Severity,
} from '../../types';
import { calculateScore, getGrade } from '../../utils';

export interface ReportOptions {
  format: 'html' | 'json' | 'markdown' | 'compact';
  outputPath?: string;
}

export class ReportGenerator {
  /**
   * Generate complete diagnosis report
   */
  generate(
    project: ProjectInfo,
    issues: Diagnosis[],
    duration: number
  ): DiagnosisReport {
    const summary = this.generateSummary(issues);
    const dimensions = this.calculateDimensions(issues);

    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      project,
      summary,
      dimensions,
      issues,
      duration,
      exitCode: this.getExitCode(summary),
    };
  }

  /**
   * Generate summary from issues
   */
  generateSummary(issues: Diagnosis[]): ReportSummary {
    const severityCounts = this.countBySeverity(issues);
    const autoFixable = issues.filter(
      i => i.fixSuggestion?.autoApplicable
    ).length;

    const score = calculateScore(issues);
    const grade = getGrade(score);

    return {
      score,
      grade,
      totalIssues: issues.length,
      critical: severityCounts.critical,
      warning: severityCounts.warning,
      info: severityCounts.info,
      autoFixable,
    };
  }

  /**
   * Calculate dimension scores
   */
  private calculateDimensions(issues: Diagnosis[]): Record<string, number> {
    const byType = this.groupBy(issues, 'type');
    
    return {
      functionality: calculateScore(byType.functionality || []),
      accessibility: calculateScore(byType.accessibility || []),
      performance: calculateScore(byType.performance || []),
      security: calculateScore(byType.security || []),
      'code-quality': calculateScore(byType['code-quality'] || []),
    };
  }

  /**
   * Count issues by severity
   */
  private countBySeverity(issues: Diagnosis[]): Record<Severity, number> {
    return {
      critical: issues.filter(i => i.severity === 'critical').length,
      warning: issues.filter(i => i.severity === 'warning').length,
      info: issues.filter(i => i.severity === 'info').length,
    };
  }

  /**
   * Group issues by severity
   */
  private groupBySeverity(issues: Diagnosis[]): Record<Severity, Diagnosis[]> {
    const result: Record<Severity, Diagnosis[]> = {
      critical: [],
      warning: [],
      info: [],
    };
    
    for (const issue of issues) {
      result[issue.severity].push(issue);
    }
    
    return result;
  }

  /**
   * Group items by a key
   */
  private groupBy<T, K extends keyof T>(items: T[], key: K): Record<string, T[]> {
    const result: Record<string, T[]> = {};
    
    for (const item of items) {
      const groupKey = String(item[key]);
      if (!result[groupKey]) {
        result[groupKey] = [];
      }
      result[groupKey].push(item);
    }
    
    return result;
  }

  /**
   * Get exit code based on summary
   */
  private getExitCode(summary: ReportSummary): number {
    if (summary.critical > 0) return 2;
    if (summary.totalIssues > 0) return 1;
    return 0;
  }

  /**
   * Format report as JSON
   */
  formatJSON(report: DiagnosisReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Format report as Markdown
   */
  formatMarkdown(report: DiagnosisReport): string {
    const lines: string[] = [];

    lines.push('# QA-Agent 诊断报告');
    lines.push('');
    lines.push(`**项目**: ${report.project.name}`);
    lines.push(`**时间**: ${report.timestamp}`);
    lines.push(`**耗时**: ${report.duration}ms`);
    lines.push('');

    // Summary
    lines.push('## 📊 概览');
    lines.push('');
    lines.push(`**得分**: ${report.summary.score}/100 (${report.summary.grade})`);
    lines.push(`**问题总数**: ${report.summary.totalIssues}`);
    lines.push(`- 🔴 严重: ${report.summary.critical}`);
    lines.push(`- 🟡 警告: ${report.summary.warning}`);
    lines.push(`- 🔵 建议: ${report.summary.info}`);
    lines.push('');

    // Dimensions
    lines.push('## 📈 维度得分');
    lines.push('');
    lines.push('| 维度 | 得分 |');
    lines.push('|------|------|');
    for (const [dim, score] of Object.entries(report.dimensions)) {
      lines.push(`| ${dim} | ${score}/100 |`);
    }
    lines.push('');

    // Issues
    if (report.issues.length > 0) {
      lines.push('## 🔍 问题详情');
      lines.push('');

      const grouped = this.groupBySeverity(report.issues);
      
      if (grouped.critical.length > 0) {
        lines.push('### 🔴 严重问题');
        lines.push('');
        for (const issue of grouped.critical) {
          lines.push(`#### ${issue.id}: ${issue.title}`);
          lines.push(`- **位置**: ${issue.location.file}${issue.location.line ? `:${issue.location.line}` : ''}`);
          lines.push(`- **描述**: ${issue.description}`);
          if (issue.fixSuggestion) {
            lines.push(`- **修复**: ${issue.fixSuggestion.description}`);
          }
          lines.push('');
        }
      }

      if (grouped.warning.length > 0) {
        lines.push('### 🟡 警告');
        lines.push('');
        for (const issue of grouped.warning.slice(0, 10)) {
          lines.push(`- **${issue.id}**: ${issue.title} (${issue.location.file})`);
        }
        if (grouped.warning.length > 10) {
          lines.push(`- ... 还有 ${grouped.warning.length - 10} 个警告`);
        }
        lines.push('');
      }

      if (grouped.info.length > 0) {
        lines.push('### 🔵 建议');
        lines.push('');
        for (const issue of grouped.info.slice(0, 10)) {
          lines.push(`- **${issue.id}**: ${issue.title}`);
        }
        if (grouped.info.length > 10) {
          lines.push(`- ... 还有 ${grouped.info.length - 10} 个建议`);
        }
        lines.push('');
      }
    }

    // Quick fix
    if (report.summary.autoFixable > 0) {
      lines.push('## 💡 快速修复');
      lines.push('');
      lines.push(`运行以下命令自动修复 ${report.summary.autoFixable} 个问题:`);
      lines.push('```bash');
      lines.push('qa-agent fix --auto-approve=low');
      lines.push('```');
    }

    return lines.join('\n');
  }

  /**
   * Format report as compact text
   */
  formatCompact(report: DiagnosisReport): string {
    const lines: string[] = [];

    const statusEmoji = report.summary.critical > 0 ? '✗' : 
                        report.summary.warning > 0 ? '⚠' : '✓';

    lines.push(`${statusEmoji} Score: ${report.summary.score}/100 (${report.summary.grade})`);
    lines.push(`${statusEmoji} Issues: ${report.summary.totalIssues} (${report.summary.critical} critical, ${report.summary.warning} warning, ${report.summary.info} info)`);
    
    for (const [dim, score] of Object.entries(report.dimensions)) {
      const emoji = score >= 80 ? '✓' : score >= 60 ? '⚠' : '✗';
      lines.push(`${emoji} ${dim}: ${score}/100`);
    }

    if (report.summary.autoFixable > 0) {
      lines.push(`💡 ${report.summary.autoFixable} issues can be auto-fixed`);
      lines.push(`   Run: qa-agent fix`);
    }

    return lines.join('\n');
  }

  /**
   * Format report as HTML
   */
  formatHTML(report: DiagnosisReport): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QA-Agent Report - ${report.project.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 12px; margin-bottom: 20px; }
    .header h1 { font-size: 28px; margin-bottom: 10px; }
    .header .meta { opacity: 0.8; font-size: 14px; }
    .score-ring { width: 120px; height: 120px; border-radius: 50%; background: conic-gradient(#4ade80 ${report.summary.score * 3.6}deg, #e5e7eb 0); display: flex; align-items: center; justify-content: center; margin: 20px auto; }
    .score-ring .inner { width: 100px; height: 100px; border-radius: 50%; background: white; display: flex; align-items: center; justify-content: center; flex-direction: column; }
    .score-ring .score { font-size: 32px; font-weight: bold; color: #333; }
    .score-ring .grade { font-size: 14px; color: #666; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .summary-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .summary-card h3 { font-size: 14px; color: #666; margin-bottom: 10px; }
    .summary-card .value { font-size: 24px; font-weight: bold; }
    .summary-card.critical .value { color: #ef4444; }
    .summary-card.warning .value { color: #f59e0b; }
    .summary-card.info .value { color: #3b82f6; }
    .dimensions { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .dimensions h2 { font-size: 18px; margin-bottom: 15px; }
    .dimension { display: flex; align-items: center; margin-bottom: 10px; }
    .dimension .name { width: 150px; font-size: 14px; }
    .dimension .bar { flex: 1; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }
    .dimension .bar .fill { height: 100%; border-radius: 4px; }
    .dimension .score { width: 60px; text-align: right; font-size: 14px; font-weight: 500; }
    .issues { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .issues h2 { font-size: 18px; margin-bottom: 15px; }
    .issue { padding: 15px; border-left: 4px solid #e5e7eb; margin-bottom: 10px; background: #f9fafb; border-radius: 0 8px 8px 0; }
    .issue.critical { border-left-color: #ef4444; }
    .issue.warning { border-left-color: #f59e0b; }
    .issue.info { border-left-color: #3b82f6; }
    .issue h4 { font-size: 14px; margin-bottom: 5px; }
    .issue .location { font-size: 12px; color: #666; margin-bottom: 5px; }
    .issue .description { font-size: 13px; color: #444; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔍 QA-Agent Report</h1>
      <div class="meta">
        <span>项目: ${report.project.name}</span> · 
        <span>时间: ${new Date(report.timestamp).toLocaleString('zh-CN')}</span> · 
        <span>耗时: ${report.duration}ms</span>
      </div>
    </div>

    <div class="score-ring">
      <div class="inner">
        <div class="score">${report.summary.score}</div>
        <div class="grade">Grade ${report.summary.grade}</div>
      </div>
    </div>

    <div class="summary">
      <div class="summary-card critical">
        <h3>🔴 严重</h3>
        <div class="value">${report.summary.critical}</div>
      </div>
      <div class="summary-card warning">
        <h3>🟡 警告</h3>
        <div class="value">${report.summary.warning}</div>
      </div>
      <div class="summary-card info">
        <h3>🔵 建议</h3>
        <div class="value">${report.summary.info}</div>
      </div>
      <div class="summary-card">
        <h3>可自动修复</h3>
        <div class="value">${report.summary.autoFixable}</div>
      </div>
    </div>

    <div class="dimensions">
      <h2>📈 维度得分</h2>
      ${Object.entries(report.dimensions).map(([name, score]: [string, number]) => `
      <div class="dimension">
        <div class="name">${name}</div>
        <div class="bar">
          <div class="fill" style="width: ${score}%; background: ${score >= 80 ? '#4ade80' : score >= 60 ? '#fbbf24' : '#f87171'}"></div>
        </div>
        <div class="score">${score}</div>
      </div>
      `).join('')}
    </div>

    <div class="issues">
      <h2>🔍 问题详情</h2>
      ${report.issues.slice(0, 20).map(issue => `
      <div class="issue ${issue.severity}">
        <h4>${issue.id}: ${issue.title}</h4>
        <div class="location">📍 ${issue.location.file}${issue.location.line ? `:${issue.location.line}` : ''}</div>
        <div class="description">${issue.description}</div>
      </div>
      `).join('')}
      ${report.issues.length > 20 ? `<p style="text-align: center; color: #666; padding: 10px;">... 还有 ${report.issues.length - 20} 个问题</p>` : ''}
    </div>

    <div class="footer">
      Generated by QA-Agent v${report.version}
    </div>
  </div>
</body>
</html>`;
  }
}

/**
 * Create report generator
 */
export function createReportGenerator(): ReportGenerator {
  return new ReportGenerator();
}
