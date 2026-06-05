/**
 * Shared escapeHTML utility tests
 *
 * Once used to live in two places (engines/report/index.ts and
 * cli/shared/report-helper.ts). It's been hoisted to utils/format.ts so a
 * single regression test covers all callers.
 */

import { describe, it, expect } from 'bun:test';
import { escapeHTML } from '../../src/utils/format';

describe('escapeHTML', () => {
  it('escapes < and > to prevent tag injection', () => {
    expect(escapeHTML('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes " to prevent attribute breakout', () => {
    expect(escapeHTML('a" onerror="alert(1)')).toBe('a&quot; onerror=&quot;alert(1)');
  });

  it('escapes single quotes', () => {
    expect(escapeHTML("it's")).toBe('it&#39;s');
  });

  it('escapes backticks to neutralize template-literal injection', () => {
    expect(escapeHTML('`${process.env.SECRET}`')).toBe('&#96;${process.env.SECRET}&#96;');
  });

  it('escapes & FIRST to avoid double-escape', () => {
    // & must be replaced before the others, otherwise &lt; would become &amp;lt;
    expect(escapeHTML('A & B')).toBe('A &amp; B');
    expect(escapeHTML('&lt;')).toBe('&amp;lt;');
  });

  it('returns empty string for null and undefined', () => {
    expect(escapeHTML(null)).toBe('');
    expect(escapeHTML(undefined)).toBe('');
  });

  it('coerces numbers to strings', () => {
    expect(escapeHTML(42)).toBe('42');
    expect(escapeHTML(0)).toBe('0');
  });

  it('passes through safe content untouched', () => {
    expect(escapeHTML('hello world')).toBe('hello world');
    expect(escapeHTML('中文测试')).toBe('中文测试');
  });
});
