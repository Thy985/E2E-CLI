/**
 * AST 工具
 *
 * 为评估引擎提供 3 个共享的 AST 操作：
 * - collectNodeTypes: 提取 AST 中所有节点 type（用于 pattern matching）
 * - collectNodeSignatures: 提取 "type:path" 签名（用于 diff）
 * - diffAST: 对比两个 AST 的节点签名集合
 *
 * 全部用 unknown + Record<string, unknown> 适配不同 parser 产物，
 * 避免硬编码 @typescript-eslint 的 TSESTree 类型。
 */

export interface AstStructuralChanges {
  addedNodes: number;
  removedNodes: number;
  modifiedNodes: number;
  totalChanges: number;
}

/** Diff 两个 AST 的节点签名集合 */
export function diffAST(
  before: unknown,
  after: unknown,
): AstStructuralChanges {
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

  const totalUnique = new Set([...beforeNodes, ...afterNodes]).size;
  const unchanged = beforeNodes.filter((s) => afterSet.has(s)).length;
  const modifiedNodes = Math.max(0, totalUnique - beforeNodes.length - afterNodes.length + unchanged);

  return {
    addedNodes,
    removedNodes,
    modifiedNodes: Math.min(modifiedNodes, addedNodes + removedNodes),
    totalChanges: addedNodes + removedNodes + modifiedNodes,
  };
}

/** 提取 AST 中所有节点的 type（无 path）用于 pattern matching */
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

/** 收集 "type:path" 签名，用于 diff 时区分同名节点 */
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

    const childKeys = [
      'body', 'declarations', 'expression', 'argument',
      'arguments', 'callee', 'consequent', 'alternate', 'init', 'test',
      'update', 'left', 'right', 'properties', 'elements', 'key', 'value',
      'object', 'property', 'params', 'block', 'handler',
      'finalizer', 'declaration', 'specifiers', 'source', 'local',
      'imported', 'exported',
    ];

    for (const key of childKeys) {
      if (obj[key] !== undefined) {
        const childPath = `${path}.${key}`;
        signatures.push(...collectNodeSignatures(obj[key], childPath));
      }
    }
  }

  return signatures;
}
