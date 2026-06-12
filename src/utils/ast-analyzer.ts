/**
 * AST Analyzer - 抽象语法树分析工具
 */

import { parse } from 'meriyah'

export interface ASTAnalysisResult {
  imports: string[]
  exports: string[]
  functions: string[]
  components: string[]
}

export function analyzeAST(source: string, options?: { language?: string }): ASTAnalysisResult {
  const result: ASTAnalysisResult = {
    imports: [],
    exports: [],
    functions: [],
    components: [],
  }

  try {
    const ast = parse(source, {
      module: true,
      next: true,
      jsx: options?.language === 'tsx' || options?.language === 'jsx',
    })

    // Walk AST to collect information
    walkAST(ast, result)
  } catch {
    // If parsing fails, return empty results
  }

  return result
}

function walkAST(node: any, result: ASTAnalysisResult) {
  if (!node || typeof node !== 'object') return

  // Collect imports
  if (node.type === 'ImportDeclaration' && node.source?.value) {
    result.imports.push(node.source.value)
  }

  // Collect exports
  if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
    result.exports.push('export')
  }

  // Collect functions
  if (node.type === 'FunctionDeclaration' && node.id?.name) {
    result.functions.push(node.id.name)
  }

  // Recurse into children
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'range' || key === 'loc' || key === 'start' || key === 'end') {
      continue
    }
    if (Array.isArray(node[key])) {
      for (const child of node[key]) {
        walkAST(child, result)
      }
    } else if (typeof node[key] === 'object') {
      walkAST(node[key], result)
    }
  }
}
