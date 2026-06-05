/**
 * Report generator XSS escape tests
 *
 * 关键回归测试：之前 formatHTML 把 issue.title / issue.description
 * 直接拼进 HTML → XSS。修复后所有用户输入字段必须被转义。
 */

import { describe, it, expect } from 'bun:test';
import { createReportGenerator } from '../../src/engines/report';
import { Diagnosis, ProjectInfo, DiagnosisReport } from '../../src/types';

const generator = createReportGenerator();

function makeReport(name: string, title: string, description: string): DiagnosisReport {
  const project: ProjectInfo = { name, path: '/tmp/x' };
  const issue: Diagnosis = {
    id: 'd1',
    skill: 'a11y',
    type: 'accessibility',
    severity: 'critical',
    title,
    description,
    location: { file: 'src/x.ts' },
  };
  return generator.generate(project, [issue], 100);
}

describe('ReportGenerator.formatHTML — XSS escaping', () => {
  it('escapes < and > in project name', () => {
    const html = generator.formatHTML(makeReport('<script>alert(1)</script>', 't', 'd'));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes " in issue title to prevent attribute break-out', () => {
    const html = generator.formatHTML(makeReport('p', 'evil" onerror="alert(1)', 'd'));
    expect(html).not.toContain('"onerror=');
  });

  it('escapes & first (to avoid double-escape)', () => {
    const html = generator.formatHTML(makeReport('A & B', 't', 'd'));
    // & 变成 &amp; 而不是 &amp;amp;
    expect(html).toContain('A &amp; B');
    expect(html).not.toContain('&amp;amp;');
  });

  it('escapes issue description body', () => {
    const html = generator.formatHTML(makeReport('p', 't', '<img src=x onerror=alert(1)>'));
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });

  it('escapes backtick (template-literal injection)', () => {
    const html = generator.formatHTML(makeReport('p', 't', '`${process.env.SECRET}`'));
    expect(html).toContain('&#96;');
  });
});
