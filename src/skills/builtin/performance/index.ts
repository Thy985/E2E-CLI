/**
 * Performance Skill
 * Checks performance issues and optimization opportunities
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

// Performance rules to check
const PERFORMANCE_RULES = [
  {
    id: 'large-bundle',
    pattern: /import\s+.*\s+from\s+['"]lodash['"]/g,
    severity: 'warning' as Severity,
    title: 'Large Bundle Import',
    description: 'Importing entire lodash library increases bundle size',
    suggestion: 'Use lodash-es or import specific functions',
    fixable: true,
    fixType: 'replace',
  },
  {
    id: 'sync-script',
    pattern: /<script\s+src=['"][^'"]+['"]\s*>\s*<\/script>/g,
    severity: 'warning' as Severity,
    title: 'Synchronous Script Loading',
    description: 'Synchronous scripts block page rendering',
    suggestion: 'Add async or defer attributes',
    fixable: true,
    fixType: 'replace',
  },
  {
    id: 'unoptimized-image',
    pattern: /<img[^>]*src=['"][^'"]*\.(png|jpg|jpeg)['"][^>]*>/gi,
    severity: 'info' as Severity,
    title: 'Unoptimized Image Format',
    description: 'Traditional image formats may impact loading performance',
    suggestion: 'Consider WebP or AVIF formats',
    fixable: false,
    fixType: 'none',
  },
  {
    id: 'inline-style',
    pattern: /style=\s*['"][^'"]{100,}['"]/g,
    severity: 'info' as Severity,
    title: 'Long Inline Styles',
    description: 'Long inline styles affect caching and maintainability',
    suggestion: 'Move styles to CSS files',
    fixable: false,
    fixType: 'none',
  },
  {
    id: 'console-log',
    pattern: /console\.(log|debug|info|warn)\s*\(/g,
    severity: 'info' as Severity,
    title: 'Console Statements in Production',
    description: 'Console statements should be removed in production',
    suggestion: 'Use environment variables to control log output',
    fixable: true,
    fixType: 'delete',
  },
  {
    id: 'large-component',
    check: (content: string) => {
      const lines = content.split('\n');
      return lines.length > 300;
    },
    severity: 'info' as Severity,
    title: 'Large Component File',
    description: 'Large components are hard to maintain and may impact performance',
    suggestion: 'Consider splitting into smaller components',
    fixable: false,
    fixType: 'none',
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

  /**
   * Auto-fix performance issues
   */
  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    const ruleId = diagnosis.metadata?.ruleId;
    const filePath = diagnosis.location.file;
    const content = await context.tools.fs.readFile(filePath);

    let changes: FileChange[] = [];

    switch (ruleId) {
      case 'large-bundle':
        changes = this.fixLargeBundle(content, diagnosis);
        break;
      case 'sync-script':
        changes = this.fixSyncScript(content, diagnosis);
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

  /**
   * Fix lodash full import to specific import
   */
  private fixLargeBundle(content: string, diagnosis: Diagnosis): FileChange[] {
    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    // Match import statement
    const importMatch = targetLine.match(/import\s+(\w+)\s+from\s+['"]lodash['"]/);
    if (!importMatch) {
      throw new Error('Could not find lodash import to fix');
    }

    const varName = importMatch[1];
    // Replace with specific import pattern (user needs to specify which functions)
    const fixedLine = targetLine.replace(
      /import\s+\w+\s+from\s+['"]lodash['"]/,
      `// TODO: Replace with specific imports, e.g.:\n// import { specificFunction } from 'lodash-es';
// or\n// import specificFunction from 'lodash/specificFunction';`
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
   * Fix synchronous script loading by adding async/defer
   */
  private fixSyncScript(content: string, diagnosis: Diagnosis): FileChange[] {
    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    // Add defer attribute to script tag
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
   * Remove or comment out console statements
   */
  private fixConsoleLog(content: string, diagnosis: Diagnosis): FileChange[] {
    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    // Comment out the console statement
    const fixedLine = targetLine.replace(
      /(console\.(log|debug|info|warn)\s*\()/,
      '// $1'
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
   * Fix duplicate dependencies in package.json
   */
  private fixDuplicateDeps(content: string, diagnosis: Diagnosis): FileChange[] {
    const duplicates = diagnosis.metadata?.duplicates as string[] || [];
    
    // Parse package.json
    const pkg = JSON.parse(content);
    
    // Remove duplicates from devDependencies
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

  private async getSourceFiles(projectPath: string, tools: SkillContext['tools']): Promise<string[]> {
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

    for (const rule of PERFORMANCE_RULES) {
      if (rule.pattern) {
        let match;
        const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
        
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
              riskLevel: rule.severity === 'warning' ? 'low' : 'low',
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

  private async checkLargeFiles(projectPath: string, tools: SkillContext['tools']): Promise<Diagnosis[]> {
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

  private async checkPackageJson(projectPath: string, tools: SkillContext['tools']): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];

    try {
      const pkgContent = await tools.fs.readFile('package.json');
      const pkg = JSON.parse(pkgContent);

      // Check for heavy dependencies
      for (const dep of Object.keys(pkg.dependencies || {})) {
        if (HEAVY_DEPENDENCIES[dep]) {
          const info = HEAVY_DEPENDENCIES[dep];
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

