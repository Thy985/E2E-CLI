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
    selector: 'h1, h2, h3, h4, h5, h6',
    severity: 'warning' as Severity,
    title: '标题层级可能不正确',
    description: '标题应按层级顺序使用',
    wcag: 'WCAG 2.2 - 1.3.1 Info and Relationships',
    fix: '确保标题按正确层级顺序使用',
  },
  {
    id: 'landmark',
    selector: 'body:not(:has(main, [role="main"]))',
    severity: 'warning' as Severity,
    title: '页面缺少 main 地标',
    description: '页面应包含 main 地标以便导航',
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

    // Get HTML files
    const htmlFiles = await this.getHtmlFiles(project.path, tools);
    logger.debug(`找到 ${htmlFiles.length} 个 HTML 文件`);

    // Check each file
    for (const file of htmlFiles) {
      const content = await tools.fs.readFile(file);
      const fileDiagnoses = await this.checkFile(file, content);
      diagnoses.push(...fileDiagnoses);
    }

    // Check TSX/JSX files for React components
    const componentFiles = await this.getComponentFiles(project.path, tools);
    logger.debug(`找到 ${componentFiles.length} 个组件文件`);

    for (const file of componentFiles) {
      const content = await tools.fs.readFile(file);
      const fileDiagnoses = await this.checkComponent(file, content);
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
    const patterns = [
      '**/*.tsx',
      '**/*.jsx',
    ];

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
          },
          fixSuggestion: {
            description: rule.fix,
            autoApplicable: rule.severity === 'critical',
            riskLevel: 'low',
          },
        });
      }
    }

    return diagnoses;
  }

  private async checkComponent(filePath: string, content: string): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];

    // Check for common a11y issues in React components
    // Use 's' flag and [\s\S]*? for multi-line JSX tag matching
    const patterns = [
      {
        regex: /<img(?![^>]*?\balt\s*=)[^>]*>/gis,
        check: (_match: string) => true, // regex already filters non-alt images
        rule: WCAG_RULES[0], // img-alt
      },
      {
        regex: /<input(?![^>]*?\btype\s*=\s*["']hidden["'])[^>]*>/gis,
        check: (match: string) => 
          !match.includes('id=') && 
          !match.includes('aria-label='),
        rule: WCAG_RULES[1], // label
      },
      {
        // Multi-line button matching
        regex: /<button([^>]*)>([\s\S]*?)<\/button>/gi,
        check: (match: string) => {
          // Re-extract attrs/body since we matched with groups
          const tagMatch = match.match(/<button([^>]*)>([\s\S]*?)<\/button>/i);
          if (!tagMatch) return true;
          const attrs = tagMatch[1] || '';
          const body = tagMatch[2] || '';
          return !attrs.includes('aria-label=') &&
            !attrs.includes('aria-labelledby=') &&
            body.trim().length === 0;
        },
        rule: WCAG_RULES[2], // button-name
      },
    ];

    for (const { regex, check, rule } of patterns) {
      const matches = content.matchAll(regex);
      
      for (const match of matches) {
        if (check(match[0])) {
          const lineNumber = this.getLineNumber(content, match.index!);
          
          diagnoses.push({
            id: `A11y-${generateId()}`,
            skill: this.name,
            type: 'accessibility' as DiagnosisType,
            severity: rule.severity,
            title: rule.title,
            description: rule.description,
            location: {
              file: filePath,
              line: lineNumber,
            },
            metadata: {
              ruleId: rule.id,
              wcag: rule.wcag,
              matchedCode: match[0].slice(0, 100),
            },
            fixSuggestion: {
              description: rule.fix,
              autoApplicable: rule.severity === 'critical',
              riskLevel: 'low',
            },
          });
        }
      }
    }

    return diagnoses;
  }

  private findRuleViolations(
    content: string,
    selector: string,
    _rule: typeof WCAG_RULES[0]
  ): { line: number }[] {
    const issues: { line: number }[] = [];
    
    // Multi-line aware HTML parsing using regex with 's' flag
    if (selector.includes('img:not([alt])')) {
      // Match <img> tags across multiple lines, negative lookahead for alt attribute
      const regex = /<img(?![^>]*?\balt\s*=)[^>]*>/gis;
      for (const match of content.matchAll(regex)) {
        issues.push({ line: this.getLineNumber(content, match.index!) });
      }
    }

    if (selector.includes('input:not([id])') || selector.includes('textarea:not([id])') || selector.includes('select:not([id])')) {
      // Match input/textarea/select tags without id attribute (multi-line aware)
      const regex = /<(?:input|textarea|select)(?![^>]*?\bid\s*=)(?![^>]*?\btype\s*=\s*["']hidden["'])[^>]*>/gis;
      for (const match of content.matchAll(regex)) {
        // Only flag elements that also lack aria-label
        if (!match[0].includes('aria-label=')) {
          issues.push({ line: this.getLineNumber(content, match.index!) });
        }
      }
    }

    if (selector.includes('button') && selector.includes('aria-label')) {
      // Match button tags that have no text content and no aria-label/aria-labelledby
      // Handle multi-line buttons
      const regex = /<button([^>]*)>([\s\S]*?)<\/button>/gi;
      for (const match of content.matchAll(regex)) {
        const attrs = match[1] || '';
        const body = match[2] || '';
        const hasAccessibleName = attrs.includes('aria-label=') ||
          attrs.includes('aria-labelledby=') ||
          body.trim().length > 0;
        if (!hasAccessibleName) {
          issues.push({ line: this.getLineNumber(content, match.index!) });
        }
      }
    }

    if (selector.includes('a:empty') && selector.includes('aria-label')) {
      // Match anchor tags with no text and no aria-label
      const regex = /<a([^>]*)>([\s\S]*?)<\/a>/gi;
      for (const match of content.matchAll(regex)) {
        const attrs = match[1] || '';
        const body = match[2] || '';
        const hasAccessibleName = attrs.includes('aria-label=') ||
          attrs.includes('aria-labelledby=') ||
          body.trim().length > 0;
        if (!hasAccessibleName) {
          issues.push({ line: this.getLineNumber(content, match.index!) });
        }
      }
    }

    return issues;
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
    // Find the img tag and add alt attribute with context-aware description
    const matchedCode = diagnosis.metadata?.matchedCode;
    if (!matchedCode) return [];

    // Generate context-aware alt text from src attribute
    let altText = '图片描述';
    const srcMatch = matchedCode.match(/src\s*=\s*["']([^"']*)["']/i);
    if (srcMatch) {
      const srcValue = srcMatch[1];
      const filename = srcValue.split('/').pop() || '';
      const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
      // Convert kebab-case, snake_case, camelCase to readable text
      altText = nameWithoutExt
        .replace(/[-_]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (c: string) => c.toUpperCase())
        .trim();
      if (!altText) altText = '图片描述';
    }

    // Also check surrounding lines for descriptive text
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
    const matchedCode = diagnosis.metadata?.matchedCode;
    if (!matchedCode) return [];

    // Generate context-aware button label from surrounding content
    let labelText = '按钮';
    const line = diagnosis.location.line;
    if (line) {
      const lines = content.split('\n');
      // Check previous line for variable names or labels
      const contextLine = lines[line - 2] || '';
      const varMatch = contextLine.match(/(?:label|title|text|name)\s*[=:]\s*["']([^"']+)["']/i);
      if (varMatch && varMatch[1].length > 1) {
        labelText = varMatch[1];
      } else {
        // Extract from component props or nearby text
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

  private fixInputLabel(_content: string, diagnosis: Diagnosis): FileChange[] {
    const matchedCode = diagnosis.metadata?.matchedCode;
    if (!matchedCode) return [];

    // Generate a unique ID based on the input type
    const inputTypeMatch = matchedCode.match(/type\s*=\s*["']([^"']*)["']/i);
    const inputType = inputTypeMatch ? inputTypeMatch[1] : 'input';
    const generatedId = `${inputType}-field-${generateId().slice(0, 4)}`;

    // Add id attribute to the input
    const fixedCode = matchedCode.replace(/<input/, `<input id="${generatedId}"`);

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      oldContent: matchedCode,
      content: fixedCode,
    }];
  }
}

// Export default instance
export default A11ySkill;
