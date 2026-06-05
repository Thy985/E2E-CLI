/**
 * Audit Command
 * Comprehensive project health auditing
 */

import { createLogger } from '../../utils/logger';
import { createFormatter, OutputFormatter } from '../output/formatter';
import { createAuditEngine } from '../../engines/audit';
import { AuditOptions, AuditReport, AuditCategory, AuditRecommendation } from '../../types';
import {
  escapeHTML,
  gradeEmoji,
  healthEmoji,
  gradeColor,
  scoreColor,
  priorityEmoji,
  MAX_RECOMMENDATIONS_DISPLAY,
} from '../../utils/format';
import * as fs from 'fs/promises';
import * as path from 'path';

type AuditCommandOptions = AuditOptions & {
  verbose?: boolean;
  quiet?: boolean;
};

type ReportFormat = NonNullable<AuditOptions['output']>;

/**
 * 4 种输出格式的 renderer —— 用 Map 替代 switch，避免 `case 'html': default: 共用一段`
 * 这种隐式 fall-through。新加 format 时编译期会被 exhaustive check 拒绝。
 */
const REPORT_RENDERERS: Record<ReportFormat, (r: AuditReport) => string> = {
  json: (r) => JSON.stringify(r, null, 2),
  markdown: formatMarkdown,
  compact: formatCompact,
  html: formatHTML,
};

const REPORT_EXTENSIONS: Record<ReportFormat, string> = {
  json: 'json',
  markdown: 'md',
  compact: 'txt',
  html: 'html',
};

export async function auditCommand(options: AuditCommandOptions) {
  const logger = createLogger({
    level: options.verbose ? 'debug' : 'info',
    quiet: options.quiet,
  });
  const formatter = createFormatter({ quiet: options.quiet });

  try {
    const projectPath = options.path || process.cwd();

    formatter.startSpinner('正在执行项目健康度审计...');

    // Create audit engine
    const engine = createAuditEngine(logger);

    // Parse compliance options (commander hands us a string when the
    // CLI flag is invoked once, or a string[] when repeated).
    const compliance = parseCompliance(options.compliance);

    // Run audit
    const report = await engine.audit(projectPath, {
      comprehensive: options.comprehensive,
      compliance,
    });

    formatter.succeedSpinner('审计完成');

    // Display results
    displayAuditReport(report, formatter, options);

    // Save report
    await saveReport(report, options, formatter);

    // Exit with appropriate code
    if (report.summary.healthStatus === 'critical') {
      process.exit(2);
    } else if (report.summary.healthStatus === 'warning') {
      process.exit(1);
    }

    process.exit(0);

  } catch (error) {
    formatter.failSpinner('审计失败');
    logger.error('审计过程中发生错误:', error);
    process.exit(3);
  }
}

/**
 * 把 commander 传进来的 compliance 字段规整成 string[] | undefined。
 * commander 在 flag 重复时给 string[]，单次时给 string，缺失时给 undefined / true。
 * 旧版用 `as unknown` + `as unknown[]` 强转；这里走 type guard 收口。
 */
function parseCompliance(raw: unknown): string[] | undefined {
  if (typeof raw === 'string') {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

function displayAuditReport(
  report: AuditReport,
  formatter: OutputFormatter,
  options: AuditOptions
): void {
  if (options.quiet) return;

  formatter.header('项目健康度审计报告');
  formatter.keyValue('项目', report.project.name);
  formatter.keyValue('类型', report.project.type || '未知');
  formatter.keyValue('框架', report.project.framework || '未知');
  formatter.keyValue('时间', new Date(report.timestamp).toLocaleString('zh-CN'));
  formatter.keyValue('耗时', `${report.duration}ms`);

  displayOverallScore(report.summary);
  displayCategoryScores(report.categories);

  if (options.verbose) {
    displayDetailedChecks(report.categories);
  }

  if (report.compliance) {
    displayCompliance(report.compliance);
  } else if (options.compliance) {
    formatter.section('合规性检查');
    console.log(`  ⚠️  未对 ${options.compliance} 执行实际合规扫描`);
    console.log('  说明: 当前 audit 引擎未集成 axe-core 等合规工具');
    console.log('  建议: 改用 a11y skill 获取可访问性诊断');
  }

  if (report.trends) {
    displayTrends(report.trends);
  }

  displayRecommendations(report.recommendations);
}

function printSectionHeader(title: string): void {
  console.log('─'.repeat(60));
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
  console.log('');
}

function displayOverallScore(summary: AuditReport['summary']): void {
  printSectionHeader('综合健康度');
  console.log(`  得分: ${summary.overallScore}/100 ${gradeEmoji(summary.overallGrade)}`);
  console.log(`  等级: ${summary.overallGrade}`);
  console.log(`  状态: ${healthEmoji(summary.healthStatus)} ${summary.healthStatus}`);
  console.log('');
  console.log(`  问题总数: ${summary.totalIssues}`);
  console.log(`  严重问题: ${summary.criticalIssues}`);
}

function displayCategoryScores(categories: readonly AuditCategory[]): void {
  printSectionHeader('分类得分');

  for (const category of categories) {
    const statusIcon = category.status === 'pass' ? '✅' :
                       category.status === 'warning' ? '⚠️' : '❌';
    const bar = createScoreBar(category.score);

    console.log(`  ${statusIcon} ${category.displayName.padEnd(8)} ${bar} ${category.score}/100`);

    if (category.description) {
      console.log(`     ${category.description}`);
    }
  }
}

function displayDetailedChecks(categories: readonly AuditCategory[]): void {
  printSectionHeader('详细检查');

  for (const category of categories) {
    console.log(`  ${category.displayName}:`);

    for (const check of category.checks) {
      const statusIcon = check.status === 'pass' ? '✓' :
                         check.status === 'warning' ? '!' :
                         check.status === 'fail' ? '✗' : '-';

      console.log(`    ${statusIcon} ${check.name}: ${check.score}/${check.maxScore}`);
      if (check.details) {
        console.log(`      ${check.details}`);
      }
    }
    console.log('');
  }
}

function displayCompliance(compliance: NonNullable<AuditReport['compliance']>): void {
  printSectionHeader(`合规性检查: ${compliance.standard}`);

  const statusText = compliance.status === 'compliant' ? '✅ 合规' :
                     compliance.status === 'partial' ? '⚠️ 部分合规' : '❌ 不合规';

  console.log(`  状态: ${statusText}`);
  console.log(`  得分: ${compliance.score}/100`);
  console.log('');

  for (const req of compliance.requirements) {
    const icon = req.status === 'pass' ? '✓' : req.status === 'fail' ? '✗' : '-';
    console.log(`  ${icon} ${req.id}: ${req.name}`);
    if (req.description) {
      console.log(`    ${req.description}`);
    }
  }
}

function displayTrends(trends: NonNullable<AuditReport['trends']>): void {
  printSectionHeader('趋势分析');

  const trendEmoji = trends.trend === 'improving' ? '📈' :
                     trends.trend === 'declining' ? '📉' : '➡️';

  console.log(`  趋势: ${trendEmoji} ${trends.trend}`);
  console.log(`  变化: ${trends.change > 0 ? '+' : ''}${trends.change} 分`);
  console.log(`  上次: ${trends.previousScore}/100`);
  console.log(`  当前: ${trends.currentScore}/100`);
  console.log('');

  if (trends.history.length > 1) {
    console.log('  历史记录:');
    for (const point of trends.history.slice(-5)) {
      const date = new Date(point.date).toLocaleDateString('zh-CN');
      console.log(`    ${date}: ${point.score}/100 (${point.issues} 问题)`);
    }
  }
}

function displayRecommendations(recommendations: readonly AuditRecommendation[]): void {
  if (recommendations.length === 0) return;

  printSectionHeader('改进建议');

  for (let i = 0; i < Math.min(recommendations.length, MAX_RECOMMENDATIONS_DISPLAY); i++) {
    const rec = recommendations[i];
    console.log(`  ${priorityEmoji(rec.priority)} [${rec.category}] ${rec.title}`);
    console.log(`     ${rec.description}`);
    console.log(`     影响: ${rec.impact}`);
    console.log('');
  }

  if (recommendations.length > MAX_RECOMMENDATIONS_DISPLAY) {
    console.log(`  ... 还有 ${recommendations.length - MAX_RECOMMENDATIONS_DISPLAY} 条建议`);
  }
}

function createScoreBar(score: number, width: number = 20): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;

  const filledChar = score >= 80 ? '█' : score >= 60 ? '▓' : '░';

  return filledChar.repeat(filled) + '░'.repeat(empty);
}

async function saveReport(
  report: AuditReport,
  options: AuditOptions,
  formatter: OutputFormatter
): Promise<void> {
  const projectPath = options.path || process.cwd();

  // Map dispatch：format 决定 renderer 和文件扩展名，没有隐式 fall-through。
  // 非法 format 会编译期被 Record<ReportFormat, ...> 拒绝。
  const format = options.output ?? 'html';
  const content = REPORT_RENDERERS[format](report);
  const extension = REPORT_EXTENSIONS[format];

  if (options.outputFile) {
    await fs.writeFile(options.outputFile, content, 'utf-8');
    if (!options.quiet) {
      formatter.success(`报告已保存: ${options.outputFile}`);
    }
    return;
  }

  // Save to default location
  const reportDir = path.join(projectPath, '.qa-agent', 'reports');
  await fs.mkdir(reportDir, { recursive: true });

  const reportPath = path.join(reportDir, `audit-${Date.now()}.${extension}`);
  await fs.writeFile(reportPath, content, 'utf-8');

  const latestPath = path.join(reportDir, `audit-latest.${extension}`);
  await fs.writeFile(latestPath, content, 'utf-8');

  if (!options.quiet) {
    formatter.success(`报告已保存: ${latestPath}`);
  }
}

export function formatCompact(report: AuditReport): string {
  const lines: string[] = [];

  lines.push(`项目健康度: ${report.summary.overallScore}/100 (${report.summary.overallGrade})`);
  lines.push(`状态: ${report.summary.healthStatus}`);
  lines.push(`问题: ${report.summary.totalIssues} (严重: ${report.summary.criticalIssues})`);
  lines.push('');

  for (const category of report.categories) {
    lines.push(`${category.displayName}: ${category.score}/100`);
  }

  return lines.join('\n');
}

export function formatMarkdown(report: AuditReport): string {
  const lines: string[] = [];

  lines.push('# 项目健康度审计报告');
  lines.push('');
  lines.push(`**项目**: ${report.project.name}`);
  lines.push(`**时间**: ${report.timestamp}`);
  lines.push(`**耗时**: ${report.duration}ms`);
  lines.push('');

  lines.push('## 概览');
  lines.push('');
  lines.push(`- **得分**: ${report.summary.overallScore}/100 (${report.summary.overallGrade})`);
  lines.push(`- **状态**: ${report.summary.healthStatus}`);
  lines.push(`- **问题**: ${report.summary.totalIssues} (严重: ${report.summary.criticalIssues})`);
  lines.push('');

  lines.push('## 分类得分');
  lines.push('');
  lines.push('| 分类 | 得分 | 状态 |');
  lines.push('|------|------|------|');

  for (const category of report.categories) {
    lines.push(`| ${category.displayName} | ${category.score}/100 | ${category.status} |`);
  }

  if (report.recommendations.length > 0) {
    lines.push('');
    lines.push('## 改进建议');
    lines.push('');

    for (const rec of report.recommendations.slice(0, MAX_RECOMMENDATIONS_DISPLAY)) {
      lines.push(`- **[${rec.priority}]** ${rec.title}: ${rec.description}`);
    }
  }

  return lines.join('\n');
}

export function formatHTML(report: AuditReport): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>项目健康度审计报告 - ${escapeHTML(report.project.name)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }
    .container { max-width: 1000px; margin: 0 auto; padding: 2rem; }
    .header { text-align: center; margin-bottom: 2rem; }
    .header h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .header p { color: #64748b; }
    .score-card { background: white; border-radius: 1rem; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
    .score-value { font-size: 4rem; font-weight: bold; color: ${gradeColor(report.summary.overallGrade)}; }
    .score-grade { font-size: 1.5rem; color: #64748b; }
    .score-bar { height: 8px; background: #e2e8f0; border-radius: 4px; margin: 1rem 0; overflow: hidden; }
    .score-bar-fill { height: 100%; background: ${gradeColor(report.summary.overallGrade)}; border-radius: 4px; width: ${report.summary.overallScore}%; }
    .categories { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .category { background: white; border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .category-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
    .category-name { font-weight: 600; }
    .category-score { font-weight: bold; }
    .category-bar { height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden; }
    .category-bar-fill { height: 100%; border-radius: 2px; }
    .recommendations { background: white; border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .recommendations h2 { margin-bottom: 1rem; }
    .recommendation { padding: 1rem; border-left: 3px solid #e2e8f0; margin-bottom: 1rem; background: #f8fafc; }
    .recommendation.high { border-color: #ef4444; }
    .recommendation.medium { border-color: #eab308; }
    .recommendation.low { border-color: #3b82f6; }
    .recommendation-title { font-weight: 600; margin-bottom: 0.25rem; }
    .recommendation-desc { color: #64748b; font-size: 0.875rem; }
    .meta { display: flex; gap: 2rem; justify-content: center; color: #64748b; font-size: 0.875rem; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>项目健康度审计报告</h1>
      <p>${escapeHTML(report.project.name)} · ${escapeHTML(new Date(report.timestamp).toLocaleString('zh-CN'))}</p>
    </div>

    <div class="score-card">
      <div class="score-value">${report.summary.overallScore}</div>
      <div class="score-grade">等级 ${escapeHTML(report.summary.overallGrade)}</div>
      <div class="score-bar">
        <div class="score-bar-fill"></div>
      </div>
      <div class="meta">
        <span>状态: ${escapeHTML(report.summary.healthStatus)}</span>
        <span>问题: ${report.summary.totalIssues}</span>
        <span>严重: ${report.summary.criticalIssues}</span>
      </div>
    </div>

    <div class="categories">
      ${report.categories.map(cat => `
        <div class="category">
          <div class="category-header">
            <span class="category-name">${escapeHTML(cat.displayName)}</span>
            <span class="category-score">${cat.score}/100</span>
          </div>
          <div class="category-bar">
            <div class="category-bar-fill" style="width: ${cat.score}%; background: ${scoreColor(cat.score)}"></div>
          </div>
        </div>
      `).join('')}
    </div>

    ${report.recommendations.length > 0 ? `
      <div class="recommendations">
        <h2>改进建议</h2>
        ${report.recommendations.slice(0, MAX_RECOMMENDATIONS_DISPLAY).map(rec => `
          <div class="recommendation ${escapeHTML(rec.priority)}">
            <div class="recommendation-title">[${escapeHTML(rec.category)}] ${escapeHTML(rec.title)}</div>
            <div class="recommendation-desc">${escapeHTML(rec.description)}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  </div>
</body>
</html>`;
}
