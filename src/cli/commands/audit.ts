/**
 * Audit Command
 * Comprehensive project health auditing
 */

import { createLogger } from '../../utils/logger';
import { createFormatter } from '../output/formatter';
import { createAuditEngine } from '../../engines/audit';
import { AuditOptions, AuditReport, AuditCategory } from '../../types';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function auditCommand(options: any) {
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

    // Parse compliance options
    let compliance: string[] | undefined;
    if (options.compliance && typeof options.compliance === 'string') {
      compliance = options.compliance.split(',').map((s: string) => s.trim());
    }

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

function displayAuditReport(
  report: AuditReport,
  formatter: ReturnType<typeof createFormatter>,
  options: AuditOptions
): void {
  if (options.quiet) return;

  console.log('');
  console.log('═'.repeat(60));
  console.log('  项目健康度审计报告');
  console.log('═'.repeat(60));
  console.log('');

  // Project info
  console.log(`项目: ${report.project.name}`);
  console.log(`类型: ${report.project.type || '未知'}`);
  console.log(`框架: ${report.project.framework || '未知'}`);
  console.log(`时间: ${new Date(report.timestamp).toLocaleString('zh-CN')}`);
  console.log(`耗时: ${report.duration}ms`);
  console.log('');

  // Overall score
  displayOverallScore(report.summary, formatter);
  console.log('');

  // Category scores
  displayCategoryScores(report.categories, formatter);
  console.log('');

  // Detailed checks
  if (options.verbose) {
    displayDetailedChecks(report.categories, formatter);
    console.log('');
  }

  // Compliance
  if (report.compliance) {
    displayCompliance(report.compliance, formatter);
    console.log('');
  }

  // Trends
  if (report.trends) {
    displayTrends(report.trends, formatter);
    console.log('');
  }

  // Recommendations
  displayRecommendations(report.recommendations, formatter);
}

function displayOverallScore(
  summary: AuditReport['summary'],
  formatter: ReturnType<typeof createFormatter>
): void {
  const gradeEmoji: Record<string, string> = {
    A: '🏆',
    B: '✅',
    C: '⚠️',
    D: '🔶',
    F: '❌',
  };

  const statusEmoji: Record<string, string> = {
    healthy: '💚',
    warning: '💛',
    critical: '❤️',
  };

  console.log('─'.repeat(60));
  console.log('  综合健康度');
  console.log('─'.repeat(60));
  console.log('');
  console.log(`  得分: ${summary.overallScore}/100 ${gradeEmoji[summary.overallGrade]}`);
  console.log(`  等级: ${summary.overallGrade}`);
  console.log(`  状态: ${statusEmoji[summary.healthStatus]} ${summary.healthStatus}`);
  console.log('');
  console.log(`  问题总数: ${summary.totalIssues}`);
  console.log(`  严重问题: ${summary.criticalIssues}`);
}

function displayCategoryScores(
  categories: AuditCategory[],
  formatter: ReturnType<typeof createFormatter>
): void {
  console.log('─'.repeat(60));
  console.log('  分类得分');
  console.log('─'.repeat(60));
  console.log('');

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

function displayDetailedChecks(
  categories: AuditCategory[],
  formatter: ReturnType<typeof createFormatter>
): void {
  console.log('─'.repeat(60));
  console.log('  详细检查');
  console.log('─'.repeat(60));
  console.log('');

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

function displayCompliance(
  compliance: NonNullable<AuditReport['compliance']>,
  formatter: ReturnType<typeof createFormatter>
): void {
  console.log('─'.repeat(60));
  console.log(`  合规性检查: ${compliance.standard}`);
  console.log('─'.repeat(60));
  console.log('');

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

function displayTrends(
  trends: NonNullable<AuditReport['trends']>,
  formatter: ReturnType<typeof createFormatter>
): void {
  console.log('─'.repeat(60));
  console.log('  趋势分析');
  console.log('─'.repeat(60));
  console.log('');

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

function displayRecommendations(
  recommendations: AuditReport['recommendations'],
  formatter: ReturnType<typeof createFormatter>
): void {
  if (recommendations.length === 0) return;

  console.log('─'.repeat(60));
  console.log('  改进建议');
  console.log('─'.repeat(60));
  console.log('');

  const priorityEmoji: Record<string, string> = {
    high: '🔴',
    medium: '🟡',
    low: '🔵',
  };

  for (let i = 0; i < Math.min(recommendations.length, 5); i++) {
    const rec = recommendations[i];
    console.log(`  ${priorityEmoji[rec.priority]} [${rec.category}] ${rec.title}`);
    console.log(`     ${rec.description}`);
    console.log(`     影响: ${rec.impact}`);
    console.log('');
  }

  if (recommendations.length > 5) {
    console.log(`  ... 还有 ${recommendations.length - 5} 条建议`);
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
  formatter: ReturnType<typeof createFormatter>
): Promise<void> {
  const projectPath = options.path || process.cwd();
  
  let content: string;
  let extension: string;

  switch (options.output) {
    case 'json':
      content = JSON.stringify(report, null, 2);
      extension = 'json';
      break;
    case 'markdown':
      content = formatMarkdown(report);
      extension = 'md';
      break;
    case 'compact':
      content = formatCompact(report);
      extension = 'txt';
      break;
    case 'html':
    default:
      content = formatHTML(report);
      extension = 'html';
  }

  if (options.outputFile) {
    await fs.writeFile(options.outputFile, content, 'utf-8');
    if (!options.quiet) {
      formatter.success(`报告已保存: ${options.outputFile}`);
    }
  } else {
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
}

function formatCompact(report: AuditReport): string {
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

function formatMarkdown(report: AuditReport): string {
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
    
    for (const rec of report.recommendations.slice(0, 5)) {
      lines.push(`- **[${rec.priority}]** ${rec.title}: ${rec.description}`);
    }
  }
  
  return lines.join('\n');
}

function formatHTML(report: AuditReport): string {
  const gradeColors: Record<string, string> = {
    A: '#22c55e',
    B: '#84cc16',
    C: '#eab308',
    D: '#f97316',
    F: '#ef4444',
  };

  const statusColors: Record<string, string> = {
    healthy: '#22c55e',
    warning: '#eab308',
    critical: '#ef4444',
  };

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>项目健康度审计报告 - ${report.project.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }
    .container { max-width: 1000px; margin: 0 auto; padding: 2rem; }
    .header { text-align: center; margin-bottom: 2rem; }
    .header h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .header p { color: #64748b; }
    .score-card { background: white; border-radius: 1rem; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
    .score-value { font-size: 4rem; font-weight: bold; color: ${gradeColors[report.summary.overallGrade]}; }
    .score-grade { font-size: 1.5rem; color: #64748b; }
    .score-bar { height: 8px; background: #e2e8f0; border-radius: 4px; margin: 1rem 0; overflow: hidden; }
    .score-bar-fill { height: 100%; background: ${gradeColors[report.summary.overallGrade]}; border-radius: 4px; width: ${report.summary.overallScore}%; }
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
      <p>${report.project.name} · ${new Date(report.timestamp).toLocaleString('zh-CN')}</p>
    </div>
    
    <div class="score-card">
      <div class="score-value">${report.summary.overallScore}</div>
      <div class="score-grade">等级 ${report.summary.overallGrade}</div>
      <div class="score-bar">
        <div class="score-bar-fill"></div>
      </div>
      <div class="meta">
        <span>状态: ${report.summary.healthStatus}</span>
        <span>问题: ${report.summary.totalIssues}</span>
        <span>严重: ${report.summary.criticalIssues}</span>
      </div>
    </div>
    
    <div class="categories">
      ${report.categories.map(cat => `
        <div class="category">
          <div class="category-header">
            <span class="category-name">${cat.displayName}</span>
            <span class="category-score">${cat.score}/100</span>
          </div>
          <div class="category-bar">
            <div class="category-bar-fill" style="width: ${cat.score}%; background: ${cat.score >= 80 ? '#22c55e' : cat.score >= 60 ? '#eab308' : '#ef4444'}"></div>
          </div>
        </div>
      `).join('')}
    </div>
    
    ${report.recommendations.length > 0 ? `
      <div class="recommendations">
        <h2>改进建议</h2>
        ${report.recommendations.slice(0, 5).map(rec => `
          <div class="recommendation ${rec.priority}">
            <div class="recommendation-title">[${rec.category}] ${rec.title}</div>
            <div class="recommendation-desc">${rec.description}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  </div>
</body>
</html>`;
}
