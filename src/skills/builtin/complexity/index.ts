/**
 * Complexity Skill
 * Analyzes code complexity (cyclomatic, cognitive)
 */

import { BaseSkill } from '../../base-skill';
import {
  SkillContext,
  Diagnosis,
  Fix,
  Severity,
  DiagnosisType,
} from '../../../types';
import { generateId } from '../../../utils';

// Complexity thresholds (adjusted for better accuracy)
const THRESHOLDS = {
  cyclomatic: {
    low: 10,
    medium: 15,  // Reduced from 20
    high: 25,    // Reduced from 30
  },
  cognitive: {
    low: 15,
    medium: 20,  // Reduced from 25
    high: 30,    // Reduced from 35
  },
  lines: {
    low: 100,    // Increased from 50
    medium: 200, // Increased from 100
    high: 400,   // Increased from 200
  },
  nesting: {
    low: 3,
    medium: 5,   // Increased from 4
    high: 6,     // Increased from 5
  },
};

// Files to exclude from complexity analysis
const EXCLUDED_PATTERNS = [
  /node_modules/,
  /\.test\./,
  /\.spec\./,
  /__tests__/,
  /__mocks__/,
  /\.d\.ts$/,
  /\.config\./,
  /types\.ts$/,
  /types\/index\.ts$/,
  /\.types\.ts$/,
  /\/types\//,
  /\\types\\/,
  /\/config\//,
  /\\config\\/,
  /config\.ts$/,
  /config\.js$/,
];

// Directories to exclude
const EXCLUDED_DIRS = [
  'node_modules',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  'types',
  'config',
];

// Patterns that increase complexity
const COMPLEXITY_PATTERNS = {
  // Control flow statements
  if: /\bif\s*\(/g,
  else: /\belse\s*(?:if\s*\()?/g,
  for: /\bfor\s*\(/g,
  while: /\bwhile\s*\(/g,
  do: /\bdo\s*\{/g,
  switch: /\bswitch\s*\(/g,
  case: /\bcase\s+/g,
  catch: /\bcatch\s*\(/g,
  ternary: /\?[^:]*:/g,
  logicalAnd: /&&/g,
  logicalOr: /\|\|/g,
  nullishCoalescing: /\?\?/g,
  
  // Cognitive complexity additions
  nestedIf: /if\s*\([^)]*\)\s*\{[^}]*if\s*\(/g,
  nestedLoop: /for\s*\([^)]*\)\s*\{[^}]*for\s*\(/g,
  nestedFunction: /function\s*\([^)]*\)\s*\{[^}]*function\s*\(/g,
};

export interface ComplexityMetrics {
  cyclomatic: number;
  cognitive: number;
  lines: number;
  nesting: number;
  functions: number;
}

export interface FunctionComplexity {
  name: string;
  startLine: number;
  endLine: number;
  metrics: ComplexityMetrics;
}

export class ComplexitySkill extends BaseSkill {
  name = 'complexity';
  version = '1.0.0';
  description = '代码复杂度分析';

  triggers = [
    { type: 'command' as const, pattern: 'complexity' },
    { type: 'keyword' as const, pattern: /复杂度|complexity|cyclomatic|cognitive/i },
  ];

  capabilities = [
    {
      name: 'cyclomatic-analysis',
      description: '圈复杂度分析',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
    {
      name: 'cognitive-analysis',
      description: '认知复杂度分析',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
    {
      name: 'refactor-suggestion',
      description: '重构建议',
      autoFixable: false,
      riskLevel: 'medium' as const,
    },
  ];

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];
    const { project, tools, logger } = context;

    logger.info('开始复杂度分析...');

    // Get source files
    const sourceFiles = await this.getSourceFiles(project.path, tools);
    logger.debug(`找到 ${sourceFiles.length} 个源文件`);

    // Analyze each file
    for (const file of sourceFiles) {
      const content = await tools.fs.readFile(file);
      const fileDiagnoses = this.analyzeFile(file, content);
      diagnoses.push(...fileDiagnoses);
    }

    logger.info(`复杂度分析完成，发现 ${diagnoses.length} 个问题`);
    return diagnoses;
  }

  private async getSourceFiles(
    projectPath: string,
    tools: SkillContext['tools']
  ): Promise<string[]> {
    const patterns = [
      '**/*.{ts,tsx,js,jsx}',
    ];

    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await tools.fs.glob(pattern);
      files.push(...matches.filter(f => {
        // Check excluded patterns
        for (const excluded of EXCLUDED_PATTERNS) {
          if (excluded.test(f)) return false;
        }
        
        // Check excluded directories
        for (const dir of EXCLUDED_DIRS) {
          if (f.includes(`/${dir}/`) || f.includes(`\\${dir}\\`)) return false;
        }
        
        return true;
      }));
    }
    return [...new Set(files)];
  }

  private analyzeFile(file: string, content: string): Diagnosis[] {
    const diagnoses: Diagnosis[] = [];
    const lines = content.split('\n');

    // Calculate file-level metrics (without extracting functions to avoid recursion)
    const fileMetrics = this.calculateFileMetrics(content);

    // Check file-level complexity
    if (fileMetrics.lines > THRESHOLDS.lines.high) {
      diagnoses.push({
        id: generateId(),
        skill: 'complexity',
        type: 'complexity' as DiagnosisType,
        severity: 'warning',
        title: '文件过长',
        description: `文件有 ${fileMetrics.lines} 行，超过 ${THRESHOLDS.lines.high} 行阈值`,
        location: { file },
        fixSuggestion: {
          description: '考虑将文件拆分为多个模块',
          autoApplicable: false,
          riskLevel: 'medium',
        },
        metadata: { metrics: fileMetrics },
      });
    }

    // Analyze individual functions
    const functions = this.extractFunctions(content);
    for (const fn of functions) {
      const fnDiagnoses = this.analyzeFunction(file, fn, lines);
      diagnoses.push(...fnDiagnoses);
    }

    return diagnoses;
  }

  private calculateFileMetrics(content: string): ComplexityMetrics {
    let cyclomatic = 1; // Base complexity
    let nesting = 0;
    let maxNesting = 0;

    const lines = content.split('\n');

    // Calculate cyclomatic complexity
    for (const [key, pattern] of Object.entries(COMPLEXITY_PATTERNS)) {
      // Skip nested patterns for file-level metrics
      if (key.startsWith('nested')) continue;
      
      const matches = content.match(pattern);
      if (matches) {
        cyclomatic += matches.length;
      }
    }

    // Calculate nesting depth
    for (const line of lines) {
      const opens = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;
      nesting += opens - closes;
      maxNesting = Math.max(maxNesting, nesting);
    }

    // Calculate cognitive complexity (simplified)
    const cognitive = this.calculateCognitiveComplexity(content);

    return {
      cyclomatic,
      cognitive,
      lines: lines.length,
      nesting: maxNesting,
      functions: 0, // Will be calculated separately
    };
  }

  private calculateMetrics(content: string): ComplexityMetrics {
    let cyclomatic = 1; // Base complexity
    let nesting = 0;
    let maxNesting = 0;

    const lines = content.split('\n');

    // Calculate cyclomatic complexity
    for (const [key, pattern] of Object.entries(COMPLEXITY_PATTERNS)) {
      // Skip nested patterns
      if (key.startsWith('nested')) continue;
      
      const matches = content.match(pattern);
      if (matches) {
        cyclomatic += matches.length;
      }
    }

    // Calculate nesting depth
    for (const line of lines) {
      const opens = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;
      nesting += opens - closes;
      maxNesting = Math.max(maxNesting, nesting);
    }

    // Calculate cognitive complexity (simplified)
    const cognitive = this.calculateCognitiveComplexity(content);

    return {
      cyclomatic,
      cognitive,
      lines: lines.length,
      nesting: maxNesting,
      functions: 0,
    };
  }

  private calculateCognitiveComplexity(content: string): number {
    let complexity = 0;
    let nestingLevel = 0;
    const lines = content.split('\n');

    for (const line of lines) {
      // Track nesting
      const opens = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;
      
      // Check for control flow statements
      if (/\b(if|for|while|switch)\s*\(/.test(line)) {
        complexity += 1 + nestingLevel;
      }
      
      // Check for else/else if
      if (/\belse\s*(?:if\s*\()?/.test(line)) {
        complexity += 1;
      }
      
      // Check for logical operators
      const andMatches = line.match(/&&/g);
      const orMatches = line.match(/\|\|/g);
      if (andMatches) complexity += andMatches.length;
      if (orMatches) complexity += orMatches.length;
      
      // Check for ternary
      if (/\?[^:]*:/.test(line)) {
        complexity += 1 + nestingLevel;
      }
      
      // Check for catch
      if (/\bcatch\s*\(/.test(line)) {
        complexity += 1;
      }
      
      nestingLevel += opens - closes;
    }

    return complexity;
  }

  private extractFunctions(content: string): FunctionComplexity[] {
    const functions: FunctionComplexity[] = [];
    const seenFunctions = new Set<string>(); // Track already seen functions

    // Match function declarations - use more specific patterns
    const functionPatterns = [
      // Regular function
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g,
      // Arrow function with const
      /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+?)\s*=>/g,
    ];

    for (const pattern of functionPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const fnName = match[1];
        const startLine = content.substring(0, match.index).split('\n').length;
        
        // Skip if we've already seen this function at this line
        const key = `${fnName}:${startLine}`;
        if (seenFunctions.has(key)) continue;
        seenFunctions.add(key);
        
        const endLine = this.findFunctionEnd(content, match.index);
        
        const fnContent = content.substring(
          match.index,
          this.findPosition(content, endLine)
        );
        
        functions.push({
          name: fnName,
          startLine,
          endLine,
          metrics: this.calculateMetrics(fnContent),
        });
      }
    }

    return functions;
  }

  private findFunctionEnd(content: string, startIndex: number): number {
    let braceCount = 0;
    let inFunction = false;
    const lines = content.substring(startIndex).split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          inFunction = true;
        } else if (char === '}') {
          braceCount--;
          if (inFunction && braceCount === 0) {
            return content.substring(0, startIndex).split('\n').length + i + 1;
          }
        }
      }
    }

    return content.split('\n').length;
  }

  private findPosition(content: string, lineNumber: number): number {
    const lines = content.split('\n');
    let position = 0;
    for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
      position += lines[i].length + 1;
    }
    return position;
  }

  private analyzeFunction(
    file: string,
    fn: FunctionComplexity,
    lines: string[]
  ): Diagnosis[] {
    const diagnoses: Diagnosis[] = [];

    // Check cyclomatic complexity
    if (fn.metrics.cyclomatic > THRESHOLDS.cyclomatic.high) {
      diagnoses.push({
        id: generateId(),
        skill: 'complexity',
        type: 'complexity' as DiagnosisType,
        severity: 'warning',
        title: `函数 ${fn.name} 圈复杂度过高`,
        description: `圈复杂度 ${fn.metrics.cyclomatic} 超过阈值 ${THRESHOLDS.cyclomatic.high}`,
        location: {
          file,
          line: fn.startLine,
          endLine: fn.endLine,
        },
        fixSuggestion: {
          description: '考虑拆分函数或简化条件逻辑',
          autoApplicable: false,
          riskLevel: 'medium',
        },
        metadata: { function: fn },
      });
    } else if (fn.metrics.cyclomatic > THRESHOLDS.cyclomatic.medium) {
      diagnoses.push({
        id: generateId(),
        skill: 'complexity',
        type: 'complexity' as DiagnosisType,
        severity: 'info',
        title: `函数 ${fn.name} 圈复杂度较高`,
        description: `圈复杂度 ${fn.metrics.cyclomatic}，建议降低`,
        location: {
          file,
          line: fn.startLine,
        },
        fixSuggestion: {
          description: '考虑拆分函数或简化条件逻辑',
          autoApplicable: false,
          riskLevel: 'low',
        },
        metadata: { function: fn },
      });
    }

    // Check cognitive complexity
    if (fn.metrics.cognitive > THRESHOLDS.cognitive.high) {
      diagnoses.push({
        id: generateId(),
        skill: 'complexity',
        type: 'complexity' as DiagnosisType,
        severity: 'warning',
        title: `函数 ${fn.name} 认知复杂度过高`,
        description: `认知复杂度 ${fn.metrics.cognitive} 超过阈值 ${THRESHOLDS.cognitive.high}`,
        location: {
          file,
          line: fn.startLine,
        },
        fixSuggestion: {
          description: '减少嵌套层级，使用早返回模式',
          autoApplicable: false,
          riskLevel: 'medium',
        },
        metadata: { function: fn },
      });
    }

    // Check nesting depth
    if (fn.metrics.nesting > THRESHOLDS.nesting.high) {
      diagnoses.push({
        id: generateId(),
        skill: 'complexity',
        type: 'complexity' as DiagnosisType,
        severity: 'warning',
        title: `函数 ${fn.name} 嵌套层级过深`,
        description: `嵌套层级 ${fn.metrics.nesting} 超过阈值 ${THRESHOLDS.nesting.high}`,
        location: {
          file,
          line: fn.startLine,
        },
        fixSuggestion: {
          description: '使用早返回模式减少嵌套',
          autoApplicable: false,
          riskLevel: 'medium',
        },
        metadata: { function: fn },
      });
    }

    // Check function length
    const fnLines = fn.endLine - fn.startLine + 1;
    if (fnLines > THRESHOLDS.lines.high) {
      diagnoses.push({
        id: generateId(),
        skill: 'complexity',
        type: 'complexity' as DiagnosisType,
        severity: 'info',
        title: `函数 ${fn.name} 过长`,
        description: `函数有 ${fnLines} 行，建议拆分`,
        location: {
          file,
          line: fn.startLine,
        },
        fixSuggestion: {
          description: '将函数拆分为多个小函数',
          autoApplicable: false,
          riskLevel: 'low',
        },
        metadata: { function: fn },
      });
    }

    return diagnoses;
  }

  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    // Complexity issues generally require manual refactoring
    throw new Error('Complexity issues require manual refactoring');
  }
}

export default new ComplexitySkill();
