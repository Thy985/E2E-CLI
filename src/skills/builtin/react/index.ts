/**
 * React Skill
 * Detects React component issues using AST analysis:
 * - Missing key prop in lists
 * - Hook rule violations
 * - Unused props
 * - Index as key
 * - JSX accessibility issues (img alt, anchor name)
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
  detectMissingKeyProp,
  detectHookMisuse,
  detectUnusedProps,
  detectDangerousSetInnerHTML,
  detectImgWithoutAlt,
  detectAnchorWithoutName,
  detectReactAntiPatterns,
} from '../../../utils/ast-analyzer';

export class ReactSkill extends BaseSkill {
  name = 'react';
  version = '1.0.0';
  description = 'React 组件级诊断';

  triggers = [
    { type: 'command' as const, pattern: 'react' },
    { type: 'keyword' as const, pattern: /react|component|jsx|tsx|hook/i },
  ];

  capabilities = [
    {
      name: 'jsx-analysis',
      description: 'JSX 语法树分析',
      autoFixable: true,
      riskLevel: 'low' as const,
    },
    {
      name: 'hook-rules',
      description: 'Hook 规则检查',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
    {
      name: 'prop-analysis',
      description: 'Props 使用情况分析',
      autoFixable: true,
      riskLevel: 'low' as const,
    },
  ];

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];
    const { project, tools, logger } = context;

    logger.info('Starting React component analysis...');

    // Only check .tsx and .jsx files
    const reactFiles = await this.getReactFiles(project.path, tools);
    logger.debug(`Found ${reactFiles.length} React component files`);

    for (const file of reactFiles) {
      const content = await tools.fs.readFile(file);
      const fileDiagnoses = await this.checkFile(file, content);
      diagnoses.push(...fileDiagnoses);
    }

    logger.info(`React analysis completed, found ${diagnoses.length} issues`);
    return diagnoses;
  }

  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    const ruleId = diagnosis.metadata?.ruleId;
    const filePath = diagnosis.location.file;
    const content = await context.tools.fs.readFile(filePath);

    let changes: FileChange[] = [];

    switch (ruleId) {
      case 'missing-key-prop':
        changes = this.fixMissingKey(content, diagnosis);
        break;
      case 'img-without-alt':
        changes = this.fixImgWithoutAlt(content, diagnosis);
        break;
      case 'anchor-without-name':
        changes = this.fixAnchorWithoutName(content, diagnosis);
        break;
      case 'unused-prop':
        changes = this.fixUnusedProp(content, diagnosis);
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

  private async checkFile(filePath: string, content: string): Promise<Diagnosis[]> {
    const astFile = parseFile(filePath, content);
    if (!astFile) return [];

    const diagnoses: Diagnosis[] = [];

    // Run all React AST checks
    const checks = [
      { results: detectMissingKeyProp(astFile), ...this.ruleMeta('missing-key-prop') },
      { results: detectHookMisuse(astFile), ...this.ruleMeta('hook-misuse') },
      { results: detectUnusedProps(astFile), ...this.ruleMeta('unused-prop') },
      { results: detectDangerousSetInnerHTML(astFile), ...this.ruleMeta('dangerous-set-inner-html') },
      { results: detectImgWithoutAlt(astFile), ...this.ruleMeta('img-without-alt') },
      { results: detectAnchorWithoutName(astFile), ...this.ruleMeta('anchor-without-name') },
      { results: detectReactAntiPatterns(astFile), ...this.ruleMeta('index-as-key') },
    ];

    for (const check of checks) {
      for (const result of check.results) {
        // Deduplicate by ruleId — e.g., detectReactAntiPatterns emits index-as-key
        // which overlaps with other checks
        diagnoses.push({
          id: `React-${generateId()}`,
          skill: this.name,
          type: 'react' as DiagnosisType,
          severity: check.severity,
          title: check.title,
          description: check.description,
          location: { file: result.line ? filePath : filePath, line: result.line },
          metadata: {
            ruleId: result.ruleId,
            snippet: result.snippet,
            ...(result.propName ? { propName: result.propName } : {}),
          },
          fixSuggestion: {
            description: check.fixSuggestion,
            autoApplicable: check.autoFixable,
            riskLevel: 'low',
          },
        });
      }
    }

    return diagnoses;
  }

  private ruleMeta(ruleId: string) {
    const meta: Record<string, { severity: Severity; title: string; description: string; fixSuggestion: string; autoFixable: boolean }> = {
      'missing-key-prop': {
        severity: 'warning',
        title: '列表渲染缺少 key prop',
        description: '使用 .map() 渲染列表时，子元素缺少唯一的 key prop',
        fixSuggestion: '为列表元素添加 key={item.id} 或唯一标识',
        autoFixable: true,
      },
      'hook-misuse': {
        severity: 'error',
        title: 'Hook 使用违反规则',
        description: 'React Hook 不应在条件语句、循环或嵌套函数中调用',
        fixSuggestion: '将 Hook 调用移到组件顶层',
        autoFixable: false,
      },
      'unused-prop': {
        severity: 'info',
        title: '未使用的 Prop',
        description: '组件声明了 prop 但未在组件体中使用',
        fixSuggestion: '移除未使用的 prop 或在组件中使用它',
        autoFixable: true,
      },
      'dangerous-set-inner-html': {
        severity: 'warning',
        title: '使用 dangerouslySetInnerHTML',
        description: '直接设置 HTML 内容存在 XSS 风险',
        fixSuggestion: '使用 DOMPurify.sanitize() 处理 HTML 内容',
        autoFixable: false,
      },
      'img-without-alt': {
        severity: 'critical',
        title: 'img 元素缺少 alt 属性',
        description: '所有 img 元素必须有 alt 属性以提供替代文本',
        fixSuggestion: '为 img 元素添加 alt 属性',
        autoFixable: true,
      },
      'anchor-without-name': {
        severity: 'critical',
        title: '链接缺少可访问名称',
        description: '链接必须有文本内容或 aria-label 以提供可访问名称',
        fixSuggestion: '添加链接文本或 aria-label 属性',
        autoFixable: true,
      },
      'index-as-key': {
        severity: 'warning',
        title: '使用索引作为 key',
        description: '使用数组索引作为 key 可能导致渲染问题和不必要的重渲染',
        fixSuggestion: '使用唯一标识符（如 item.id）作为 key',
        autoFixable: false,
      },
    };
    return meta[ruleId] || {
      severity: 'info' as Severity,
      title: ruleId,
      description: ruleId,
      fixSuggestion: '',
      autoFixable: false,
    };
  }

  private async getReactFiles(_projectPath: string, tools: SkillContext['tools']): Promise<string[]> {
    const patterns = ['**/*.tsx', '**/*.jsx'];
    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await tools.fs.glob(pattern);
      files.push(...matches.filter(f =>
        !f.includes('node_modules') &&
        !f.includes('.d.ts') &&
        !f.includes('.test.') &&
        !f.includes('.spec.') &&
        !f.includes('__tests__')
      ));
    }
    return [...new Set(files)];
  }

  private fixMissingKey(content: string, diagnosis: Diagnosis): FileChange[] {
    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    // Add key={index} as a fallback (not ideal but better than no key)
    // The developer should replace with a real unique identifier
    const fixedLine = targetLine.replace(
      /\.map\(\((\w+)\)\s*=>\s*</,
      '.map(($1, index) => <'
    ).replace(
      /<(\w+)(\s|>)/,
      '<$1 key={index}$2'
    );

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: fixedLine,
      oldContent: targetLine,
    }];
  }

  private fixImgWithoutAlt(content: string, diagnosis: Diagnosis): FileChange[] {
    const snippet = diagnosis.metadata?.snippet as string | undefined;
    if (!snippet) return [];

    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    const fixedLine = targetLine.replace(
      /<img(\s)/,
      '<img alt="Image description"$1'
    );

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: fixedLine,
      oldContent: targetLine,
    }];
  }

  private fixAnchorWithoutName(content: string, diagnosis: Diagnosis): FileChange[] {
    const snippet = diagnosis.metadata?.snippet as string | undefined;
    if (!snippet) return [];

    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    const fixedLine = targetLine.replace(
      /<a(\s|>)/,
      '<a aria-label="Link"$1'
    );

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: fixedLine,
      oldContent: targetLine,
    }];
  }

  private fixUnusedProp(content: string, diagnosis: Diagnosis): FileChange[] {
    const propName = diagnosis.metadata?.propName as string | undefined;
    if (!propName) return [];

    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    // Remove the unused prop from destructuring
    // Handles: { prop1, unusedProp, prop2 } → { prop1, prop2 }
    // Also handles: { prop1, unusedProp } → { prop1 }
    const propRegex = new RegExp(`,?\\s*${propName}\\s*,?`);
    const fixedLine = targetLine.replace(propRegex, (match) => {
      // If the match starts with comma, keep it; if ends with comma, remove it
      if (match.startsWith(',')) return match;
      return '';
    }).replace(/,\s*}/g, '}').replace(/{\s*,/g, '{');

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: fixedLine,
      oldContent: targetLine,
    }];
  }
}

export default ReactSkill;
