/**
 * Vue Skill
 * Detects Vue SFC issues using AST analysis:
 * - Missing key prop in v-for lists
 * - v-if with v-for on same element
 * - Direct DOM manipulation in script sections
 * - JSX accessibility issues (img alt, anchor name)
 * - v-html usage (XSS risk)
 * - Unused props in defineProps
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
  parseVueFile,
  detectMissingVForKey,
  detectVIfWithVFor,
  detectDirectDomAccess,
  detectImgWithoutAltVue,
  detectAnchorWithoutNameVue,
  detectVHtmlUsage,
  detectUnusedPropsVue,
} from '../../../utils/ast-analyzer';

export class VueSkill extends BaseSkill {
  name = 'vue';
  version = '1.0.0';
  description = 'Vue 组件级诊断';

  triggers = [
    { type: 'command' as const, pattern: 'vue' },
    { type: 'keyword' as const, pattern: /vue|sfc|composition|setup|v-for|v-if/i },
  ];

  capabilities = [
    {
      name: 'template-analysis',
      description: 'Vue 模板语法树分析',
      autoFixable: true,
      riskLevel: 'low' as const,
    },
    {
      name: 'composition-api-checks',
      description: 'Composition API 使用情况检查',
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

    logger.info('Starting Vue component analysis...');

    // Only check .vue files
    const vueFiles = await this.getVueFiles(project.path, tools);
    logger.debug(`Found ${vueFiles.length} Vue component files`);

    for (const file of vueFiles) {
      const content = await tools.fs.readFile(file);
      const fileDiagnoses = await this.checkFile(file, content);
      diagnoses.push(...fileDiagnoses);
    }

    logger.info(`Vue analysis completed, found ${diagnoses.length} issues`);
    return diagnoses;
  }

  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    const ruleId = diagnosis.metadata?.ruleId;
    const filePath = diagnosis.location.file;
    const content = await context.tools.fs.readFile(filePath);

    let changes: FileChange[] = [];

    switch (ruleId) {
      case 'missing-v-for-key':
        changes = this.fixMissingVForKey(content, diagnosis);
        break;
      case 'img-without-alt-vue':
        changes = this.fixImgWithoutAlt(content, diagnosis);
        break;
      case 'anchor-without-name-vue':
        changes = this.fixAnchorWithoutName(content, diagnosis);
        break;
      case 'unused-prop-vue':
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
    const astFile = parseVueFile(content, filePath);
    if (!astFile) return [];

    const diagnoses: Diagnosis[] = [];

    // Run all Vue AST checks
    const checks = [
      { results: detectMissingVForKey(astFile), ...this.ruleMeta('missing-v-for-key') },
      { results: detectVIfWithVFor(astFile), ...this.ruleMeta('v-if-with-v-for') },
      { results: detectDirectDomAccess(astFile), ...this.ruleMeta('direct-dom-access') },
      { results: detectImgWithoutAltVue(astFile), ...this.ruleMeta('img-without-alt-vue') },
      { results: detectAnchorWithoutNameVue(astFile), ...this.ruleMeta('anchor-without-name-vue') },
      { results: detectVHtmlUsage(astFile), ...this.ruleMeta('v-html-usage') },
      { results: detectUnusedPropsVue(astFile), ...this.ruleMeta('unused-prop-vue') },
    ];

    for (const check of checks) {
      for (const result of check.results) {
        diagnoses.push({
          id: `Vue-${generateId()}`,
          skill: this.name,
          type: 'vue' as DiagnosisType,
          severity: check.severity,
          title: check.title,
          description: check.description,
          location: { file: result.line ? filePath : filePath, line: result.line },
          metadata: {
            ruleId: result.ruleId,
            snippet: result.snippet,
            ...('propName' in result && result.propName ? { propName: result.propName } : {}),
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
      'missing-v-for-key': {
        severity: 'warning',
        title: 'v-for 指令缺少 key 绑定',
        description: '使用 v-for 渲染列表时，元素缺少唯一的 :key 绑定',
        fixSuggestion: '为 v-for 元素添加 :key="item.id" 或唯一标识',
        autoFixable: true,
      },
      'v-if-with-v-for': {
        severity: 'warning',
        title: '不建议同时使用 v-if 和 v-for',
        description: '在同一元素上同时使用 v-if 和 v-for 会导致性能问题，v-for 优先级更高',
        fixSuggestion: '使用 computed 属性过滤数据或使用 <template> 包裹 v-for',
        autoFixable: false,
      },
      'direct-dom-access': {
        severity: 'warning',
        title: '直接 DOM 操作',
        description: '直接操作 DOM 违反 Vue 数据驱动理念，建议使用 ref 或响应式数据',
        fixSuggestion: '使用 Vue 的 ref 系统替代直接 DOM 操作',
        autoFixable: false,
      },
      'img-without-alt-vue': {
        severity: 'critical',
        title: 'img 元素缺少 alt 属性',
        description: '所有 img 元素必须有 alt 属性以提供替代文本',
        fixSuggestion: '为 img 元素添加 alt 属性',
        autoFixable: true,
      },
      'anchor-without-name-vue': {
        severity: 'critical',
        title: '链接缺少可访问名称',
        description: '链接必须有文本内容或 aria-label 以提供可访问名称',
        fixSuggestion: '添加链接文本或 aria-label 属性',
        autoFixable: true,
      },
      'v-html-usage': {
        severity: 'warning',
        title: '使用 v-html 指令',
        description: 'v-html 指令渲染原始 HTML，存在 XSS 风险',
        fixSuggestion: '确保 v-html 渲染的内容来源可信，或使用 DOMPurify 处理',
        autoFixable: false,
      },
      'unused-prop-vue': {
        severity: 'info',
        title: '未使用的 Prop',
        description: '组件通过 defineProps 声明了 prop 但未在组件体中使用',
        fixSuggestion: '移除未使用的 prop 或在组件中使用它',
        autoFixable: true,
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

  private async getVueFiles(_projectPath: string, tools: SkillContext['tools']): Promise<string[]> {
    const patterns = ['**/*.vue'];
    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await tools.fs.glob(pattern);
      files.push(...matches.filter(f =>
        !f.includes('node_modules') &&
        !f.includes('.test.') &&
        !f.includes('.spec.') &&
        !f.includes('__tests__')
      ));
    }
    return Array.from(new Set(files));
  }

  private fixMissingVForKey(content: string, diagnosis: Diagnosis): FileChange[] {
    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    // Add :key="index" as a fallback (not ideal but better than no key)
    // The developer should replace with a real unique identifier
    const fixedLine = targetLine.replace(
      /v-for="([^"]+)"/,
      (match, forExpr) => {
        // Check if index is already in the for expression
        if (forExpr.includes('index') || forExpr.includes('i,')) {
          return match;
        }
        // Add index to the for expression: item in list → (item, index) in list
        const newForExpr = forExpr.replace(/^(\w+)\s+in\s+/, '($1, index) in ');
        return `v-for="${newForExpr}" :key="index"`;
      }
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
      /(<img)(\s|>)/,
      '$1 alt="Image description"$2'
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
      /(<a)(\s|>)/,
      '$1 aria-label="Link"$2'
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

    // Remove the unused prop from defineProps
    // Handles array syntax: ['prop1', 'unusedProp', 'prop2'] → ['prop1', 'prop2']
    // Also handles object syntax: { prop1, unusedProp } → { prop1 }
    const propRegex = new RegExp(`,?\\s*['"]?${propName}['"]?\\s*,?`);
    const fixedLine = targetLine.replace(propRegex, (match) => {
      // If the match starts with comma, keep it; if ends with comma, remove it
      if (match.startsWith(',')) return match;
      return '';
    }).replace(/,\s*]/g, ']').replace(/\[\s*,/g, '[')
      .replace(/,\s*}/g, '}').replace(/{\s*,/g, '{');

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: fixedLine,
      oldContent: targetLine,
    }];
  }
}

export default VueSkill;
