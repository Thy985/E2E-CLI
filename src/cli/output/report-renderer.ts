/**
 * Shared report rendering utilities for CLI diagnose+report flow.
 *
 * Handles text, JSON, and HTML output with optional file saving.
 */

import * as fs from 'fs/promises';

// ── Types ──────────────────────────────────────────────────────────────────

export interface IssueSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
}

export interface DiagnoseResult {
  issues: any[];
  summary: IssueSummary;
}

export interface ReportOptions {
  /** Report title shown in text and HTML output */
  title: string;
  /** Maps a category key to a display name (with emoji). */
  getCategoryName?: (category: string) => string;
  /** Renders extra metadata lines for a single issue (text mode). */
  renderIssueMetadata?: (issue: any) => string[];
  /** Renders extra metadata HTML for a single issue (HTML mode). */
  renderIssueMetadataHTML?: (issue: any) => string;
}

export interface OutputOptions {
  output?: string;       // 'text' | 'json' | 'html'
  outputFile?: string;   // path to write report file
}

// ── Shared helpers ─────────────────────────────────────────────────────────

function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce((result, item) => {
    const key = keyFn(item);
    (result[key] = result[key] || []).push(item);
    return result;
  }, {} as Record<string, T[]>);
}

function getSeverityIcon(severity: string): string {
  const icons: Record<string, string> = {
    critical: '🔴',
    warning: '🟡',
    info: '🔵',
  };
  return icons[severity] || '⚪';
}

function defaultGetCategoryName(category: string): string {
  return category;
}

// ── Text report ────────────────────────────────────────────────────────────

export function generateTextReport(
  issues: any[],
  summary: IssueSummary,
  opts: ReportOptions,
): string {
  const lines: string[] = [];
  const divider = '═'.repeat(59);

  const title = opts.title || 'Report';
  const getCategoryName = opts.getCategoryName ?? defaultGetCategoryName;
  const renderMeta = opts.renderIssueMetadata ?? (() => []);

  lines.push(`\n${divider}`);
  lines.push(`  ${title}`);
  lines.push(`${divider}\n`);

  lines.push(`📊 Total: ${summary.total} issues`);
  lines.push(`   🔴 Critical: ${summary.critical}`);
  lines.push(`   🟡 Warning:  ${summary.warning}`);
  lines.push(`   🔵 Info:     ${summary.info}\n`);

  const byCategory = groupBy(issues, (i) => i.metadata?.category || 'other');

  for (const [category, categoryIssues] of Object.entries(byCategory)) {
    const categoryName = getCategoryName(category);
    lines.push(`\n${categoryName} (${(categoryIssues as any[]).length})`);
    lines.push('─'.repeat(50));

    (categoryIssues as any[]).forEach((issue: any) => {
      const severity = getSeverityIcon(issue.severity);
      lines.push(`\n  ${severity} ${issue.title}`);
      if (issue.location?.file && issue.location?.line != null) {
        lines.push(`     File: ${issue.location.file}:${issue.location.line}`);
      }
      lines.push(`     Description: ${issue.description}`);
      for (const metaLine of renderMeta(issue)) {
        lines.push(`     ${metaLine}`);
      }
    });
  }

  lines.push(`\n${divider}\n`);
  return lines.join('\n');
}

export function printTextReport(
  issues: any[],
  summary: IssueSummary,
  logger: any,
  opts: ReportOptions,
): void {
  logger.info(generateTextReport(issues, summary, opts));
}

// ── HTML report ────────────────────────────────────────────────────────────

export function generateHTMLReport(
  issues: any[],
  summary: IssueSummary,
  title: string,
  renderIssueExtra?: (issue: any) => string,
): string {
  const issueRows = issues
    .map((issue) => {
      let extra = '';
      if (renderIssueExtra) {
        extra = renderIssueExtra(issue);
      }
      const fileLoc =
        issue.location?.file && issue.location?.line != null
          ? `<p><strong>File:</strong> ${issue.location.file}:${issue.location.line}</p>`
          : '';
      return `
      <div class="issue ${issue.severity}">
        <h3>${issue.title}</h3>
        ${fileLoc}
        <p><strong>Description:</strong> ${issue.description}</p>
        ${extra}
        ${issue.metadata?.suggestion ? `<p><strong>Suggestion:</strong> ${issue.metadata.suggestion}</p>` : ''}
      </div>
    `;
    })
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .issue { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .critical { border-left: 4px solid #ff4d4f; }
    .warning { border-left: 4px solid #faad14; }
    .info { border-left: 4px solid #1890ff; }
    .stats { display: flex; gap: 20px; margin: 20px 0; }
    .stat { padding: 10px 20px; background: #f5f5f5; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
  </div>
  <div class="stats">
    <div class="stat">Total: ${summary.total}</div>
    <div class="stat">Critical: ${summary.critical}</div>
    <div class="stat">Warning: ${summary.warning}</div>
    <div class="stat">Info: ${summary.info}</div>
  </div>
  <div class="issues">
    ${issueRows}
  </div>
</body>
</html>
  `;
}

// ── Unified output handler ─────────────────────────────────────────────────

export async function outputResult(
  result: DiagnoseResult,
  options: OutputOptions & ReportOptions,
  logger: any,
): Promise<void> {
  const fmt = options.output ?? 'text';

  switch (fmt) {
    case 'json': {
      const jsonOutput = JSON.stringify(result, null, 2);
      if (options.outputFile) {
        await fs.writeFile(options.outputFile, jsonOutput, 'utf-8');
        logger.info(`报告已保存到: ${options.outputFile}`);
      } else {
        logger.info(jsonOutput);
      }
      break;
    }

    case 'html': {
      const htmlReport = generateHTMLReport(
        result.issues,
        result.summary,
        options.title || 'Report',
        options.renderIssueMetadataHTML,
      );
      if (options.outputFile) {
        await fs.writeFile(options.outputFile, htmlReport, 'utf-8');
        logger.info(`HTML报告已保存到: ${options.outputFile}`);
      } else {
        logger.info(htmlReport);
      }
      break;
    }

    case 'text':
    default: {
      printTextReport(result.issues, result.summary, logger, options);
      if (options.outputFile) {
        const text = generateTextReport(result.issues, result.summary, options);
        await fs.writeFile(options.outputFile, text, 'utf-8');
        logger.info(`\n✅ Report saved to: ${options.outputFile}`);
      }
      break;
    }
  }
}
