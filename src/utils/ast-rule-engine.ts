/**
 * AST 规则引擎基类
 *
 * 提供统一的 AST 分析架构，替代各 Skill 中的正则匹配。
 * 每个规则定义一个 AST 模式匹配函数，返回标准化的检测结果。
 *
 * 使用方式：
 *   1. 继承 ASTRuleEngine
 *   2. 在构造函数中注册规则
 *   3. 调用 analyze() 执行所有规则
 */

import { parseFile, walkAST } from './ast-analyzer';
import type { ASTFile } from './ast-analyzer';
import type { TSESTree } from '@typescript-eslint/typescript-estree';

/** AST 规则检测结果 */
export interface ASTRuleResult {
  /** 规则 ID */
  ruleId: string;
  /** 行号 */
  line: number;
  /** 列号 */
  column: number;
  /** 严重程度 */
  severity: 'critical' | 'warning' | 'info';
  /** 标题 */
  title: string;
  /** 描述 */
  description: string;
  /** 建议修复 */
  suggestion: string;
  /** 代码片段 */
  snippet: string;
  /** 原始 AST 节点（用于后续修复） */
  node?: TSESTree.Node;
  /** 附加元数据 */
  metadata?: Record<string, unknown>;
}

/** AST 规则定义 */
export interface ASTRule {
  /** 规则 ID */
  id: string;
  /** 规则标题 */
  title: string;
  /** 严重程度 */
  severity: 'critical' | 'warning' | 'info';
  /** 描述 */
  description: string;
  /** 建议修复 */
  suggestion: string;
  /** AST 检测函数 */
  check: (astFile: ASTFile) => ASTRuleResult[];
}

/** AST 规则引擎基类 */
export abstract class ASTRuleEngine {
  protected rules: Map<string, ASTRule> = new Map();

  /** 注册一条 AST 规则 */
  protected registerRule(rule: ASTRule): void {
    this.rules.set(rule.id, rule);
  }

  /** 移除一条规则 */
  protected removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /** 执行所有已注册的 AST 规则 */
  analyze(filePath: string, source: string): ASTRuleResult[] {
    const astFile = parseFile(filePath, source);
    if (!astFile) return [];

    const results: ASTRuleResult[] = [];

    for (const rule of this.rules.values()) {
      try {
        const ruleResults = rule.check(astFile);
        results.push(...ruleResults);
      } catch {
        // Rule crashed — skip silently to avoid blocking other rules
      }
    }

    return results;
  }

  /** 获取已注册的规则 ID 列表 */
  getRegisteredRuleIds(): string[] {
    return [...this.rules.keys()];
  }

  // ---------------------------------------------------------------------------
  // Helper methods for common AST patterns
  // ---------------------------------------------------------------------------

  /** 查找所有 ImportDeclaration 节点 */
  protected findImportDeclarations(astFile: ASTFile): TSESTree.ImportDeclaration[] {
    const results: TSESTree.ImportDeclaration[] = [];
    walkAST(astFile.ast, (node) => {
      if (node.type === 'ImportDeclaration') {
        results.push(node as TSESTree.ImportDeclaration);
      }
    });
    return results;
  }

  /** 查找所有 CallExpression 节点 */
  protected findCallExpressions(astFile: ASTFile): TSESTree.CallExpression[] {
    const results: TSESTree.CallExpression[] = [];
    walkAST(astFile.ast, (node) => {
      if (node.type === 'CallExpression') {
        results.push(node as TSESTree.CallExpression);
      }
    });
    return results;
  }

  /** 查找所有 MemberExpression 节点 */
  protected findMemberExpressions(astFile: ASTFile): TSESTree.MemberExpression[] {
    const results: TSESTree.MemberExpression[] = [];
    walkAST(astFile.ast, (node) => {
      if (node.type === 'MemberExpression') {
        results.push(node as TSESTree.MemberExpression);
      }
    });
    return results;
  }

  /** 获取指定行的代码片段 */
  protected getLineSnippet(astFile: ASTFile, line: number): string {
    return astFile.lines[line - 1]?.trim() ?? '';
  }

  /** 创建 ASTRuleResult */
  protected makeResult(
    rule: ASTRule,
    node: TSESTree.Node,
    astFile: ASTFile,
    extra?: { metadata?: Record<string, unknown>; description?: string },
  ): ASTRuleResult {
    const loc = node.loc;
    return {
      ruleId: rule.id,
      line: loc?.start.line ?? 0,
      column: loc?.start.column ?? 0,
      severity: rule.severity,
      title: rule.title,
      description: extra?.description ?? rule.description,
      suggestion: rule.suggestion,
      snippet: this.getLineSnippet(astFile, loc?.start.line ?? 0),
      node,
      metadata: extra?.metadata,
    };
  }
}
