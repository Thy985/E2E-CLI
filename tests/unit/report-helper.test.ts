/**
 * report-helper tests — 共享 CLI 报告渲染层
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  buildCommandContext,
  summarizeIssues,
  writeOutput,
  getSeverityIcon,
  getSeverityClass,
  generateHTMLReport,
  printTextReport,
  exitWithIssueCount,
} from '../../src/cli/shared/report-helper';
import { createLogger } from '../../src/utils/logger';
import { Diagnosis } from '../../src/types';

function mkIssue(severity: Diagnosis['severity'], title: string, overrides: Partial<Diagnosis> = {}): Diagnosis {
  return {
    id: `id-${title}`,
    skill: 'test',
    type: 'code-quality',
    severity,
    title,
    description: `Description for ${title}`,
    location: { file: 'src/x.ts', line: 1 },
    ...overrides,
  };
}

describe('report-helper', () => {
  describe('summarizeIssues', () => {
    it('counts by severity', () => {
      const s = summarizeIssues([
        mkIssue('critical', 'a'),
        mkIssue('critical', 'b'),
        mkIssue('warning', 'c'),
        mkIssue('info', 'd'),
        mkIssue('info', 'e'),
      ]);
      expect(s).toEqual({ total: 5, critical: 2, warning: 1, info: 2 });
    });

    it('handles empty input', () => {
      expect(summarizeIssues([])).toEqual({ total: 0, critical: 0, warning: 0, info: 0 });
    });
  });

  describe('getSeverityIcon / getSeverityClass', () => {
    it('returns expected icons', () => {
      expect(getSeverityIcon('critical')).toBe('🔴');
      expect(getSeverityIcon('warning')).toBe('🟡');
      expect(getSeverityIcon('info')).toBe('🔵');
      expect(getSeverityIcon('unknown')).toBe('⚪');
    });

    it('returns expected CSS classes', () => {
      expect(getSeverityClass('critical')).toBe('critical');
      expect(getSeverityClass('warning')).toBe('warning');
      expect(getSeverityClass('info')).toBe('info');
      expect(getSeverityClass('unknown')).toBe('other');
    });
  });

  describe('buildCommandContext', () => {
    it('returns a fully populated SkillContext', () => {
      const ctx = buildCommandContext('/tmp/proj', { version: 1 }, createLogger({ level: 'error' }));
      expect(ctx.project.path).toBe('/tmp/proj');
      expect(ctx.tools).toBeDefined();
      expect(ctx.model).toBeDefined();
      expect(ctx.storage).toBeDefined();
    });
  });

  describe('generateHTMLReport — XSS escaping', () => {
    it('escapes < and > in issue title', () => {
      const html = generateHTMLReport('T', [mkIssue('critical', '<script>alert(1)</script>')], { total: 1, critical: 1, warning: 0, info: 0 });
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapes " in title to prevent attribute breakout', () => {
      const html = generateHTMLReport('T', [mkIssue('critical', 'a" onerror="alert(1)')], { total: 1, critical: 1, warning: 0, info: 0 });
      expect(html).not.toContain('"onerror=');
    });

    it('escapes & first', () => {
      const html = generateHTMLReport('A & B', [mkIssue('critical', 't')], { total: 1, critical: 1, warning: 0, info: 0 });
      expect(html).toContain('A &amp; B');
      expect(html).not.toContain('&amp;amp;');
    });

    it('escapes file path', () => {
      const html = generateHTMLReport('T', [mkIssue('critical', 't', { location: { file: 'src/<x>.ts' } })], { total: 1, critical: 1, warning: 0, info: 0 });
      expect(html).toContain('src/&lt;x&gt;.ts');
    });
  });

  describe('writeOutput', () => {
    let tmp = '';
    beforeEach(async () => {
      tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-agent-rh-'));
    });
    afterEach(async () => {
      await fs.rm(tmp, { recursive: true, force: true });
    });

    it('writes JSON to file', async () => {
      const out = path.join(tmp, 'out.json');
      const issues = [mkIssue('critical', 'x')];
      await writeOutput('Title', issues, summarizeIssues(issues), { format: 'json', outputFile: out });
      const content = await fs.readFile(out, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.summary.critical).toBe(1);
    });

    it('writes HTML to file', async () => {
      const out = path.join(tmp, 'out.html');
      const issues = [mkIssue('critical', 'x')];
      await writeOutput('Title', issues, summarizeIssues(issues), { format: 'html', outputFile: out });
      const content = await fs.readFile(out, 'utf-8');
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('Title');
    });
  });

  describe('exitWithIssueCount', () => {
    it('returns a function with the right return type', () => {
      // 静态检查：函数返回类型是 never（这样 TS 会接受之后的 dead code）
      const fn: (issues: readonly Diagnosis[]) => never = exitWithIssueCount;
      expect(typeof fn).toBe('function');
    });
  });
});
