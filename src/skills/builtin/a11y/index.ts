/**
 * Accessibility (A11y) Skill
 * Checks WCAG compliance and accessibility issues
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

// WCAG rules to check
const WCAG_RULES = [
  {
    id: 'img-alt',
    selector: 'img:not([alt])',
    severity: 'critical' as Severity,
    title: '图片缺少 alt 属性',
    description: '所有图片必须有 alt 属性以提供替代文本',
    wcag: 'WCAG 2.2 - 1.1.1 Non-text Content',
    fix: '添加 alt 属性描述图片内容',
  },
  {
    id: 'label',
    selector: 'input:not([id]), textarea:not([id]), select:not([id])',
    severity: 'critical' as Severity,
    title: '表单元素缺少 id 属性',
    description: '表单元素需要 id 属性以关联 label',
    wcag: 'WCAG 2.2 - 1.3.1 Info and Relationships',
    fix: '添加 id 属性并关联 label',
  },
  {
    id: 'button-name',
    selector: 'button:empty, button:not([aria-label]):not([aria-labelledby])',
    severity: 'critical' as Severity,
    title: '按钮缺少可访问名称',
    description: '按钮必须有文本内容或 aria-label',
    wcag: 'WCAG 2.2 - 4.1.2 Name, Role, Value',
    fix: '添加按钮文本或 aria-label 属性',
  },
  {
    id: 'link-name',
    selector: 'a:empty:not([aria-label]):not([aria-labelledby])',
    severity: 'critical' as Severity,
    title: '链接缺少可访问名称',
    description: '链接必须有文本内容或 aria-label',
    wcag: 'WCAG 2.2 - 4.1.2 Name, Role, Value',
    fix: '添加链接文本或 aria-label 属性',
  },
  {
    id: 'heading-order',
    selector: 'heading-order-check',
    severity: 'warning' as Severity,
    title: '标题层级不正确',
    description: '标题层级跳跃（如 h1 直接到 h3）会影响屏幕阅读器用户导航',
    wcag: 'WCAG 2.2 - 1.3.1 Info and Relationships',
    fix: '确保标题按正确层级顺序使用，不跳过层级',
  },
  {
    id: 'landmark',
    selector: 'landmark-check',
    severity: 'warning' as Severity,
    title: '页面缺少 main 地标',
    description: '页面应包含 <main> 元素或 role="main" 以便屏幕阅读器导航',
    wcag: 'WCAG 2.2 - 1.3.1 Info and Relationships',
    fix: '添加 <main> 元素或 role="main"',
  },
];

export class A11ySkill extends BaseSkill {
  name = 'a11y';
  version = '1.0.0';
  description = 'WCAG 可访问性检查';

  triggers = [
    { type: 'command' as const, pattern: 'a11y' },
    { type: 'keyword' as const, pattern: /可访问性|accessibility|a11y|WCAG/i },
  ];

  capabilities = [
    {
      name: 'wcag-check',
      description: '检查 WCAG 合规性',
      autoFixable: true,
      riskLevel: 'low' as const,
    },
    {
      name: 'color-contrast',
      description: '检查色彩对比度',
      autoFixable: false,
      riskLevel: 'medium' as const,
    },
  ];

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];
    const { project, tools, logger } = context;

    logger.info('开始可访问性检查...');

    const htmlFiles = await this.getHtmlFiles(project.path, tools);
    logger.debug(`找到 ${htmlFiles.length} 个 HTML 文件`);

    for (const file of htmlFiles) {
      const content = await tools.fs.readFile(file);
      const fileDiagnoses = await this.checkFile(file, content);
      diagnoses.push(...fileDiagnoses);
    }

    const componentFiles = await this.getComponentFiles(project.path, tools);
    logger.debug(`找到 ${componentFiles.length} 个组件文件`);

    for (const file of componentFiles) {
      const content = await tools.fs.readFile(file);
      const fileDiagnoses = await this.checkFile(file, content);
      diagnoses.push(...fileDiagnoses);
    }

    logger.info(`可访问性检查完成，发现 ${diagnoses.length} 个问题`);
    return diagnoses;
  }

  private async getHtmlFiles(
    _projectPath: string,
    tools: SkillContext['tools']
  ): Promise<string[]> {
    const patterns = [
      '**/*.html',
      '**/public/**/*.html',
    ];

    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await tools.fs.glob(pattern);
      files.push(...matches.filter(f => !f.includes('node_modules')));
    }
    return [...new Set(files)];
  }

  private async getComponentFiles(
    _projectPath: string,
    tools: SkillContext['tools']
  ): Promise<string[]> {
    const patterns = ['**/*.tsx', '**/*.jsx'];
    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await tools.fs.glob(pattern);
      files.push(...matches.filter(f => !f.includes('node_modules')));
    }
    return [...new Set(files)];
  }

  private async checkFile(filePath: string, content: string): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];

    for (const rule of WCAG_RULES) {
      const issues = this.findRuleViolations(content, rule.selector, rule);

      for (const issue of issues) {
        diagnoses.push({
          id: `A11y-${generateId()}`,
          skill: this.name,
          type: 'accessibility' as DiagnosisType,
          severity: rule.severity,
          title: rule.title,
          description: rule.description,
          location: {
            file: filePath,
            line: issue.line,
          },
          metadata: {
            ruleId: rule.id,
            wcag: rule.wcag,
            fixable: ['img-alt', 'label', 'button-name', 'link-name'].includes(rule.id),
            ...(issue.matchedCode ? { matchedCode: issue.matchedCode.slice(0, 100) } : {}),
          },
          fixSuggestion: {
            description: rule.fix,
            autoApplicable: ['img-alt', 'label', 'button-name', 'link-name'].includes(rule.id),
            riskLevel: 'low',
          },
        });
      }
    }

    return diagnoses;
  }

  private findRuleViolations(
    content: string,
    selector: string,
    _rule: typeof WCAG_RULES[0]
  ): { line: number; matchedCode?: string }[] {
    const issues: { line: number; matchedCode?: string }[] = [];

    if (selector === 'heading-order-check') {
      return this.checkHeadingOrder(content);
    }

    if (selector === 'landmark-check') {
      return this.checkLandmark(content);
    }

    // img:not([alt])
    if (selector.includes('img:not([alt])')) {
      const regex = /<img(?![^>]*?\balt\s*=)[^>]*>/gis;
      for (const match of content.matchAll(regex)) {
        issues.push({ line: this.getLineNumber(content, match.index!), matchedCode: match[0] });
      }
    }

    // input/textarea/select:not([id])
    if (selector.includes('input:not([id])') || selector.includes('textarea:not([id])') || selector.includes('select:not([id])')) {
      const regex = /<(?:input|textarea|select)(?![^>]*?\bid\s*=)(?![^>]*?\btype\s*=\s*["']hidden["'])[^>]*>/gis;
      for (const match of content.matchAll(regex)) {
        if (!match[0].includes('aria-label=')) {
          issues.push({ line: this.getLineNumber(content, match.index!), matchedCode: match[0] });
        }
      }
    }

    // button without accessible name
    if (selector.includes('button') && selector.includes('aria-label')) {
      const regex = /<button([^>]*)>([\s\S]*?)<\/button>/gi;
      for (const match of content.matchAll(regex)) {
        const attrs = match[1] || '';
        const body = match[2] || '';
        const hasAccessibleName = attrs.includes('aria-label=') ||
          attrs.includes('aria-labelledby=') ||
          body.trim().length > 0;
        if (!hasAccessibleName) {
          issues.push({ line: this.getLineNumber(content, match.index!), matchedCode: match[0] });
        }
      }
    }

    // a:empty without accessible name
    if (selector.includes('a:empty') && selector.includes('aria-label')) {
      const regex = /<a([^>]*)>([\s\S]*?)<\/a>/gi;
      for (const match of content.matchAll(regex)) {
        const attrs = match[1] || '';
        const body = match[2] || '';
        const hasAccessibleName = attrs.includes('aria-label=') ||
          attrs.includes('aria-labelledby=') ||
          body.trim().length > 0;
        if (!hasAccessibleName) {
          issues.push({ line: this.getLineNumber(content, match.index!), matchedCode: match[0] });
        }
      }
    }

    return issues;
  }

  /**
   * Check heading order — detect skipped heading levels (e.g., h1 → h3)
   */
  private checkHeadingOrder(content: string): { line: number }[] {
    const issues: { line: number }[] = [];
    const headingRegex = /<(h[1-6])[\s>]/gi;
    let lastLevel = 0;

    for (const match of content.matchAll(headingRegex)) {
      const level = parseInt(match[1][1], 10);
      if (lastLevel > 0 && level > lastLevel + 1) {
        issues.push({ line: this.getLineNumber(content, match.index!) });
      }
      lastLevel = level;
    }

    return issues;
  }

  /**
   * Check for main landmark — simple string search, no :has() pseudo-class needed
   */
  private checkLandmark(content: string): { line: number }[] {
    const hasMain = content.includes('<main') || content.includes('role="main"') || content.includes("role='main'");
    if (!hasMain) {
      // Report on the first line of the file
      return [{ line: 1 }];
    }
    return [];
  }

  private getLineNumber(content: string, index: number): number {
    return content.slice(0, index).split('\n').length;
  }

  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    const ruleId = diagnosis.metadata?.ruleId;
    const filePath = diagnosis.location.file;
    const content = await context.tools.fs.readFile(filePath);

    let changes: FileChange[] = [];

    switch (ruleId) {
      case 'img-alt':
        changes = this.fixImgAlt(content, diagnosis);
        break;
      case 'button-name':
        changes = this.fixButtonName(content, diagnosis);
        break;
      case 'label':
        changes = this.fixInputLabel(content, diagnosis);
        break;
      default:
        throw new Error(`Cannot auto-fix rule: ${ruleId}`);
    }

    return {
      id: `Fix-${generateId()}`,
      diagnosisId: diagnosis.id,
      description: `修复 ${diagnosis.title}`,
      changes,
      riskLevel: 'low',
      autoApplicable: true,
    };
  }

  private fixImgAlt(content: string, diagnosis: Diagnosis): FileChange[] {
    const matchedCode = diagnosis.metadata?.matchedCode as string | undefined;
    if (!matchedCode) return [];

    let altText = '图片描述';
    const srcMatch = matchedCode.match(/src\s*=\s*["']([^"']*)["']/i);
    if (srcMatch) {
      const srcValue = srcMatch[1];
      const filename = srcValue.split('/').pop() || '';
      const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
      altText = nameWithoutExt
        .replace(/[-_]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (c: string) => c.toUpperCase())
        .trim();
      if (!altText) altText = '图片描述';
    }

    const line = diagnosis.location.line;
    if (line) {
      const lines = content.split('\n');
      const contextLines = [lines[line - 2], lines[line - 1], lines[line]].filter(Boolean).join(' ');
      const labelMatch = contextLines.match(/(?:label|caption|title|alt|description)\s*[:=]\s*["']([^"']+)["']/i);
      if (labelMatch && labelMatch[1].length > 2) {
        altText = labelMatch[1];
      }
    }

    const fixedCode = matchedCode.replace(/<img/, `<img alt="${altText}"`);

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      oldContent: matchedCode,
      content: fixedCode,
    }];
  }

  private fixButtonName(content: string, diagnosis: Diagnosis): FileChange[] {
    const matchedCode = diagnosis.metadata?.matchedCode as string | undefined;
    if (!matchedCode) return [];

    let labelText = '按钮';
    const line = diagnosis.location.line;
    if (line) {
      const lines = content.split('\n');
      const contextLine = lines[line - 2] || '';
      const varMatch = contextLine.match(/(?:label|title|text|name)\s*[=:]\s*["']([^"']+)["']/i);
      if (varMatch && varMatch[1].length > 1) {
        labelText = varMatch[1];
      } else {
        const propMatch = contextLine.match(/\b(\w+Button|button\w+|submit|save|cancel|delete|confirm|close|open|add|edit|remove)\b/i);
        if (propMatch) {
          labelText = propMatch[1].replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[_-]/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, (c) => c.toUpperCase());
        }
      }
    }

    const fixedCode = matchedCode.replace(
      /<button([^>]*)>\s*<\/button>/,
      `<button$1 aria-label="${labelText}">${labelText}</button>`
    );

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      oldContent: matchedCode,
      content: fixedCode,
    }];
  }

  private fixInputLabel(content: string, diagnosis: Diagnosis): FileChange[] {
    const matchedCode = diagnosis.metadata?.matchedCode as string | undefined;
    if (!matchedCode) return [];

    const inputTypeMatch = matchedCode.match(/type\s*=\s*["']([^"']*)["']/i);
    const inputType = inputTypeMatch ? inputTypeMatch[1] : 'input';
    const generatedId = `${inputType}-field-${generateId().slice(0, 4)}`;

    // Add id to input
    const fixedInput = matchedCode.replace(/<input/, `<input id="${generatedId}"`);

    // Generate a corresponding <label> element
    const label = `<label for="${generatedId}">${inputType.charAt(0).toUpperCase() + inputType.slice(1)}</label>`;

    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const indentation = lines[line - 1]?.match(/^(\s*)/)?.[1] || '';

    return [
      {
        file: diagnosis.location.file,
        type: 'replace',
        oldContent: matchedCode,
        content: fixedInput,
      },
      {
        file: diagnosis.location.file,
        type: 'insert',
        position: { line },
        content: `${indentation}${label}`,
      },
    ];
  }
}

export default A11ySkill;
