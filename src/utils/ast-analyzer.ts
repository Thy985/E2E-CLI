/**
 * AST-based diagnostic utilities using @typescript-eslint/parser.
 *
 * Provides real syntactic (and limited semantic) analysis as an
 * improvement over naive regex matching.
 */

import * as TSESLint from '@typescript-eslint/parser';
import * as vueParser from 'vue-eslint-parser';
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

/** Build a parent map: node → parent node. */
export function buildParentMap(
  ast: TSESTree.Program
): WeakMap<TSESTree.Node, TSESTree.Node> {
  const parentMap = new WeakMap<TSESTree.Node, TSESTree.Node>();

  function walk(node: TSESTree.Node, parent: TSESTree.Node | null): void {
    if (parent) parentMap.set(node, parent);
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = (node as unknown as Record<string, unknown>)[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === 'object' && 'type' in item) {
              walk(item as TSESTree.Node, node);
            }
          }
        } else if ('type' in child) {
          walk(child as TSESTree.Node, node);
        }
      }
    }
  }

  walk(ast, null);
  return parentMap;
}

/** Get the parent of a node using the parent map. */
export function getParent(
  node: TSESTree.Node,
  parentMap: WeakMap<TSESTree.Node, TSESTree.Node>
): TSESTree.Node | undefined {
  return parentMap.get(node);
}

/** Find the nearest ancestor of a given type using the parent map. */
export function findAncestorByType(
  node: TSESTree.Node,
  types: Set<string>,
  parentMap: WeakMap<TSESTree.Node, TSESTree.Node>,
  maxDepth = 10
): TSESTree.Node | undefined {
  let current: TSESTree.Node | undefined = node;
  let depth = 0;
  while (current && depth < maxDepth) {
    const parent = parentMap.get(current);
    if (!parent) return undefined;
    if (types.has(parent.type)) return parent;
    current = parent;
    depth++;
  }
  return undefined;
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

// ---------------------------------------------------------------------------
// Vue SFC parsing and detection
// ---------------------------------------------------------------------------

/** Parsed Vue SFC file representation. */
export interface VueASTFile {
  filePath: string;
  /** The full ESLint-style AST from vue-eslint-parser (includes templateBody) */
  ast: ReturnType<typeof vueParser.parseForESLint>['ast'];
  /** The template AST body (VDocumentFragment) */
  templateBody: ReturnType<typeof vueParser.parseForESLint>['ast']['templateBody'];
  /** The script AST (ESLint Program) */
  scriptAST: TSESTree.Program | null;
  source: string;
  lines: string[];
}

/**
 * Parse a .vue SFC file into a VueASTFile using vue-eslint-parser.
 * Returns null if parsing fails or vue-eslint-parser is not available.
 */
export function parseVueFile(source: string, filePath: string): VueASTFile | null {
  try {
    const result = vueParser.parseForESLint(source, {
      ecmaVersion: 2020,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
      parser: '@typescript-eslint/parser',
    });
    return {
      filePath,
      ast: result.ast,
      templateBody: result.ast.templateBody,
      scriptAST: (result.services as any)?.program?.getProgram() ?? null,
      source,
      lines: source.split('\n'),
    };
  } catch {
    return null;
  }
}

/**
 * Walk the Vue template AST and collect all VElement nodes.
 * A VElement has a `type` of 'VElement', a `name` property, `startTag` with `attributes`, and `children`.
 */
export function findVElements(templateBody: any): any[] {
  const elements: any[] = [];

  function walk(node: any): void {
    if (!node) return;
    if (node.type === 'VElement') {
      elements.push(node);
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  if (templateBody && Array.isArray(templateBody.children)) {
    for (const child of templateBody.children) {
      walk(child);
    }
  }

  return elements;
}

/** Check if a VElement has a :key attribute bound. */
function hasKeyBinding(element: any): boolean {
  if (!element.startTag || !element.startTag.attributes) return false;
  return element.startTag.attributes.some((attr: any) => {
    // Non-directive :key attribute
    if (!attr.directive && attr.key && attr.key.name === ':key') return true;
    // v-bind:key
    if (
      attr.directive &&
      attr.key &&
      attr.key.name &&
      attr.key.name.name === 'bind' &&
      attr.key.argument &&
      attr.key.argument.name === 'key'
    ) {
      return true;
    }
    return false;
  });
}

/** Check if a VElement has a v-for directive. */
function hasVForDirective(element: any): boolean {
  if (!element.startTag || !element.startTag.attributes) return false;
  return element.startTag.attributes.some((attr: any) => {
    if (
      attr.directive &&
      attr.key &&
      attr.key.name &&
      attr.key.name.name === 'for'
    ) {
      return true;
    }
    return false;
  });
}

/** Check if a VElement has a v-if directive. */
function hasVIfDirective(element: any): boolean {
  if (!element.startTag || !element.startTag.attributes) return false;
  return element.startTag.attributes.some((attr: any) => {
    if (
      attr.directive &&
      attr.key &&
      attr.key.name &&
      attr.key.name.name === 'if'
    ) {
      return true;
    }
    return false;
  });
}

/** Get the line/column/snippet for a Vue template element. */
function getIssueLocation(
  element: any,
  astFile: VueASTFile
): { line: number; column: number; snippet: string } {
  const loc = element.loc;
  const line = loc?.start?.line ?? 0;
  const column = loc?.start?.column ?? 0;
  const snippet = astFile.lines[line - 1]?.trim() ?? '';
  return { line, column, snippet };
}

/**
 * Detect v-for without :key on the same element.
 * Returns issues for each v-for element missing a :key binding.
 */
export function detectMissingVForKey(astFile: VueASTFile): Array<{
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

  if (!astFile.templateBody) return results;

  const elements = findVElements(astFile.templateBody);
  for (const el of elements) {
    if (hasVForDirective(el) && !hasKeyBinding(el)) {
      const loc = getIssueLocation(el, astFile);
      results.push({
        ruleId: 'missing-v-for-key',
        line: loc.line,
        column: loc.column,
        message: 'v-for 指令缺少 :key 绑定',
        snippet: loc.snippet,
      });
    }
  }

  return results;
}

/**
 * Detect v-if and v-for on the same element (performance anti-pattern).
 * Vue recommends using a computed property or wrapping v-if around a template
 * when used with v-for.
 */
export function detectVIfWithVFor(astFile: VueASTFile): Array<{
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

  if (!astFile.templateBody) return results;

  const elements = findVElements(astFile.templateBody);
  for (const el of elements) {
    if (hasVIfDirective(el) && hasVForDirective(el)) {
      const loc = getIssueLocation(el, astFile);
      results.push({
        ruleId: 'v-if-with-v-for',
        line: loc.line,
        column: loc.column,
        message: '不建议在同一元素上同时使用 v-if 和 v-for，建议使用 computed 属性或 <template> 包裹',
        snippet: loc.snippet,
      });
    }
  }

  return results;
}

/**
 * Detect direct DOM manipulation in Vue component script sections.
 * Patterns: document.querySelector, document.getElementById, document.querySelectorAll,
 * document.createElement, element.innerHTML, element.outerHTML, etc.
 */
export function detectDirectDomAccess(astFile: VueASTFile): Array<{
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

  if (!astFile.scriptAST) return results;

  walkAST(astFile.scriptAST, (node) => {
    // document.querySelector / getElementById / querySelectorAll / createElement / etc.
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.MemberExpression &&
      node.callee.object.type === AST_NODE_TYPES.Identifier &&
      node.callee.object.name === 'document' &&
      node.callee.property.type === AST_NODE_TYPES.Identifier &&
      [
        'querySelector',
        'querySelectorAll',
        'getElementById',
        'getElementsByClassName',
        'getElementsByName',
        'getElementsByTagName',
        'createElement',
        'write',
      ].includes(node.callee.property.name)
    ) {
      const loc = node.loc;
      results.push({
        ruleId: 'direct-dom-access',
        line: loc?.start.line ?? 0,
        column: loc?.start.column ?? 0,
        message: `直接使用 document.${node.callee.property.name}() 违反 Vue 数据驱动理念，建议使用 ref`,
        snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
      });
    }

    // element.innerHTML / outerHTML assignments
    if (
      node.type === AST_NODE_TYPES.AssignmentExpression &&
      node.left.type === AST_NODE_TYPES.MemberExpression &&
      node.left.property.type === AST_NODE_TYPES.Identifier &&
      ['innerHTML', 'outerHTML'].includes(node.left.property.name)
    ) {
      const loc = node.loc;
      results.push({
        ruleId: 'direct-dom-access',
        line: loc?.start.line ?? 0,
        column: loc?.start.column ?? 0,
        message: `直接赋值 ${node.left.property.name} 违反 Vue 数据驱动理念，建议使用 v-html 或响应式数据`,
        snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
      });
    }
  });

  return results;
}

/**
 * Detect <img> elements without alt attribute in Vue templates.
 */
export function detectImgWithoutAltVue(astFile: VueASTFile): Array<{
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

  if (!astFile.templateBody) return results;

  const elements = findVElements(astFile.templateBody);
  for (const el of elements) {
    if (el.name === 'img') {
      const hasAlt = (el.startTag?.attributes ?? []).some((attr: any) => {
        if (!attr.directive && attr.key && attr.key.name === 'alt') return true;
        if (
          attr.directive &&
          attr.key &&
          attr.key.name &&
          attr.key.name.name === 'bind' &&
          attr.key.argument &&
          attr.key.argument.name === 'alt'
        ) {
          return true;
        }
        return false;
      });
      if (!hasAlt) {
        const loc = getIssueLocation(el, astFile);
        results.push({
          ruleId: 'img-without-alt-vue',
          line: loc.line,
          column: loc.column,
          message: 'img 元素缺少 alt 属性，影响无障碍访问',
          snippet: loc.snippet,
        });
      }
    }
  }

  return results;
}

/**
 * Detect <a> elements without accessible name (text content or aria-label) in Vue templates.
 */
export function detectAnchorWithoutNameVue(astFile: VueASTFile): Array<{
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

  if (!astFile.templateBody) return results;

  const elements = findVElements(astFile.templateBody);
  for (const el of elements) {
    if (el.name === 'a') {
      const attrs = el.startTag?.attributes ?? [];

      // Check for aria-label or aria-labelledby
      const hasAriaLabel = attrs.some((attr: any) => {
        if (!attr.directive && attr.key && ['aria-label', 'aria-labelledby'].includes(attr.key.name)) return true;
        if (
          attr.directive &&
          attr.key &&
          attr.key.name &&
          attr.key.name.name === 'bind' &&
          attr.key.argument &&
          ['aria-label', 'aria-labelledby'].includes(attr.key.argument.name)
        ) {
          return true;
        }
        return false;
      });

      if (hasAriaLabel) continue;

      // Check for text content in children
      let hasTextContent = false;
      function checkTextChildren(node: any): void {
        if (!node || !node.children) return;
        for (const child of node.children) {
          if (child.type === 'VText' && child.value.trim()) {
            hasTextContent = true;
            return;
          }
          if (child.type === 'VExpressionContainer') {
            hasTextContent = true;
            return;
          }
          checkTextChildren(child);
          if (hasTextContent) return;
        }
      }
      checkTextChildren(el);

      if (!hasTextContent) {
        const loc = getIssueLocation(el, astFile);
        results.push({
          ruleId: 'anchor-without-name-vue',
          line: loc.line,
          column: loc.column,
          message: '链接缺少可访问名称（文本内容或 aria-label）',
          snippet: loc.snippet,
        });
      }
    }
  }

  return results;
}

/**
 * Detect v-html directive usage (XSS risk) in Vue templates.
 * v-html renders raw HTML and can execute scripts.
 */
export function detectVHtmlUsage(astFile: VueASTFile): Array<{
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

  if (!astFile.templateBody) return results;

  const elements = findVElements(astFile.templateBody);
  for (const el of elements) {
    const attrs = el.startTag?.attributes ?? [];
    for (const attr of attrs) {
      if (
        attr.directive &&
        attr.key &&
        attr.key.name &&
        attr.key.name.name === 'html'
      ) {
        const loc = getIssueLocation(el, astFile);
        results.push({
          ruleId: 'v-html-usage',
          line: loc.line,
          column: loc.column,
          message: 'v-html 指令存在 XSS 风险，请确保渲染内容可信',
          snippet: loc.snippet,
        });
        break;
      }
    }
  }

  return results;
}

/**
 * Detect props defined via defineProps() that are not used in the template or script.
 * Supports both array syntax: defineProps(['prop1', 'prop2'])
 * and object syntax: defineProps({ prop1: String, prop2: Number })
 */
export function detectUnusedPropsVue(astFile: VueASTFile): Array<{
  ruleId: string;
  line: number;
  column: number;
  message: string;
  snippet: string;
  propName: string;
}> {
  const results: Array<{
    ruleId: string;
    line: number;
    column: number;
    message: string;
    snippet: string;
    propName: string;
  }> = [];

  if (!astFile.scriptAST) return results;

  // 1. Collect props from defineProps
  const definedProps: Array<{ name: string; line: number; column: number }> = [];

  walkAST(astFile.scriptAST, (node) => {
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.Identifier &&
      node.callee.name === 'defineProps' &&
      node.arguments.length > 0
    ) {
      const arg = node.arguments[0];
      const loc = node.loc;

      // Array syntax: defineProps(['prop1', 'prop2'])
      if (arg.type === AST_NODE_TYPES.ArrayExpression) {
        for (const elem of arg.elements) {
          if (
            elem &&
            elem.type === AST_NODE_TYPES.Literal &&
            typeof elem.value === 'string'
          ) {
            definedProps.push({
              name: elem.value,
              line: loc?.start.line ?? 0,
              column: loc?.start.column ?? 0,
            });
          }
        }
      }

      // Object syntax: defineProps({ prop1: String, prop2: Number })
      if (arg.type === AST_NODE_TYPES.ObjectExpression) {
        for (const prop of arg.properties) {
          if (
            prop.type === AST_NODE_TYPES.Property &&
            prop.key.type === AST_NODE_TYPES.Identifier
          ) {
            definedProps.push({
              name: prop.key.name,
              line: loc?.start.line ?? 0,
              column: loc?.start.column ?? 0,
            });
          }
        }
      }
    }
  });

  if (definedProps.length === 0) return results;

  // 2. Build a set of all identifiers used in the script (excluding prop declarations)
  const usedInScript = new Set<string>();
  walkAST(astFile.scriptAST, (node) => {
    if (node.type === AST_NODE_TYPES.Identifier) {
      usedInScript.add(node.name);
    }
  });

  // 3. Build a set of all identifiers used in the template
  const usedInTemplate = new Set<string>();
  if (astFile.templateBody) {
    function walkTemplate(node: any): void {
      if (!node) return;
      // Walk expression children (simple recursive check for Identifier nodes)
      function walkExpr(e: any): void {
        if (!e || typeof e !== 'object') return;
        if (e.type === 'Identifier' && e.name) {
          usedInTemplate.add(e.name);
        }
        for (const k of Object.keys(e)) {
          if (Array.isArray(e[k])) {
            for (const item of e[k]) walkExpr(item);
          } else if (typeof e[k] === 'object') {
            walkExpr(e[k]);
          }
        }
      }
      if (node.type === 'VExpressionContainer' && node.expression) {
        // Collect identifiers in template expressions
        const expr = node.expression;
        if (expr.type === 'Identifier' && expr.name) {
          usedInTemplate.add(expr.name);
        }
        walkExpr(expr);
      }
      // Walk element attributes for directive expressions
      if (node.startTag && node.startTag.attributes) {
        for (const attr of node.startTag.attributes) {
          if (attr.directive && attr.value) {
            walkExpr(attr.value);
          }
        }
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          walkTemplate(child);
        }
      }
    }
    walkTemplate(astFile.templateBody);
  }

  // 4. Check each defined prop
  for (const prop of definedProps) {
    const usedScript = usedInScript.has(prop.name);
    const usedTemplate = usedInTemplate.has(prop.name);

    // Also check if prop appears in template as part of v-bind or interpolation
    const templateSource = astFile.source;
    const propInTemplateRegex = new RegExp(`\\b${prop.name}\\b`);
    const appearsInTemplateSection =
      astFile.templateBody && propInTemplateRegex.test(templateSource);

    if (!usedScript && !usedTemplate && !appearsInTemplateSection) {
      results.push({
        ruleId: 'unused-prop-vue',
        line: prop.line,
        column: prop.column,
        message: `Prop "${prop.name}" 在组件中未被使用`,
        snippet: astFile.lines[prop.line - 1]?.trim() ?? '',
        propName: prop.name,
      });
    }
  }

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

// ---------------------------------------------------------------------------
// React-oriented AST checks
// ---------------------------------------------------------------------------

/**
 * Detect missing `key` prop in JSX lists (array.map returning JSX).
 */
export function detectMissingKeyProp(astFile: ASTFile): Array<{
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
    // CallExpression with arrow function returning JSX (e.g., items.map(item => <div>))
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.MemberExpression &&
      node.callee.property.type === AST_NODE_TYPES.Identifier &&
      node.callee.property.name === 'map'
    ) {
      // Check if the callback returns JSX
      const callback = node.arguments[0];
      if (
        callback &&
        callback.type === AST_NODE_TYPES.ArrowFunctionExpression &&
        callback.body.type === AST_NODE_TYPES.JSXElement &&
        !callback.body.openingElement.attributes.some(
          (attr) =>
            attr.type === AST_NODE_TYPES.JSXAttribute &&
            attr.name.type === AST_NODE_TYPES.JSXIdentifier &&
            attr.name.name === 'key'
        )
      ) {
        const loc = node.loc;
        results.push({
          ruleId: 'missing-key-prop',
          line: loc?.start.line ?? 0,
          column: loc?.start.column ?? 0,
          message: '列表渲染缺少 key prop',
          snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
        });
      }
    }
  });

  return results;
}

/**
 * Detect Hooks called inside conditions/loops/callbacks (violating Rules of Hooks).
 */
export function detectHookMisuse(astFile: ASTFile): Array<{
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

  const hookNames = new Set([
    'useState', 'useEffect', 'useMemo', 'useCallback',
    'useRef', 'useContext', 'useReducer', 'useLayoutEffect',
  ]);

  const disallowedParentTypes = new Set([
    AST_NODE_TYPES.IfStatement,
    AST_NODE_TYPES.ForStatement,
    AST_NODE_TYPES.WhileStatement,
    AST_NODE_TYPES.DoWhileStatement,
  ]);

  const parentMap = buildParentMap(astFile.ast);

  walkAST(astFile.ast, (node) => {
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.Identifier &&
      hookNames.has(node.callee.name)
    ) {
      // Check if inside disallowed block
      const ancestor = findAncestorByType(node, disallowedParentTypes, parentMap);
      if (ancestor) {
        const loc = node.loc;
        results.push({
          ruleId: 'hook-misuse',
          line: loc?.start.line ?? 0,
          column: loc?.start.column ?? 0,
          message: `Hook ${node.callee.name} 不应在条件/循环中调用`,
          snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
        });
      }
    }
  });

  return results;
}

/**
 * Detect unused props — destructured props that are never used in the component body.
 */
export function detectUnusedProps(astFile: ASTFile): Array<{
  ruleId: string;
  line: number;
  column: number;
  message: string;
  snippet: string;
  propName: string;
}> {
  const results: Array<{
    ruleId: string;
    line: number;
    column: number;
    message: string;
    snippet: string;
    propName: string;
  }> = [];

  walkAST(astFile.ast, (node) => {
    // Arrow function component: const Component = ({ prop1, prop2 }) => { ... }
    if (
      node.type === AST_NODE_TYPES.VariableDeclarator &&
      node.init &&
      node.init.type === AST_NODE_TYPES.ArrowFunctionExpression &&
      node.init.params.length > 0
    ) {
      const param = node.init.params[0];
      const props: string[] = [];

      if (param.type === AST_NODE_TYPES.ObjectPattern) {
        for (const prop of param.properties) {
          if (
            prop.type === AST_NODE_TYPES.Property &&
            prop.key.type === AST_NODE_TYPES.Identifier
          ) {
            props.push(prop.key.name);
          }
          if (
            prop.type === AST_NODE_TYPES.RestElement &&
            prop.argument.type === AST_NODE_TYPES.Identifier
          ) {
            // rest pattern — skip, can't determine individual props
            return;
          }
        }
      }

      // Check if each prop is used in the function body
      const bodySource = astFile.source.slice(
        node.init.body.type === AST_NODE_TYPES.BlockStatement
          ? node.init.body.range![0]
          : node.init.range![0],
        node.init.range![1]
      );

      for (const propName of props) {
        // Simple usage check: does the prop name appear in the body (not just as the destructuring)?
        // Count occurrences excluding the parameter declaration
        const usageRegex = new RegExp(`\\b${propName}\\b`, 'g');
        const matches = bodySource.match(usageRegex);
        if (!matches || matches.length <= 1) {
          const loc = node.loc;
          results.push({
            ruleId: 'unused-prop',
            line: loc?.start.line ?? 0,
            column: loc?.start.column ?? 0,
            message: `Prop "${propName}" 在组件中未被使用`,
            snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
            propName,
          });
        }
      }
    }
  });

  return results;
}

/**
 * Detect dangerouslySetInnerHTML in JSX (React-specific XSS risk).
 * Already covered by detectXSSRisk but this provides a React-focused result.
 */
export function detectDangerousSetInnerHTML(astFile: ASTFile): Array<{
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
    if (
      node.type === AST_NODE_TYPES.JSXAttribute &&
      node.name.type === AST_NODE_TYPES.JSXIdentifier &&
      node.name.name === 'dangerouslySetInnerHTML'
    ) {
      const loc = node.loc;
      results.push({
        ruleId: 'dangerous-set-inner-html',
        line: loc?.start.line ?? 0,
        column: loc?.start.column ?? 0,
        message: '使用 dangerouslySetInnerHTML 存在 XSS 风险',
        snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
      });
    }
  });

  return results;
}

/**
 * Detect direct `img` elements without `alt` prop in JSX.
 */
export function detectImgWithoutAlt(astFile: ASTFile): Array<{
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
    if (
      node.type === AST_NODE_TYPES.JSXOpeningElement &&
      node.name.type === AST_NODE_TYPES.JSXIdentifier &&
      node.name.name === 'img'
    ) {
      const hasAlt = node.attributes.some(
        (attr) =>
          attr.type === AST_NODE_TYPES.JSXAttribute &&
          attr.name.type === AST_NODE_TYPES.JSXIdentifier &&
          attr.name.name === 'alt'
      );
      if (!hasAlt) {
        const loc = node.loc;
        results.push({
          ruleId: 'img-without-alt',
          line: loc?.start.line ?? 0,
          column: loc?.start.column ?? 0,
          message: 'img 元素缺少 alt 属性',
          snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
        });
      }
    }
  });

  return results;
}

/**
 * Detect direct anchor elements without accessible name in JSX.
 */
export function detectAnchorWithoutName(astFile: ASTFile): Array<{
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

  const parentMap = buildParentMap(astFile.ast);

  walkAST(astFile.ast, (node) => {
    if (
      node.type === AST_NODE_TYPES.JSXOpeningElement &&
      node.name.type === AST_NODE_TYPES.JSXIdentifier &&
      node.name.name === 'a'
    ) {
      const hasAccessibleName = node.attributes.some(
        (attr) =>
          attr.type === AST_NODE_TYPES.JSXAttribute &&
          attr.name.type === AST_NODE_TYPES.JSXIdentifier &&
          ['aria-label', 'aria-labelledby'].includes(attr.name.name)
      );

      if (!hasAccessibleName) {
        const parentEl = parentMap.get(node);
        let hasTextContent = false;
        if (parentEl && parentEl.type === AST_NODE_TYPES.JSXElement) {
          const jsxEl = parentEl as TSESTree.JSXElement;
          for (const child of jsxEl.children) {
            if (child.type === AST_NODE_TYPES.JSXText && child.value.trim()) {
              hasTextContent = true;
              break;
            }
            if (child.type === AST_NODE_TYPES.JSXExpressionContainer) {
              hasTextContent = true;
              break;
            }
          }
        }

        if (!hasTextContent) {
          const loc = node.loc;
          results.push({
            ruleId: 'anchor-without-name',
            line: loc?.start.line ?? 0,
            column: loc?.start.column ?? 0,
            message: '链接缺少可访问名称',
            snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
          });
        }
      }
    }
  });

  return results;
}

/**
 * Detect React component anti-patterns:
 * - Direct DOM manipulation (document.querySelector, etc.) in useEffect
 * - Using index as key in list rendering
 * - Inline function in JSX that creates new function each render
 */
export function detectReactAntiPatterns(astFile: ASTFile): Array<{
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
    // Using index as key: key={index}
    if (
      node.type === AST_NODE_TYPES.JSXAttribute &&
      node.name.type === AST_NODE_TYPES.JSXIdentifier &&
      node.name.name === 'key' &&
      node.value &&
      node.value.type === AST_NODE_TYPES.JSXExpressionContainer &&
      node.value.expression.type === AST_NODE_TYPES.Identifier &&
      node.value.expression.name === 'index'
    ) {
      // Check if we're inside a .map() callback (common pattern)
      const loc = node.loc;
      results.push({
        ruleId: 'index-as-key',
        line: loc?.start.line ?? 0,
        column: loc?.start.column ?? 0,
        message: '使用数组索引作为 key 可能导致渲染问题',
        snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
      });
    }
  });

  return results;
}
