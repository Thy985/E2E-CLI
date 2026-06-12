/**
 * Level 3: AST diff verification
 *
 * 解析 fix.changes 中 JS/TS 类文件的修复前后 AST，对比节点签名集合
 * （type:path）来近似计算 added/removed/modified 节点数。
 *
 * 超过 maxAstNodeChanges 阈值则验证失败。
 */

import { Fix } from '../../../types';
import { AstDiffResult, NormalizedVerifyOptions } from './types';

export interface AstDiffVerificationResult {
  passed: boolean;
  skipped: boolean;
  result?: AstDiffResult;
}

/** Level 3: AST diff 验证 */
export function runAstDiffVerification(
  fix: Fix,
  opts: NormalizedVerifyOptions,
): AstDiffVerificationResult {
  const summary: string[] = [];
  let totalAdded = 0;
  let totalRemoved = 0;
  let totalModified = 0;
  let anyParsed = false;
  let parseOk = true;
  let parseError: string | undefined;

  if (!fix.changes || fix.changes.length === 0) {
    return { passed: true, skipped: true };
  }

  for (const change of fix.changes) {
    const ext = change.file.split('.').pop()?.toLowerCase();
    if (!['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'].includes(ext || '')) {
      continue;
    }

    // If no oldContent provided, we can only validate the new AST is parseable
    if (!change.oldContent) {
      const newAst = parseAST(change.content || '');
      if (!newAst) {
        parseOk = false;
        parseError = `Failed to parse AST for ${change.file}`;
        break;
      }
      anyParsed = true;
      continue;
    }

    const beforeAst = parseAST(change.oldContent);
    const afterAst = parseAST(change.content || '');

    if (!beforeAst || !afterAst) {
      parseOk = false;
      parseError = `Failed to parse AST for ${change.file}`;
      break;
    }

    anyParsed = true;
    const diff = diffAST(beforeAst, afterAst);

    totalAdded += diff.addedNodes;
    totalRemoved += diff.removedNodes;
    totalModified += diff.modifiedNodes;

    summary.push(
      `${change.file}: +${diff.addedNodes} -${diff.removedNodes} ~${diff.modifiedNodes} nodes`,
    );
  }

  const totalChanges = totalAdded + totalRemoved + totalModified;
  const exceedsThreshold = totalChanges > opts.maxAstNodeChanges;

  if (exceedsThreshold) {
    summary.push(`AST changes (${totalChanges}) exceed threshold (${opts.maxAstNodeChanges})`);
  }

  return {
    passed: parseOk && anyParsed && !exceedsThreshold,
    skipped: false,
    result: {
      passed: parseOk && anyParsed && !exceedsThreshold,
      parsed: anyParsed,
      error: parseError,
      addedNodes: totalAdded,
      removedNodes: totalRemoved,
      modifiedNodes: totalModified,
      totalChanges,
      summary,
    },
  };
}

/** 解析 JS/TS/JSX/TSX 代码到 AST */
export function parseAST(code: string): unknown {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const parser = require('@typescript-eslint/parser');

  // 1. 尝试 TS + JSX（覆盖 JSX/TSX 场景）
  try {
    return parser.parse(code, {
      sourceType: 'module',
      ecmaVersion: 'latest',
      ecmaFeatures: { jsx: true },
      loc: false,
      range: false,
      tokens: false,
      comment: false,
    });
  } catch {
    // ignore — try next variant
  }

  // 2. 尝试 TS（无 JSX）
  try {
    return parser.parse(code, {
      sourceType: 'module',
      ecmaVersion: 'latest',
      loc: false,
      range: false,
      tokens: false,
      comment: false,
    });
  } catch {
    // ignore — try next variant
  }

  // 3. 退到 script sourceType（无模块语法）
  try {
    return parser.parse(code, {
      sourceType: 'script',
      ecmaVersion: 'latest',
      loc: false,
      range: false,
      tokens: false,
      comment: false,
    });
  } catch {
    return null;
  }
}

interface AstDiffSummary {
  addedNodes: number;
  removedNodes: number;
  modifiedNodes: number;
  totalChanges: number;
}

/** 对比两个 AST 的节点签名集合（type:path） */
export function diffAST(before: unknown, after: unknown): AstDiffSummary {
  const beforeNodes = collectNodeSignatures(before);
  const afterNodes = collectNodeSignatures(after);

  const beforeSet = new Set(beforeNodes);
  const afterSet = new Set(afterNodes);

  let addedNodes = 0;
  for (const sig of afterNodes) {
    if (!beforeSet.has(sig)) addedNodes++;
  }

  let removedNodes = 0;
  for (const sig of beforeNodes) {
    if (!afterSet.has(sig)) removedNodes++;
  }

  // Modified nodes are approximated by the overlap of changes
  const totalUnique = new Set([...beforeNodes, ...afterNodes]).size;
  const unchanged = beforeNodes.filter(s => afterSet.has(s)).length;
  const modifiedNodes = Math.max(0, totalUnique - beforeNodes.length - afterNodes.length + unchanged);

  return {
    addedNodes,
    removedNodes,
    modifiedNodes: Math.min(modifiedNodes, addedNodes + removedNodes),
    totalChanges: addedNodes + removedNodes + Math.min(modifiedNodes, addedNodes + removedNodes),
  };
}

/**
 * 提取 AST 中所有节点的 type（无 path）
 * 用于 pattern matching：判断某个 pattern 在 AST 中是否存在。
 * 区别于 collectNodeSignatures — 后者带 path 用于 diff。
 */
export function collectNodeTypes(node: unknown): string[] {
  const types: string[] = [];

  if (node === null || node === undefined || typeof node !== 'object') {
    return types;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      types.push(...collectNodeTypes(item));
    }
    return types;
  }

  const obj = node as Record<string, unknown>;
  const type = obj.type as string | undefined;

  if (type) {
    types.push(type);
    for (const value of Object.values(obj)) {
      types.push(...collectNodeTypes(value));
    }
  }

  return types;
}

/**
 * 收集 AST 节点签名（type:path）
 * path 反映遍历路径，用于在 diff 时区分同名同 path 的不同节点。
 */
export function collectNodeSignatures(node: unknown, path = 'root'): string[] {
  const signatures: string[] = [];

  if (node === null || node === undefined || typeof node !== 'object') {
    return signatures;
  }

  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      const childPath = `${path}[${index}]`;
      signatures.push(...collectNodeSignatures(item, childPath));
    });
    return signatures;
  }

  const obj = node as Record<string, unknown>;
  const type = obj.type as string | undefined;

  if (type) {
    signatures.push(`${type}:${path}`);

    // Collect child nodes from known AST properties
    const childKeys = ['body', 'declarations', 'expression', 'argument',
      'arguments', 'callee', 'consequent', 'alternate', 'init', 'test',
      'update', 'left', 'right', 'properties', 'elements', 'key', 'value',
      'object', 'property', 'params', 'block', 'handler',
      'finalizer', 'declaration', 'specifiers', 'source', 'local',
      'imported', 'exported'];

    for (const key of childKeys) {
      if (obj[key] !== undefined) {
        const childPath = `${path}.${key}`;
        signatures.push(...collectNodeSignatures(obj[key], childPath));
      }
    }
  }

  return signatures;
}
