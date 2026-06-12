/**
 * Level 0 (format) 单元测试
 *
 * 覆盖：
 * - checkBrackets: 各种括号配对边界（平衡/不配/未闭合/字符串中括号/注释中括号）
 * - runFormatVerification: JSON 语法、JS/TS 括号、no changes、throw 兜底
 */

import { describe, it, expect } from 'bun:test';
import { runFormatVerification, checkBrackets } from '../../../src/engines/verify/levels/format';
import type { Fix } from '../../../src/types';

describe('Level 0: format - checkBrackets', () => {
  it('returns balanced=true for empty input', () => {
    expect(checkBrackets('').balanced).toBe(true);
  });

  it('returns balanced=true for balanced parentheses/brackets/braces', () => {
    expect(checkBrackets('const x = [1, { a: (b) => b }];').balanced).toBe(true);
  });

  it('returns balanced=true for nested templates with brackets', () => {
    const code = 'const s = `hello ${[1, 2].map(n => n + 1)}`;';
    expect(checkBrackets(code).balanced).toBe(true);
  });

  it('ignores brackets inside single/double-quoted strings', () => {
    expect(checkBrackets('const s = "if(a){[(";').balanced).toBe(true);
  });

  it('ignores brackets inside single-line comments', () => {
    expect(checkBrackets('// if(a){[( \n const x = 1;').balanced).toBe(true);
  });

  it('ignores brackets inside block comments', () => {
    expect(checkBrackets('/* if(a){[(*/ const x = 1;').balanced).toBe(true);
  });

  it('returns balanced=false for mismatched close paren', () => {
    const r = checkBrackets('const x = 1);');
    expect(r.balanced).toBe(false);
    expect(r.error).toContain("')'");
  });

  it('returns balanced=false for mismatched close brace', () => {
    const r = checkBrackets('const x = { a: 1 };');
    // hmm, this IS balanced — use a real mismatch
    const r2 = checkBrackets('const x = }a: 1};');
    expect(r2.balanced).toBe(false);
  });

  it('returns balanced=false for unclosed paren', () => {
    const r = checkBrackets('const x = (1, 2, 3;');
    expect(r.balanced).toBe(false);
    expect(r.error).toContain('Unclosed');
  });

  it('returns balanced=false for unclosed array bracket', () => {
    const r = checkBrackets('const x = [1, 2, 3;');
    expect(r.balanced).toBe(false);
  });
});

describe('Level 0: format - runFormatVerification', () => {
  function makeFix(changes: any[]): Fix {
    return {
      id: 'f1',
      diagnosisId: 'd1',
      changes,
      description: 'test',
    } as Fix;
  }

  it('passes when no changes', () => {
    const fix = makeFix([]);
    expect(runFormatVerification(fix).passed).toBe(true);
  });

  it('passes for valid JSON content', () => {
    const fix = makeFix([{ file: 'package.json', content: '{"name":"ok","version":"1.0.0"}' }]);
    expect(runFormatVerification(fix).passed).toBe(true);
  });

  it('fails for invalid JSON content with file path in error', () => {
    const fix = makeFix([{ file: 'tsconfig.json', content: '{ bad: "json" }' }]);
    const r = runFormatVerification(fix);
    expect(r.passed).toBe(false);
    expect(r.error).toContain('tsconfig.json');
    expect(r.error).toContain('Invalid JSON');
  });

  it('passes for balanced JS code', () => {
    const fix = makeFix([{ file: 'a.ts', content: 'export const x = (a: number) => a + 1;' }]);
    expect(runFormatVerification(fix).passed).toBe(true);
  });

  it('fails for unbalanced TS code with file path in error', () => {
    const fix = makeFix([{ file: 'src/foo.ts', content: 'const x = (1, 2, 3;' }]);
    const r = runFormatVerification(fix);
    expect(r.passed).toBe(false);
    expect(r.error).toContain('src/foo.ts');
  });

  it('handles JSX/TSX/MJS/CJS extensions the same as TS', () => {
    const extensions = ['jsx', 'tsx', 'mjs', 'cjs'];
    for (const ext of extensions) {
      const fix = makeFix([{ file: `a.${ext}`, content: 'const x = (1' }]);
      expect(runFormatVerification(fix).passed).toBe(false);
    }
  });

  it('ignores non-JS/JSON extensions (e.g. .md, .txt)', () => {
    const fix = makeFix([{ file: 'README.md', content: '(unclosed' }]);
    // Markdown/text isn't in the bracket-check list, so should pass
    expect(runFormatVerification(fix).passed).toBe(true);
  });

  it('handles change without content (defensive)', () => {
    const fix = makeFix([{ file: 'a.json' }]);
    const r = runFormatVerification(fix);
    // JSON without content: '' → JSON.parse('') fails → returns false
    expect(r.passed).toBe(false);
  });

  it('validates multiple changes and returns on first failure', () => {
    const fix = makeFix([
      { file: 'a.json', content: '{"valid":true}' },
      { file: 'b.json', content: '{ invalid' },
    ]);
    const r = runFormatVerification(fix);
    expect(r.passed).toBe(false);
    expect(r.error).toContain('b.json');
  });
});
