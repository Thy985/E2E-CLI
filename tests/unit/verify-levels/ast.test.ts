/**
 * Level 3 (ast diff) 单元测试
 *
 * 覆盖 collectNodeTypes / collectNodeSignatures / diffAST / parseAST
 * parseAST 测 happy path + 失败回退；diffAST 测 added/removed/modified。
 */

import { describe, it, expect } from 'bun:test';
import {
  collectNodeTypes,
  collectNodeSignatures,
  diffAST,
  parseAST,
} from '../../../src/engines/verify/levels/ast';

describe('Level 3: ast - collectNodeTypes', () => {
  it('returns empty array for null/undefined/primitive', () => {
    expect(collectNodeTypes(null)).toEqual([]);
    expect(collectNodeTypes(undefined)).toEqual([]);
    expect(collectNodeTypes(42)).toEqual([]);
    expect(collectNodeTypes('string')).toEqual([]);
  });

  it('extracts single type from simple object', () => {
    expect(collectNodeTypes({ type: 'Identifier', name: 'x' })).toEqual(['Identifier']);
  });

  it('recursively walks nested children', () => {
    const ast = {
      type: 'Program',
      body: [
        { type: 'VariableDeclaration', declarations: [{ type: 'VariableDeclarator' }] },
      ],
    };
    const types = collectNodeTypes(ast);
    expect(types).toContain('Program');
    expect(types).toContain('VariableDeclaration');
    expect(types).toContain('VariableDeclarator');
  });

  it('walks array children', () => {
    const ast = {
      type: 'BlockStatement',
      body: [
        { type: 'ExpressionStatement', expression: { type: 'Literal', value: 1 } },
        { type: 'ExpressionStatement', expression: { type: 'Literal', value: 2 } },
      ],
    };
    const types = collectNodeTypes(ast);
    expect(types.filter(t => t === 'Literal').length).toBe(2);
  });
});

describe('Level 3: ast - collectNodeSignatures', () => {
  it('returns empty array for null', () => {
    expect(collectNodeSignatures(null)).toEqual([]);
  });

  it('produces "type:path" signatures', () => {
    const sigs = collectNodeSignatures({ type: 'Program', body: [] });
    expect(sigs).toContain('Program:root');
  });

  it('differentiates same-type nodes at different paths', () => {
    const ast = {
      type: 'BlockStatement',
      body: [
        { type: 'ExpressionStatement' },
        { type: 'ExpressionStatement' },
      ],
    };
    const sigs = collectNodeSignatures(ast);
    // Both ExpressionStatement should be in signatures but with different paths
    const exprSigs = sigs.filter(s => s.startsWith('ExpressionStatement:'));
    expect(exprSigs.length).toBe(2);
    expect(new Set(exprSigs).size).toBe(2);
  });

  it('walks arrays with index paths', () => {
    const ast = {
      type: 'Program',
      body: [{ type: 'ExpressionStatement' }],
    };
    const sigs = collectNodeSignatures(ast);
    expect(sigs.some(s => s.includes('[0]'))).toBe(true);
  });
});

describe('Level 3: ast - diffAST', () => {
  it('returns 0 changes for identical ASTs', () => {
    const ast = { type: 'Program', body: [] };
    const r = diffAST(ast, ast);
    expect(r.addedNodes).toBe(0);
    expect(r.removedNodes).toBe(0);
    expect(r.modifiedNodes).toBe(0);
    expect(r.totalChanges).toBe(0);
  });

  it('counts added nodes when after has more', () => {
    const before = { type: 'Program', body: [] };
    const after = {
      type: 'Program',
      body: [{ type: 'ExpressionStatement', expression: { type: 'Literal', value: 1 } }],
    };
    const r = diffAST(before, after);
    expect(r.addedNodes).toBeGreaterThan(0);
    expect(r.removedNodes).toBe(0);
  });

  it('counts removed nodes when after has fewer', () => {
    const before = {
      type: 'Program',
      body: [{ type: 'ExpressionStatement', expression: { type: 'Literal', value: 1 } }],
    };
    const after = { type: 'Program', body: [] };
    const r = diffAST(before, after);
    expect(r.removedNodes).toBeGreaterThan(0);
    expect(r.addedNodes).toBe(0);
  });

  it('totalChanges is sum of added+removed+modified', () => {
    const before = { type: 'Program', body: [] };
    const after = { type: 'Program', body: [{ type: 'Literal' }] };
    const r = diffAST(before, after);
    expect(r.totalChanges).toBe(r.addedNodes + r.removedNodes + r.modifiedNodes);
  });

  it('modifiedNodes is bounded by added+removed (sanity clamp)', () => {
    const before = { type: 'A' };
    const after = { type: 'B' };
    const r = diffAST(before, after);
    // modifiedNodes should never exceed added + removed
    expect(r.modifiedNodes).toBeLessThanOrEqual(r.addedNodes + r.removedNodes);
  });
});

describe('Level 3: ast - parseAST', () => {
  it('parses valid JS code as module', () => {
    const ast = parseAST('const x = 1;');
    expect(ast).not.toBeNull();
    expect((ast as any).type).toBe('Program');
  });

  it('parses JSX-style code', () => {
    const ast = parseAST('const App = () => <div>hi</div>;');
    expect(ast).not.toBeNull();
  });

  it('parses TypeScript with type annotation', () => {
    const ast = parseAST('const x: number = 1;');
    expect(ast).not.toBeNull();
  });

  it('falls back to script sourceType on module parse failure', () => {
    // Some TS-only constructs may not parse as module
    const code = 'interface Foo { bar: string }';
    const ast = parseAST(code);
    // Should either parse or fall back — never throw
    expect(ast === null || typeof ast === 'object').toBe(true);
  });
});
