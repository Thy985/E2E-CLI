/**
 * audit command — HTML report XSS escaping tests
 *
 * 之前 `audit.ts` 的 `formatHTML` 把 `report.project.name` / `rec.title` 等
 * 用户可控字段直接拼到模板字符串里 —— XSS。修复后所有 user-supplied
 * 字段必须经过 escapeHTML。
 */

import { describe, it, expect } from 'bun:test';
import { formatHTML, formatCompact, formatMarkdown } from '../../src/cli/commands/audit';
import { AuditReport, ProjectInfo, AuditCategory, AuditRecommendation } from '../../src/types';

function mkReport(overrides: Partial<AuditReport> = {}): AuditReport {
  const project: ProjectInfo = overrides.project ?? { name: 'qa', path: '/tmp/x' };
  return {
    version: '1.0.0',
    timestamp: '2024-01-01T00:00:00.000Z',
    project,
    summary: {
      overallScore: 85,
      overallGrade: 'B',
      healthStatus: 'healthy',
      categoryScores: {},
      totalIssues: 2,
      criticalIssues: 0,
    },
    categories: overrides.categories ?? [],
    recommendations: overrides.recommendations ?? [],
    duration: 100,
    ...overrides,
  } as AuditReport;
}

describe('audit command — formatHTML XSS escaping', () => {
  it('escapes <script> in project name', () => {
    const html = formatHTML(mkReport({ project: { name: '<script>alert(1)</script>', path: '/x' } }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes " in project name (attribute breakout)', () => {
    const html = formatHTML(mkReport({ project: { name: 'a" onerror="alert(1)', path: '/x' } }));
    expect(html).not.toContain('"onerror="alert(1)');
    // The " characters are escaped, so the raw "onerror= payload cannot appear unescaped
    expect(html).toContain('&quot; onerror=&quot;alert(1)');
  });

  it('escapes category displayName', () => {
    const cat: AuditCategory = {
      name: 'code',
      displayName: '<img src=x onerror=alert(1)>',
      score: 80,
      weight: 1,
      status: 'pass',
      checks: [],
    };
    const html = formatHTML(mkReport({ categories: [cat] }));
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });

  it('escapes recommendation title and description', () => {
    const rec: AuditRecommendation = {
      priority: 'high',
      category: 'security',
      title: '<script>steal()</script>',
      description: 'evil" payload',
      impact: 'critical',
      effort: 'medium',
      autoFixable: false,
    };
    const html = formatHTML(mkReport({ recommendations: [rec] }));
    expect(html).not.toContain('<script>steal()</script>');
    expect(html).toContain('&lt;script&gt;steal()&lt;/script&gt;');
    expect(html).toContain('evil&quot; payload');
  });

  it('escapes priority in class attribute (CSS class breakout)', () => {
    // priority is a CSS class — a malicious value like 'x" onmouseover="alert(1)' would XSS.
    // We assert that even if priority somehow leaked in, the template escapes it.
    const rec = {
      priority: 'x" onmouseover="alert(1)' as unknown as 'low',
      category: 'a',
      title: 't',
      description: 'd',
      impact: 'i',
      effort: 'low' as const,
      autoFixable: false,
    };
    const html = formatHTML(mkReport({ recommendations: [rec] }));
    expect(html).not.toContain('" onmouseover="alert(1)"');
  });
});

describe('audit command — formatCompact / formatMarkdown', () => {
  it('formatCompact produces a one-line summary', () => {
    const out = formatCompact(mkReport());
    expect(out).toContain('项目健康度: 85/100');
    expect(out).toContain('B');
  });

  it('formatMarkdown builds a table with category rows', () => {
    const cat: AuditCategory = {
      name: 'code',
      displayName: 'Code Quality',
      score: 80,
      weight: 1,
      status: 'pass',
      checks: [],
    };
    const out = formatMarkdown(mkReport({ categories: [cat] }));
    expect(out).toContain('# 项目健康度审计报告');
    expect(out).toContain('Code Quality');
    expect(out).toContain('|------|');
  });
});
