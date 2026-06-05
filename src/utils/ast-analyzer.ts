/**
 * AST-based diagnostic utilities using @typescript-eslint/parser.
 *
 * Provides real syntactic (and limited semantic) analysis as an
 * improvement over naive regex matching.
 */

import * as TSESLint from '@typescript-eslint/parser';
import { AST_NODE_TYPES } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/typescript-estree';

// ---------------------------------------------------------------------------
// Parsed file representation
// ---------------------------------------------------------------------------

export interface ASTFile {
  filePath: string;
  ast: TSESTree.Program;
  source: string;
  lines: string[];
}

/** Parse a TypeScript/JavaScript source file into an AST. */
export function parseFile(filePath: string, source: string): ASTFile | null {
  try {
    const isJSX = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');
    const ast = TSESLint.parse(source, {
      loc: true,
      range: true,
      sourceType: 'module',
      ecmaVersion: 2020,
      ...(isJSX && { ecmaFeatures: { jsx: true } }),
    });
    return {
      filePath,
      ast,
      source,
      lines: source.split('\n'),
    };
  } catch {
    // Parsing failed (syntax error or unsupported syntax)
    return null;
  }
}

// ---------------------------------------------------------------------------
// AST Visitors / Matchers
// ---------------------------------------------------------------------------

/** Walk the AST depth-first, calling `enter` for each node. */
export function walkAST(
  node: TSESTree.Node,
  enter: (n: TSESTree.Node) => void
): void {
  enter(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const child = (node as unknown as Record<string, unknown>)[key];
    if (child && typeof child === 'object') {
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object' && 'type' in item) {
            walkAST(item as TSESTree.Node, enter);
          }
        }
      } else if ('type' in child) {
        walkAST(child as TSESTree.Node, enter);
      }
    }
  }
}

/** Find all nodes of a given type. */
export function findNodesByType<T extends AST_NODE_TYPES>(
  ast: TSESTree.Program,
  type: T
): Array<TSESTree.Node & { type: T }> {
  const results: Array<TSESTree.Node & { type: T }> = [];
  walkAST(ast, (node) => {
    if (node.type === type) {
      results.push(node as TSESTree.Node & { type: T });
    }
  });
  return results;
}

// ---------------------------------------------------------------------------
// Security-oriented AST checks
// ---------------------------------------------------------------------------

/** Result from an AST-based security check. */
export interface ASTSecurityIssue {
  ruleId: string;
  line: number;
  column: number;
  message: string;
  snippet: string;
}

/**
 * Detect `eval()` and `new Function()` calls using AST.
 * These are dangerous because they execute arbitrary strings as code.
 */
export function detectEvalCalls(astFile: ASTFile): ASTSecurityIssue[] {
  const issues: ASTSecurityIssue[] = [];

  walkAST(astFile.ast, (node) => {
    // eval(...)
    if (node.type === AST_NODE_TYPES.CallExpression) {
      const callee = node.callee;
      if (
        callee.type === AST_NODE_TYPES.Identifier &&
        callee.name === 'eval'
      ) {
        const loc = node.loc;
        issues.push({
          ruleId: 'eval-usage',
          line: loc?.start.line ?? 0,
          column: loc?.start.column ?? 0,
          message: '使用 eval() 存在代码注入风险',
          snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
        });
      }
      // new Function(...)
      if (
        callee.type === AST_NODE_TYPES.NewExpression &&
        callee.callee.type === AST_NODE_TYPES.Identifier &&
        callee.callee.name === 'Function'
      ) {
        const loc = callee.loc;
        issues.push({
          ruleId: 'eval-usage',
          line: loc?.start.line ?? 0,
          column: loc?.start.column ?? 0,
          message: '使用 new Function() 存在代码注入风险',
          snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
        });
      }
    }
  });

  return issues;
}

/**
 * Detect `dangerouslySetInnerHTML` and direct `innerHTML` assignments.
 */
export function detectXSSRisk(astFile: ASTFile): ASTSecurityIssue[] {
  const issues: ASTSecurityIssue[] = [];

  walkAST(astFile.ast, (node) => {
    // dangerouslySetInnerHTML={{ __html: ... }}
    if (
      node.type === AST_NODE_TYPES.JSXAttribute &&
      node.name.type === AST_NODE_TYPES.JSXIdentifier &&
      node.name.name === 'dangerouslySetInnerHTML'
    ) {
      const loc = node.loc;
      issues.push({
        ruleId: 'xss-risk',
        line: loc?.start.line ?? 0,
        column: loc?.start.column ?? 0,
        message: '使用 dangerouslySetInnerHTML 存在 XSS 风险',
        snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
      });
    }

    // element.innerHTML = ...
    if (
      node.type === AST_NODE_TYPES.AssignmentExpression &&
      node.left.type === AST_NODE_TYPES.MemberExpression &&
      node.left.property.type === AST_NODE_TYPES.Identifier &&
      node.left.property.name === 'innerHTML'
    ) {
      const loc = node.loc;
      issues.push({
        ruleId: 'xss-risk',
        line: loc?.start.line ?? 0,
        column: loc?.start.column ?? 0,
        message: '直接赋值 innerHTML 存在 XSS 风险',
        snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
      });
    }
  });

  return issues;
}

/**
 * Detect `Math.random()` calls that are used in security-sensitive contexts.
 * Skips UI/animation/game-related usage.
 */
export function detectInsecureRandom(astFile: ASTFile): ASTSecurityIssue[] {
  const issues: ASTSecurityIssue[] = [];

  walkAST(astFile.ast, (node) => {
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.MemberExpression &&
      node.callee.object.type === AST_NODE_TYPES.Identifier &&
      node.callee.object.name === 'Math' &&
      node.callee.property.type === AST_NODE_TYPES.Identifier &&
      node.callee.property.name === 'random'
    ) {
      const loc = node.loc;
      const line = astFile.lines[loc!.start.line - 1] ?? '';

      // Skip non-security contexts
      if (isNonSecurityContext(line)) return;

      issues.push({
        ruleId: 'insecure-random',
        line: loc?.start.line ?? 0,
        column: loc?.start.column ?? 0,
        message: 'Math.random() 不适用于安全敏感场景，请使用 crypto.getRandomValues()',
        snippet: line.trim(),
      });
    }
  });

  return issues;
}

/**
 * Detect `document.write()` calls.
 */
export function detectDocumentWrite(astFile: ASTFile): ASTSecurityIssue[] {
  const issues: ASTSecurityIssue[] = [];

  walkAST(astFile.ast, (node) => {
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.MemberExpression &&
      node.callee.object.type === AST_NODE_TYPES.Identifier &&
      node.callee.object.name === 'document' &&
      node.callee.property.type === AST_NODE_TYPES.Identifier &&
      node.callee.property.name === 'write'
    ) {
      const loc = node.loc;
      issues.push({
        ruleId: 'xss-risk',
        line: loc?.start.line ?? 0,
        column: loc?.start.column ?? 0,
        message: '使用 document.write() 存在 XSS 风险',
        snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
      });
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Helper: detect if Math.random() is used in a non-security context
// ---------------------------------------------------------------------------

function isNonSecurityContext(line: string): boolean {
  const patterns = [
    /key\s*[=:]\s*.*Math\.random/i,
    /Math\.random\(\)\s*\*\s*\d+\s*[+\-]/,
    /opacity.*Math\.random|Math\.random.*opacity/i,
    /animation.*Math\.random|Math\.random.*animation/i,
    /color.*Math\.random|Math\.random.*color/i,
    /className.*Math\.random|Math\.random.*className/i,
    /style.*Math\.random|Math\.random.*style/i,
    /Math\.random\(\)\s*<\s*0?\.5/i,
    /(?:mock|fixture|dummy|fake|test).*Math\.random/i,
    /randomize.*(?:order|position|layout)/i,
    /(?:shuffle|random).*(?:item|element|display)/i,
  ];
  return patterns.some((r) => r.test(line));
}

// ---------------------------------------------------------------------------
// Performance-oriented AST checks
// ---------------------------------------------------------------------------

/**
 * Detect `console.log` / `console.warn` / `console.error` calls in production code.
 * These should be removed or wrapped in environment checks.
 */
export function detectConsoleStatements(astFile: ASTFile): Array<{
  ruleId: string;
  line: number;
  column: number;
  method: string;
  snippet: string;
}> {
  const results: Array<{
    ruleId: string;
    line: number;
    column: number;
    method: string;
    snippet: string;
  }> = [];

  walkAST(astFile.ast, (node) => {
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.MemberExpression &&
      node.callee.object.type === AST_NODE_TYPES.Identifier &&
      node.callee.object.name === 'console' &&
      node.callee.property.type === AST_NODE_TYPES.Identifier &&
      ['log', 'warn', 'error', 'info', 'debug'].includes(node.callee.property.name)
    ) {
      const loc = node.loc;
      results.push({
        ruleId: 'console-statement',
        line: loc?.start.line ?? 0,
        column: loc?.start.column ?? 0,
        method: node.callee.property.name,
        snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
      });
    }
  });

  return results;
}

/**
 * Detect synchronous API calls or patterns that might indicate performance issues.
 * E.g., synchronous XMLHttpRequest, blocking loops, etc.
 */
export function detectSyncPatterns(astFile: ASTFile): Array<{
  ruleId: string;
  line: number;
  column: number;
  message: string;
  snippet: string;
}> {
  const results: Array<{
    ruleId: string;
    line: number;
    column: number;
    message: string;
    snippet: string;
  }> = [];

  walkAST(astFile.ast, (node) => {
    // Synchronous XMLHttpRequest: xhr.open('GET', url, false)
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.MemberExpression &&
      node.callee.property.type === AST_NODE_TYPES.Identifier &&
      node.callee.property.name === 'open'
    ) {
      const thirdArg = node.arguments[2];
      if (
        thirdArg &&
        thirdArg.type === AST_NODE_TYPES.Literal &&
        thirdArg.value === false
      ) {
        const loc = node.loc;
        results.push({
          ruleId: 'sync-xhr',
          line: loc?.start.line ?? 0,
          column: loc?.start.column ?? 0,
          message: '使用同步 XMLHttpRequest 会阻塞主线程',
          snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
        });
      }
    }
  });

  return results;
}
