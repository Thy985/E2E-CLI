/**
 * Level 0: Format verification
 *
 * 对 fix.changes 中的文件做轻量语法检查：
 * - JSON 文件: JSON.parse 验证
 * - JS/TS/JSX/TSX/MJS/CJS 文件: 括号配对平衡检查（剥离字符串和注释）
 *
 * 不做编译、不做 AST — 仅兜底"明显改坏"的修复。
 */

import { Fix } from '../../../types';

export interface FormatVerificationResult {
  passed: boolean;
  error?: string;
}

/** Level 0: 格式验证（JSON 语法 / 括号配对） */
export function runFormatVerification(fix: Fix): FormatVerificationResult {
  try {
    if (!fix.changes || fix.changes.length === 0) {
      return { passed: true };
    }

    for (const change of fix.changes) {
      const ext = change.file.split('.').pop()?.toLowerCase();
      const content = change.content || '';

      // Basic JSON syntax validation
      if (ext === 'json') {
        try {
          JSON.parse(content);
        } catch (e) {
          return {
            passed: false,
            error: `Invalid JSON in ${change.file}: ${(e as Error).message}`,
          };
        }
      }

      // Basic bracket matching for JS/TS/JSX/TSX
      if (['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'].includes(ext || '')) {
        const brackets = checkBrackets(content);
        if (!brackets.balanced) {
          return {
            passed: false,
            error: `Unbalanced brackets in ${change.file}: ${brackets.error}`,
          };
        }
      }
    }

    return { passed: true };
  } catch (error) {
    return {
      passed: false,
      error: `Format check error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

interface BracketCheckResult {
  balanced: boolean;
  error?: string;
}

/** 简单括号配对检查（剥离字符串、模板、注释后扫描） */
export function checkBrackets(code: string): BracketCheckResult {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const openers = new Set(['(', '[', '{']);
  const closers = new Set([')', ']', '}']);

  // Remove strings and comments to avoid false positives
  const cleaned = code
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');

  for (const char of cleaned) {
    if (openers.has(char)) {
      stack.push(char);
    } else if (closers.has(char)) {
      const expected = pairs[char];
      if (stack.pop() !== expected) {
        return {
          balanced: false,
          error: `Mismatched '${char}'`,
        };
      }
    }
  }

  if (stack.length > 0) {
    return {
      balanced: false,
      error: `Unclosed: ${stack.slice(-3).join(', ')}`,
    };
  }

  return { balanced: true };
}
