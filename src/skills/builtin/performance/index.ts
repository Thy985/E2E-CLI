/**
 * Performance Skill
 * Checks performance issues and optimization opportunities
 *
 * Uses AST-based analysis for import detection and console statements,
 * falls back to regex for HTML-specific patterns.
 */

import { BaseSkill } from '../../base-skill';
import {
  SkillContext,
  Diagnosis,
  Fix,
  Severity,
  DiagnosisType,
  FileChange,
} from '../../../types';
import { generateId } from '../../../utils';
import {
  parseFile,
  walkAST,
  detectConsoleStatements,
} from '../../../utils/ast-analyzer';
import type { TSESTree } from '@typescript-eslint/typescript-estree';

// Performance rules that use AST analysis
const AST_PERF_RULES = {
  'unused-import': {
    id: 'unused-import',
    severity: 'warning' as Severity,
    title: 'Unused/Heavy Import',
    description: 'Importing entire library increases bundle size',
    suggestion: 'Use specific imports or tree-shakeable alternatives',
  },
};

// Performance rules that use regex (HTML-specific patterns)
const REGEX_PERF_RULES = [
  {
    id: 'render-blocking-resource',
    pattern: /<script\s+src=['"][^'"]+['"]\s*>\s*<\/script>/g,
    severity: 'warning' as Severity,
    title: 'Render-Blocking Resource',
    description: 'Synchronous scripts block page rendering',
    suggestion: 'Add async or defer attributes',
    fixable: true,
  },
  {
    id: 'img-dimensions',
    pattern: /<img(?![^>]*\bwidth=)(?![^>]*\bheight=)[^>]*>/gi,
    severity: 'info' as Severity,
    title: 'Missing Image Dimensions',
    description: 'Images without width/height attributes cause layout shifts',
    suggestion: 'Add explicit width and height attributes',
    fixable: false,
  },
  {
    id: 'inline-style',
    pattern: /style=\s*['"][^'"]{100,}['"]/g,
    severity: 'info' as Severity,
    title: 'Long Inline Styles',
    description: 'Long inline styles affect caching and maintainability',
    suggestion: 'Move styles to CSS files',
    fixable: false,
  },
  {
    id: 'sync-xhr',
    pattern: /new\s+XMLHttpRequest\s*\(\s*\)/g,
    severity: 'warning' as Severity,
    title: 'Synchronous XMLHttpRequest',
    description: 'Synchronous XHR blocks the main thread',
    suggestion: 'Use async XHR or fetch API',
    fixable: false,
  },
  {
    id: 'viewport',
    check: (content: string) => {
      const isHtml = /<!doctype\s+html/i.test(content) || /<html/i.test(content);
      if (!isHtml) return false;
      return !/<meta\s[^>]*name\s*=\s*["']viewport["']/i.test(content);
    },
    severity: 'warning' as Severity,
    title: 'Missing Viewport Meta',
    description: 'Viewport meta tag is essential for mobile responsiveness',
    suggestion: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">',
    fixable: false,
  },
  {
    id: 'dom-manipulation-perf',
    pattern: /\.(appendChild|insertBefore|replaceChild)\s*\(/g,
    severity: 'info' as Severity,
    title: 'Direct DOM Manipulation',
    description: 'Frequent direct DOM manipulation impacts performance',
    suggestion: 'Use virtual DOM or batch DOM updates',
    fixable: false,
  },
  {
    id: 'preconnect',
    pattern: /href=['"]https:\/\/[^'"]+['"]/g,
    severity: 'info' as Severity,
    title: 'Missing Preconnect',
    description: 'External resources without preconnect hint',
    suggestion: 'Add <link rel="preconnect"> for external origins',
    fixable: false,
  },
  {
    id: 'preload-critical',
    pattern: /<link\s+rel=['"]stylesheet['"][^>]*>/g,
    severity: 'info' as Severity,
    title: 'Missing Preload for Critical Resources',
    description: 'Critical CSS/JS resources without preload hint',
    suggestion: 'Add <link rel="preload"> for critical resources',
    fixable: false,
  },
  {
    id: 'large-component',
    check: (content: string) => content.split('\n').length > 300,
    severity: 'info' as Severity,
    title: 'Large Component File',
    description: 'Large components are hard to maintain and may impact performance',
    suggestion: 'Consider splitting into smaller components',
    fixable: false,
  },
];

// Heavy dependencies that should be replaced
const HEAVY_DEPENDENCIES: Record<string, { alternative: string; reason: string }> = {
  lodash: { alternative: 'lodash-es', reason: 'Tree-shakeable ES modules' },
  moment: { alternative: 'dayjs', reason: 'Smaller bundle size' },
  'date-fns': { alternative: 'dayjs', reason: 'Smaller bundle size for simple use cases' },
  jquery: { alternative: 'native DOM APIs', reason: 'Native APIs are sufficient in modern browsers' },
  axios: { alternative: 'fetch', reason: 'Native fetch API is widely supported' },
};

export class PerformanceSkill extends BaseSkill {
  name = 'performance';
  version = '1.0.0';
  description = 'Performance diagnosis and optimization';

  triggers = [
    { type: 'command' as const, pattern: 'performance' },
    { type: 'keyword' as const, pattern: /performance|optimize|bundle|speed/i },
  ];

  capabilities = [
    {
      name: 'bundle-analysis',
      description: 'Analyze bundle size and dependencies',
      autoFixable: true,
      riskLevel: 'low' as const,
    },
    {
      name: 'code-optimization',
      description: 'Suggest code-level optimizations',
      autoFixable: true,
      riskLevel: 'low' as const,
    },
    {
      name: 'image-optimization',
      description: 'Check image optimization opportunities',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
  ];

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];
    const { project, tools, logger } = context;

    logger.info('Starting performance check...');

    // Check source files
    const sourceFiles = await this.getSourceFiles(project.path, tools);
    logger.debug(`Found ${sourceFiles.length} source files`);

    for (const file of sourceFiles) {
      const content = await tools.fs.readFile(file);
      const fileDiagnoses = await this.checkFile(file, content);
      diagnoses.push(...fileDiagnoses);
    }

    // Check for large files
    const largeFileIssues = await this.checkLargeFiles(project.path, tools);
    diagnoses.push(...largeFileIssues);

    // Check package.json for optimization opportunities
    const packageIssues = await this.checkPackageJson(project.path, tools);
    diagnoses.push(...packageIssues);

    logger.info(`Performance check completed, found ${diagnoses.length} issues`);
    return diagnoses;
  }

  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    const ruleId = diagnosis.metadata?.ruleId;
    const filePath = diagnosis.location.file;
    const content = await context.tools.fs.readFile(filePath);

    let changes: FileChange[] = [];

    switch (ruleId) {
      case 'unused-import':
        changes = this.fixUnusedImport(content, diagnosis);
        break;
      case 'render-blocking-resource':
        changes = this.fixRenderBlocking(content, diagnosis);
        break;
      case 'console-log':
        changes = this.fixConsoleLog(content, diagnosis);
        break;
      case 'duplicate-deps':
        changes = this.fixDuplicateDeps(content, diagnosis);
        break;
      default:
        throw new Error(`Cannot auto-fix rule: ${ruleId}`);
    }

    return {
      id: `Fix-${generateId()}`,
      diagnosisId: diagnosis.id,
      description: `Fix ${diagnosis.title}`,
      changes,
      riskLevel: 'low',
      autoApplicable: true,
    };
  }

  private fixUnusedImport(content: string, diagnosis: Diagnosis): FileChange[] {
    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    // Match import statement (supports lodash, moment, date-fns, jquery, axios)
    const importMatch = targetLine.match(/import\s+(\w+)\s+from\s+['"](\w[\w-]*)['"]/);
    if (!importMatch) {
      throw new Error('Could not find import to fix');
    }

    const varName = importMatch[1];
    const depName = importMatch[2];
    const alt = HEAVY_DEPENDENCIES[depName]?.alternative;

    // Find all usages of the imported variable to determine which methods are actually used
    const usedMethods = new Set<string>();
    const usageRegex = new RegExp(`\\b${varName}\\.(\\w+)\\b`, 'g');
    for (const match of content.matchAll(usageRegex)) {
      usedMethods.add(match[1]);
    }

    let replacement: string;
    if (usedMethods.size === 0) {
      replacement = `// TODO: Replace 'import ${varName} from "${depName}"' with specific imports` +
        (alt ? `\n// e.g. import { ${varName} } from '${alt}'; or import individual functions` : '');
    } else {
      const methodList = Array.from(usedMethods).sort().join(', ');
      replacement = alt
        ? `import { ${methodList} } from '${alt}';`
        : `import { ${methodList} } from '${depName}';`;
    }

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: replacement,
      oldContent: targetLine,
    }];
  }

  private fixRenderBlocking(content: string, diagnosis: Diagnosis): FileChange[] {
    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    const fixedLine = targetLine.replace(
      /<script\s+src=/,
      '<script defer src='
    );

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: fixedLine,
      oldContent: targetLine,
    }];
  }

  /**
   * Remove console statements — comment out instead of wrapping in runtime check
   */
  private fixConsoleLog(content: string, diagnosis: Diagnosis): FileChange[] {
    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];
    const indentation = targetLine.match(/^(\s*)/)?.[1] || '';
    const consoleMethod = diagnosis.metadata?.method ?? 'log';

    const fixedLine = `${indentation}// TODO: Remove console.${consoleMethod} in production\n${indentation}// ${targetLine.trim()}`;

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: fixedLine,
      oldContent: targetLine,
    }];
  }

  private fixDuplicateDeps(content: string, diagnosis: Diagnosis): FileChange[] {
    const duplicates = diagnosis.metadata?.duplicates as string[] || [];

    const pkg = JSON.parse(content);

    if (pkg.devDependencies) {
      for (const dep of duplicates) {
        delete pkg.devDependencies[dep];
      }
    }

    const fixedContent = JSON.stringify(pkg, null, 2);

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      position: { line: 1, column: 1 },
      content: fixedContent,
      oldContent: content,
    }];
  }

  private async getSourceFiles(_projectPath: string, tools: SkillContext['tools']): Promise<string[]> {
    const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
    const files: string[] = [];

    for (const pattern of patterns) {
      const matches = await tools.fs.glob(pattern);
      files.push(...matches.filter(f =>
        !f.includes('node_modules') &&
        !f.includes('.d.ts') &&
        !f.includes('.test.') &&
        !f.includes('.spec.') &&
        !f.includes('__tests__') &&
        !f.includes('__mocks__')
      ));
    }

    return [...new Set(files)];
  }

  private async checkFile(filePath: string, content: string): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];

    // ---- AST-based analysis ----
    // 1. Large bundle import detection (AST: check ImportDeclaration nodes)
    const largeBundleIssues = this.checkLargeBundleAST(filePath, content);
    diagnoses.push(...largeBundleIssues);

    // 2. Console statement detection (AST)
    const consoleIssues = this.checkConsoleStatementsAST(filePath, content);
    diagnoses.push(...consoleIssues);

    // ---- Regex-based analysis (HTML-specific patterns) ----
    for (const rule of REGEX_PERF_RULES) {
      if (rule.pattern) {
        const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const line = this.getLineNumber(content, match.index);
          diagnoses.push({
            id: `Perf-${generateId()}`,
            skill: this.name,
            type: 'performance' as DiagnosisType,
            severity: rule.severity,
            title: rule.title,
            description: rule.description,
            location: { file: filePath, line },
            metadata: { ruleId: rule.id, match: match[0] },
            fixSuggestion: {
              description: rule.suggestion,
              autoApplicable: rule.fixable,
              riskLevel: 'low',
            },
          });
        }
      }

      if (rule.check && rule.check(content)) {
        diagnoses.push({
          id: `Perf-${generateId()}`,
          skill: this.name,
          type: 'performance' as DiagnosisType,
          severity: rule.severity,
          title: rule.title,
          description: rule.description,
          location: { file: filePath },
          metadata: { ruleId: rule.id },
          fixSuggestion: {
            description: rule.suggestion,
            autoApplicable: rule.fixable,
            riskLevel: 'low',
          },
        });
      }
    }

    return diagnoses;
  }

  /**
   * AST-based large bundle detection: finds full lodash/moment/etc imports
   */
  private checkLargeBundleAST(filePath: string, content: string): Diagnosis[] {
    const astFile = parseFile(filePath, content);
    if (!astFile) return [];

    const diagnoses: Diagnosis[] = [];
    const heavyDeps = new Set(Object.keys(HEAVY_DEPENDENCIES));

    walkAST(astFile.ast, (node) => {
      if (node.type === 'ImportDeclaration') {
        const importNode = node as TSESTree.ImportDeclaration;
        const source = importNode.source.value;

        // Check if importing a heavy dependency as a whole (not a subpath)
        if (heavyDeps.has(source)) {
          // Check if it's a default import (full import) vs named import
          const hasDefaultImport = importNode.specifiers.some(
            (spec) => spec.type === 'ImportDefaultSpecifier',
          );

          if (hasDefaultImport) {
            const loc = importNode.loc;
            const line = loc?.start.line ?? 0;
            const rule = AST_PERF_RULES['unused-import'];

            diagnoses.push({
              id: `Perf-${generateId()}`,
              skill: this.name,
              type: 'performance' as DiagnosisType,
              severity: rule.severity,
              title: rule.title,
              description: rule.description,
              location: { file: filePath, line },
              metadata: {
                ruleId: rule.id,
                dependency: source,
                alternative: HEAVY_DEPENDENCIES[source]?.alternative,
                snippet: astFile.lines[line - 1]?.trim() ?? '',
              },
              fixSuggestion: {
                description: rule.suggestion,
                autoApplicable: true,
                riskLevel: 'low',
              },
            });
          }
        }
      }
    });

    return diagnoses;
  }

  /**
   * AST-based console statement detection
   */
  private checkConsoleStatementsAST(filePath: string, content: string): Diagnosis[] {
    const results = detectConsoleStatements({
      filePath,
      ast: parseFile(filePath, content)?.ast!,
      source: content,
      lines: content.split('\n'),
    });

    if (!results.length) return [];
    const astFile = parseFile(filePath, content);
    if (!astFile) return [];

    return results.map((r) => ({
      id: `Perf-${generateId()}`,
      skill: this.name,
      type: 'performance' as DiagnosisType,
      severity: 'info' as Severity,
      title: 'Console Statements in Production',
      description: 'Console statements should be removed in production',
      location: { file: filePath, line: r.line },
      metadata: {
        ruleId: 'console-log',
        method: r.method,
        snippet: r.snippet,
      },
      fixSuggestion: {
        description: 'Use environment variables to control log output',
        autoApplicable: true,
        riskLevel: 'low',
      },
    }));
  }

  private async checkLargeFiles(_projectPath: string, tools: SkillContext['tools']): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];
    const files = await tools.fs.glob('**/*.{js,ts,jsx,tsx}');

    for (const file of files) {
      if (file.includes('node_modules')) continue;

      const stats = await tools.fs.stat(file);
      const sizeInKB = stats.size / 1024;

      if (sizeInKB > 100) {
        diagnoses.push({
          id: `Perf-${generateId()}`,
          skill: this.name,
          type: 'performance' as DiagnosisType,
          severity: 'info',
          title: 'Large File',
          description: `File size is ${sizeInKB.toFixed(1)}KB, consider splitting`,
          location: { file },
          metadata: { size: sizeInKB },
          fixSuggestion: {
            description: 'Split into smaller modules',
            autoApplicable: false,
            riskLevel: 'medium',
          },
        });
      }
    }

    return diagnoses;
  }

  private async checkPackageJson(_projectPath: string, tools: SkillContext['tools']): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];

    try {
      const pkgContent = await tools.fs.readFile('package.json');
      const pkg = JSON.parse(pkgContent);

      // Check for heavy dependencies
      for (const dep of Object.keys(pkg.dependencies || {})) {
        if (HEAVY_DEPENDENCIES[dep]) {
          const info = HEAVY_DEPENDENCIES[dep];
          const allDeps = new Set([
            ...Object.keys(pkg.dependencies || {}),
            ...Object.keys(pkg.devDependencies || {}),
          ]);
          if (allDeps.has(info.alternative)) {
            continue;
          }
          diagnoses.push({
            id: `Perf-${generateId()}`,
            skill: this.name,
            type: 'performance' as DiagnosisType,
            severity: 'warning',
            title: 'Heavy Dependency',
            description: `${dep} is a heavy dependency`,
            location: { file: 'package.json' },
            metadata: { dependency: dep, alternative: info.alternative },
            fixSuggestion: {
              description: `Consider using ${info.alternative} (${info.reason})`,
              autoApplicable: false,
              riskLevel: 'medium',
            },
          });
        }
      }

      // Check for duplicate dependencies
      const depNames = Object.keys(pkg.dependencies || {});
      const devDepNames = Object.keys(pkg.devDependencies || {});
      const duplicates = depNames.filter(name => devDepNames.includes(name));

      if (duplicates.length > 0) {
        diagnoses.push({
          id: `Perf-${generateId()}`,
          skill: this.name,
          type: 'performance' as DiagnosisType,
          severity: 'info',
          title: 'Duplicate Dependencies',
          description: `Dependencies exist in both dependencies and devDependencies: ${duplicates.join(', ')}`,
          location: { file: 'package.json' },
          metadata: { duplicates },
          fixSuggestion: {
            description: 'Remove duplicates from devDependencies',
            autoApplicable: true,
            riskLevel: 'low',
          },
        });
      }
    } catch {
      // Ignore errors
    }

    return diagnoses;
  }

  private getLineNumber(content: string, index: number): number {
    return content.slice(0, index).split('\n').length;
  }
}

export default PerformanceSkill;

