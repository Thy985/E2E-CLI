/**
 * UI/UX Skill
 * Checks user experience and design consistency
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

// UI/UX rules to check
const UI_UX_RULES = [
  {
    id: 'missing-label',
    patterns: [
      /<input[^>]*(?!aria-label|id\s*=)[^>]*>/gi,
      /<textarea[^>]*(?!aria-label|id\s*=)[^>]*>/gi,
      /<select[^>]*(?!aria-label|id\s*=)[^>]*>/gi,
    ],
    severity: 'warning' as Severity,
    title: '表单元素缺少标签',
    description: '表单元素应有对应的标签以提升可访问性',
    suggestion: '添加 label 或 aria-label 属性',
  },
  {
    id: 'small-click-target',
    patterns: [
      /<button[^>]*style=['"][^'"]*(?:width|height)\s*:\s*(?:\d{1,2}px|1\dpx)[^'"]*['"]/gi,
    ],
    severity: 'info' as Severity,
    title: '点击目标过小',
    description: '点击目标应至少 44x44 像素',
    suggestion: '增大点击区域或添加 padding',
  },
  {
    id: 'low-contrast',
    check: (content: string) => {
      // Simple check for potential low contrast
      return /color\s*:\s*#[0-9a-fA-F]{3,6}/i.test(content) && 
             /background/i.test(content);
    },
    severity: 'info' as Severity,
    title: '可能存在对比度问题',
    description: '文本与背景对比度应满足 WCAG 标准',
    suggestion: '使用对比度检查工具验证',
  },
  {
    id: 'missing-focus-style',
    patterns: [
      /:focus\s*\{\s*\}/g,
      /outline\s*:\s*none(?!\s*!important)/g,
    ],
    severity: 'warning' as Severity,
    title: '缺少焦点样式',
    description: '移除焦点样式会影响键盘导航体验',
    suggestion: '提供替代的焦点样式',
  },
  {
    id: 'fixed-position',
    patterns: [
      /position\s*:\s*fixed/g,
    ],
    severity: 'info' as Severity,
    title: '固定定位元素',
    description: '固定定位元素可能在移动设备上造成问题',
    suggestion: '确保在小屏幕上有适当的处理',
  },
  {
    id: 'missing-loading-state',
    check: (content: string) => {
      const hasAsync = /async|await|fetch|axios|useQuery/i.test(content);
      const hasLoading = /loading|isLoading|spinner|skeleton/i.test(content);
      return hasAsync && !hasLoading;
    },
    severity: 'info' as Severity,
    title: '缺少加载状态',
    description: '异步操作应有加载状态反馈',
    suggestion: '添加 loading 状态或骨架屏',
  },
  {
    id: 'missing-error-state',
    check: (content: string) => {
      const hasAsync = /async|await|fetch|axios|useQuery/i.test(content);
      const hasError = /error|isError|catch/i.test(content);
      return hasAsync && !hasError;
    },
    severity: 'warning' as Severity,
    title: '缺少错误处理',
    description: '异步操作应有错误状态处理',
    suggestion: '添加错误处理和用户反馈',
  },
  {
    id: 'long-text',
    patterns: [
      /<p[^>]*>([^<]{500,})<\/p>/gi,
      /<div[^>]*>([^<]{1000,})<\/div>/gi,
    ],
    severity: 'info' as Severity,
    title: '长文本内容',
    description: '过长的文本内容影响阅读体验',
    suggestion: '考虑分段或添加阅读进度提示',
  },
  {
    id: 'auto-play',
    patterns: [
      /autoplay\s*=\s*['"]true['"]/gi,
      /autoplay\s*=\s*\{/gi,
    ],
    severity: 'warning' as Severity,
    title: '自动播放媒体',
    description: '自动播放可能影响用户体验',
    suggestion: '让用户控制播放',
  },
  {
    id: 'inconsistent-spacing',
    check: (content: string) => {
      // Check for inconsistent margin/padding values
      const margins = content.match(/margin\s*:\s*\d+px/g) || [];
      const paddings = content.match(/padding\s*:\s*\d+px/g) || [];
      const values = [...margins, ...paddings].map(v => v.match(/\d+/)?.[0]);
      const uniqueValues = new Set(values);
      return uniqueValues.size > 10;
    },
    severity: 'info' as Severity,
    title: '间距不一致',
    description: '使用过多不同的间距值',
    suggestion: '使用统一的间距系统（如 4px 或 8px 基准）',
  },
];

export class UIUXSkill extends BaseSkill {
  name = 'ui-ux';
  version = '1.0.0';
  description = 'UI/UX 体验检查';

  triggers = [
    { type: 'command' as const, pattern: 'ui-ux' },
    { type: 'keyword' as const, pattern: /ui|ux|体验|设计|design|用户|user/i },
  ];

  capabilities = [
    {
      name: 'accessibility-check',
      description: '检查可访问性问题',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
    {
      name: 'responsive-check',
      description: '检查响应式设计',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
    {
      name: 'interaction-check',
      description: '检查交互体验',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
  ];

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];
    const { project, tools, logger } = context;

    logger.info('开始 UI/UX 检查...');

    // Check component files
    const componentFiles = await this.getComponentFiles(project.path, tools);
    logger.debug(`找到 ${componentFiles.length} 个组件文件`);

    for (const file of componentFiles) {
      const content = await tools.fs.readFile(file);
      const fileDiagnoses = await this.checkFile(file, content);
      diagnoses.push(...fileDiagnoses);
    }

    // Check style files
    const styleFiles = await this.getStyleFiles(project.path, tools);
    for (const file of styleFiles) {
      const content = await tools.fs.readFile(file);
      const styleDiagnoses = await this.checkStyles(file, content);
      diagnoses.push(...styleDiagnoses);
    }

    logger.info(`UI/UX 检查完成，发现 ${diagnoses.length} 个问题`);
    return diagnoses;
  }

  private async getComponentFiles(projectPath: string, tools: SkillContext['tools']): Promise<string[]> {
    const patterns = ['**/*.tsx', '**/*.jsx'];
    const files: string[] = [];

    for (const pattern of patterns) {
      const matches = await tools.fs.glob(pattern);
      files.push(...matches.filter(f => 
        !f.includes('node_modules') && 
        !f.includes('.test.') &&
        !f.includes('.spec.')
      ));
    }

    return [...new Set(files)];
  }

  private async getStyleFiles(projectPath: string, tools: SkillContext['tools']): Promise<string[]> {
    const patterns = ['**/*.css', '**/*.scss', '**/*.less'];
    const files: string[] = [];

    for (const pattern of patterns) {
      const matches = await tools.fs.glob(pattern);
      files.push(...matches.filter(f => !f.includes('node_modules')));
    }

    return [...new Set(files)];
  }

  private async checkFile(filePath: string, content: string): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];

    for (const rule of UI_UX_RULES) {
      if (rule.patterns) {
        for (const pattern of rule.patterns) {
          const matches = content.matchAll(pattern);
          
          for (const match of matches) {
            const lineNumber = this.getLineNumber(content, match.index!);
            
            diagnoses.push({
              id: `UIUX-${generateId()}`,
              skill: this.name,
              type: 'ui-ux' as DiagnosisType,
              severity: rule.severity,
              title: rule.title,
              description: rule.description,
              location: {
                file: filePath,
                line: lineNumber,
              },
              metadata: {
                ruleId: rule.id,
              },
              fixSuggestion: {
                description: rule.suggestion,
                autoApplicable: false,
                riskLevel: 'low',
              },
            });
          }
        }
      } else if (rule.check && rule.check(content)) {
        diagnoses.push({
          id: `UIUX-${generateId()}`,
          skill: this.name,
          type: 'ui-ux' as DiagnosisType,
          severity: rule.severity,
          title: rule.title,
          description: rule.description,
          location: {
            file: filePath,
          },
          metadata: {
            ruleId: rule.id,
          },
          fixSuggestion: {
            description: rule.suggestion,
            autoApplicable: false,
            riskLevel: 'low',
          },
        });
      }
    }

    return diagnoses;
  }

  private async checkStyles(filePath: string, content: string): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];

    // Check for missing responsive styles
    if (!content.includes('@media') && content.includes('px')) {
      diagnoses.push({
        id: `UIUX-${generateId()}`,
        skill: this.name,
        type: 'ui-ux' as DiagnosisType,
        severity: 'info',
        title: '缺少响应式样式',
        description: '样式文件中没有媒体查询',
        location: { file: filePath },
        fixSuggestion: {
          description: '添加响应式断点样式',
          autoApplicable: false,
          riskLevel: 'low',
        },
      });
    }

    // Check for !important overuse
    const importantCount = (content.match(/!important/g) || []).length;
    if (importantCount > 5) {
      diagnoses.push({
        id: `UIUX-${generateId()}`,
        skill: this.name,
        type: 'ui-ux' as DiagnosisType,
        severity: 'info',
        title: '!important 使用过多',
        description: `发现 ${importantCount} 处 !important，可能导致样式冲突`,
        location: { file: filePath },
        fixSuggestion: {
          description: '重构样式以提高特异性',
          autoApplicable: false,
          riskLevel: 'low',
        },
      });
    }

    // Check for z-index conflicts
    const zIndexValues = content.match(/z-index\s*:\s*\d+/g) || [];
    if (zIndexValues.length > 10) {
      diagnoses.push({
        id: `UIUX-${generateId()}`,
        skill: this.name,
        type: 'ui-ux' as DiagnosisType,
        severity: 'info',
        title: 'z-index 使用过多',
        description: '过多的 z-index 值可能导致层级混乱',
        location: { file: filePath },
        fixSuggestion: {
          description: '建立统一的 z-index 层级系统',
          autoApplicable: false,
          riskLevel: 'low',
        },
      });
    }

    return diagnoses;
  }

  private getLineNumber(content: string, index: number): number {
    return content.slice(0, index).split('\n').length;
  }
}

export default UIUXSkill;
