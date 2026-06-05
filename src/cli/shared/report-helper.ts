/**
 * CLI 报告渲染共享模块
 *
 * 之前 4 个 skill 子命令（best-practices / seo / dependency / ux-audit）
 * 各自复制了一份 ~150 行的 report 渲染代码，包括：
 *  - context object 拼接（含 3 处 `{} as any`）
 *  - 按 severity 计数
 *  - printTextReport / generateHTMLReport
 *  - getCategoryName / getSeverityIcon
 *
 * 集中到这里，所有 html 拼接都走 escapeHTML —— 修复之前 ${issue.title}
 * 直接插值的 XSS。
 */

import * as fsp from 'fs/promises';
import { SkillContext, Diagnosis, DiagnosisReport, ProjectInfo } from '../../types';
import { QAConfig } from '../../config';
import { groupBy } from '../../utils/array';
import { escapeHTML } from '../../utils/format';
import { createLogger } from '../../utils/logger';

export interface CommandOptions {
  path?: string;
  output?: 'text' | 'json' | 'html';
  outputFile?: string;
}

export interface IssueSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
}

const SEVERITY_ICON: Record<string, string> = {
  critical: '🔴',
  warning: '🟡',
  info: '🔵',
  error: '❌',
};
const SEVERITY_CSS: Record<string, string> = {
  critical: 'critical',
  warning: 'warning',
  info: 'info',
  error: 'error',
};

export function getSeverityIcon(severity: string): string {
  return SEVERITY_ICON[severity] ?? '⚪';
}

export function getSeverityClass(severity: string): string {
  return SEVERITY_CSS[severity] ?? 'other';
}

export function summarizeIssues(issues: readonly Diagnosis[]): IssueSummary {
  let critical = 0, warning = 0, info = 0;
  for (const i of issues) {
    if (i.severity === 'critical') critical++;
    else if (i.severity === 'warning') warning++;
    else if (i.severity === 'info') info++;
  }
  return { total: issues.length, critical, warning, info };
}

/**
 * 给 4 个 skill 子命令用的最小 context。
 * tool / model / storage 字段对纯诊断命令来说不需要，但 SkillContext 要求非空
 * —— 用 createNoopTools / createNoopModel / createNoopStorage 提供安全默认值。
 */
export function buildCommandContext(
  projectPath: string,
  config: QAConfig,
  logger: ReturnType<typeof createLogger>
): SkillContext {
  const project: ProjectInfo = {
    name: config.project?.name || projectPath.split('/').pop() || 'project',
    path: projectPath,
    type: config.project?.type || 'webapp',
  };
  return {
    project,
    config,
    logger,
    tools: createNoopTools(),
    model: createNoopModel(),
    storage: createNoopStorage(),
  };
}

export function createNoopTools(): SkillContext['tools'] {
  return {
    fs: {
      readFile: async () => { throw new Error('tools.fs.readFile is not available in this command'); },
      writeFile: async () => undefined,
      exists: async () => false,
      glob: async () => [],
      mkdir: async () => undefined,
      remove: async () => undefined,
      stat: async () => ({ size: 0, isFile: true, isDirectory: false }),
    },
    git: {
      getChangedFiles: async () => [],
      getCurrentBranch: async () => 'main',
      getCommitHash: async () => 'unknown',
    },
    shell: {
      execute: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
    },
  };
}

export function createNoopModel(): SkillContext['model'] {
  return { chat: async () => '' };
}

export function createNoopStorage(): SkillContext['storage'] {
  return {
    get: async () => null,
    set: async () => undefined,
    delete: async () => false,
    has: async () => false,
    keys: async () => [],
    clear: async () => undefined,
    flush: async () => undefined,
  };
}

/**
 * 文本报告（terminal 输出）。
 */
export function printTextReport(
  title: string,
  issues: readonly Diagnosis[],
  summary: IssueSummary
): void {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`                    ${title}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`📊 Total: ${summary.total} issues`);
  console.log(`   🔴 Critical: ${summary.critical}`);
  console.log(`   🟡 Warning:  ${summary.warning}`);
  console.log(`   🔵 Info:     ${summary.info}\n`);

  const byCategory = groupBy(issues, (i: Diagnosis) => i.metadata?.category || 'other');
  for (const [category, categoryIssues] of Object.entries(byCategory)) {
    const catList = categoryIssues as Diagnosis[];
    console.log(`\n📋 ${category} (${catList.length})`);
    console.log('─'.repeat(50));
    for (const issue of catList) {
      const severity = getSeverityIcon(issue.severity);
      console.log(`\n  ${severity} ${issue.title}`);
      const loc = issue.location;
      if (loc?.file) {
        console.log(`     File: ${loc.file}${loc.line ? `:${loc.line}` : ''}`);
      }
      if (issue.description) {
        console.log(`     Description: ${issue.description}`);
      }
      if (issue.metadata?.suggestion) {
        console.log(`     Suggestion: ${issue.metadata.suggestion}`);
      }
    }
  }
  console.log('\n═══════════════════════════════════════════════════════════\n');
}

/**
 * HTML 报告（XSS-safe，所有 issue 字段都走 escapeHTML）。
 */
export function generateHTMLReport(
  title: string,
  issues: readonly Diagnosis[],
  summary: IssueSummary
): string {
  const issueBlocks = issues
    .map((issue) => {
      const severityClass = getSeverityClass(issue.severity);
      const loc = issue.location;
      const locHTML = loc?.file
        ? `<p><strong>File:</strong> ${escapeHTML(loc.file)}${loc.line ? `:${escapeHTML(loc.line)}` : ''}</p>`
        : '';
      const sugHTML = issue.metadata?.suggestion
        ? `<p><strong>Suggestion:</strong> ${escapeHTML(issue.metadata.suggestion)}</p>`
        : '';
      return `
      <div class="issue ${severityClass}">
        <h3>${escapeHTML(issue.title)}</h3>
        ${locHTML}
        <p><strong>Description:</strong> ${escapeHTML(issue.description)}</p>
        ${sugHTML}
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHTML(title)}</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .issue { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .critical { border-left: 4px solid #ff4d4f; }
    .warning { border-left: 4px solid #faad14; }
    .info { border-left: 4px solid #1890ff; }
    .error { border-left: 4px solid #722ed1; }
    .stats { display: flex; gap: 20px; margin: 20px 0; }
    .stat { padding: 10px 20px; background: #f5f5f5; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHTML(title)}</h1>
    <p>Generated: ${escapeHTML(new Date().toLocaleString())}</p>
  </div>
  <div class="stats">
    <div class="stat">Total: ${summary.total}</div>
    <div class="stat">Critical: ${summary.critical}</div>
    <div class="stat">Warning: ${summary.warning}</div>
    <div class="stat">Info: ${summary.info}</div>
  </div>
  <div class="issues">${issueBlocks}</div>
</body>
</html>
`;
}

/**
 * 把结果写到 stdout / 文件，封装 text/json/html 三种格式。
 */
export async function writeOutput(
  title: string,
  issues: readonly Diagnosis[],
  summary: IssueSummary,
  options: { format?: 'text' | 'json' | 'html'; outputFile?: string }
): Promise<void> {
  const format = options.format ?? 'text';
  if (format === 'json') {
    const json = JSON.stringify({ issues, summary }, null, 2);
    if (options.outputFile) {
      await fsp.writeFile(options.outputFile, json, 'utf-8');
    } else {
      console.log(json);
    }
    return;
  }

  if (format === 'html') {
    const html = generateHTMLReport(title, issues, summary);
    if (options.outputFile) {
      await fsp.writeFile(options.outputFile, html, 'utf-8');
    } else {
      console.log(html);
    }
    return;
  }

  if (options.outputFile) {
    // text 也允许写到文件：用一份 human-readable 形式
    const lines: string[] = [`${title}`, `Total: ${summary.total}, Critical: ${summary.critical}, Warning: ${summary.warning}, Info: ${summary.info}`];
    for (const i of issues) {
      lines.push(`- [${i.severity}] ${i.title} (${i.location?.file ?? 'n/a'})`);
    }
    await fsp.writeFile(options.outputFile, lines.join('\n') + '\n', 'utf-8');
    return;
  }
  printTextReport(title, issues, summary);
}

export function exitWithIssueCount(issues: readonly Diagnosis[]): never {
  process.exit(issues.length > 0 ? 1 : 0);
}
