/**
 * Nuxt Skill: Framework-aware diagnostics for Nuxt 3 projects
 * Detects common Nuxt anti-patterns using AST analysis.
 */

import { BaseSkill } from '../../base-skill';
import {
  SkillContext,
  Diagnosis,
  Fix,
  Severity,
  FileChange,
  SkillTrigger,
  SkillCapability,
} from '../../../types';
import { generateId } from '../../../utils';
import { parseVueFile, parseFile, walkAST, findVElements } from '../../../utils/ast-analyzer';
import * as path from 'path';
import { AST_NODE_TYPES } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/typescript-estree';

// ---------------------------------------------------------------------------
// Rule metadata
// ---------------------------------------------------------------------------

interface RuleMeta {
  severity: Severity;
  autoFixable: boolean;
}

const RULE_META: Record<string, RuleMeta> = {
  'nuxt-image-missing': { severity: 'warning', autoFixable: true },
  'nuxt-link-missing': { severity: 'warning', autoFixable: true },
  'nuxt-dom-access': { severity: 'warning', autoFixable: false },
  'nuxt-client-secret': { severity: 'critical', autoFixable: false },
  'nuxt-ssr-misuse': { severity: 'warning', autoFixable: false },
  'nuxt-pagemeta-missing': { severity: 'info', autoFixable: false },
  'nuxt-hardcoded-url': { severity: 'warning', autoFixable: false },
  'nuxt-error-missing': { severity: 'info', autoFixable: false },
};

// ---------------------------------------------------------------------------
// Skill implementation
// ---------------------------------------------------------------------------

export class NuxtSkill extends BaseSkill {
  name = 'nuxt';
  version = '1.0.0';
  description = 'Nuxt 框架感知诊断';

  triggers: SkillTrigger[] = [
    { type: 'command', pattern: 'nuxt' },
    { type: 'keyword', pattern: /nuxt|nuxt\.js|nuxt 3|pinia/i },
  ];

  capabilities: SkillCapability[] = [
    { name: 'route-analysis', description: 'Analyze Nuxt routing conventions', autoFixable: false, riskLevel: 'low' },
    { name: 'ssr-checks', description: 'Detect SSR-related issues', autoFixable: false, riskLevel: 'medium' },
    { name: 'composables-checks', description: 'Check composable usage patterns', autoFixable: false, riskLevel: 'low' },
    { name: 'server-checks', description: 'Validate server-side patterns', autoFixable: false, riskLevel: 'medium' },
  ];

  ruleMeta = RULE_META;

  // ---------------------------------------------------------------------------
  // Diagnose
  // ---------------------------------------------------------------------------

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    try {
      const { tools, logger } = context;
      const projectPath = context.project.path;
      const diagnoses: Diagnosis[] = [];

      // 1. Check if this is a Nuxt project
      const isNuxt = await this.isNuxtProject(projectPath, tools);
      if (!isNuxt) {
        logger.debug('Not a Nuxt project, skipping nuxt skill');
        return [];
      }

      logger.info('Nuxt project detected, running diagnostics...');

      // 2. Check for missing error.vue
      const hasErrorVue = await tools.fs.exists(path.join(projectPath, 'app', 'error.vue'));
      if (!hasErrorVue) {
        diagnoses.push({
          id: generateId(),
          skill: this.name,
          type: 'best-practice',
          severity: 'info',
          title: 'Missing error boundary',
          description: '项目中缺少 app/error.vue 错误边界文件。建议添加全局错误处理页面以优雅处理运行时错误。',
          location: { file: path.join(projectPath, 'app', 'error.vue') },
          metadata: { ruleId: 'nuxt-error-missing', fixable: false },
        });
      }

      // 3. Find all page files
      const pageFiles = await this.findPageFiles(projectPath, tools);

      for (const pageFile of pageFiles) {
        const fullFilePath = path.join(projectPath, pageFile);

        try {
          const content = await tools.fs.readFile(fullFilePath);
          await this.analyzePageFile(fullFilePath, content, projectPath, diagnoses, tools, logger);
        } catch {
          logger.warn(`Failed to read page file: ${pageFile}`);
        }
      }

      // 4. Also scan non-page Vue files for DOM access and SSR misuse
      const vueFiles = await tools.fs.glob('**/*.vue');
      for (const vueFile of vueFiles) {
        // Skip already-analyzed page files
        if (pageFiles.includes(vueFile)) continue;
        // Skip node_modules
        if (vueFile.includes('node_modules')) continue;

        const fullFilePath = path.join(projectPath, vueFile);
        try {
          const content = await tools.fs.readFile(fullFilePath);
          await this.analyzeVueFile(fullFilePath, content, projectPath, diagnoses, tools, logger);
        } catch {
          logger.warn(`Failed to read Vue file: ${vueFile}`);
        }
      }

      // 5. Scan script files for client secrets and hardcoded URLs
      const scriptFiles = await tools.fs.glob('**/*.{ts,js,mjs}');
      for (const scriptFile of scriptFiles) {
        if (scriptFile.includes('node_modules')) continue;
        if (scriptFile.includes('.nuxt')) continue;

        const fullFilePath = path.join(projectPath, scriptFile);
        try {
          const content = await tools.fs.readFile(fullFilePath);
          await this.analyzeScriptFile(fullFilePath, content, projectPath, diagnoses, tools, logger);
        } catch {
          logger.warn(`Failed to read script file: ${scriptFile}`);
        }
      }

      return diagnoses;
    } catch (error) {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Fix
  // ---------------------------------------------------------------------------

  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    const rule = diagnosis.metadata?.ruleId as string | undefined;

    switch (rule) {
      case 'nuxt-image-missing':
        return this.fixNuxtImage(diagnosis, context);
      case 'nuxt-link-missing':
        return this.fixNuxtLink(diagnosis, context);
      default:
        throw new Error(`Skill ${this.name} does not support auto-fix for rule: ${rule}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async isNuxtProject(projectPath: string, tools: SkillContext['tools']): Promise<boolean> {
    // Check nuxt.config.ts
    if (await tools.fs.exists(path.join(projectPath, 'nuxt.config.ts'))) {
      return true;
    }
    if (await tools.fs.exists(path.join(projectPath, 'nuxt.config.js'))) {
      return true;
    }

    // Check for nuxt in package.json dependencies
    try {
      const pkgContent = await tools.fs.readFile(path.join(projectPath, 'package.json'));
      const pkg = JSON.parse(pkgContent);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.nuxt || deps['nuxt3']) {
        return true;
      }
    } catch {
      // package.json not found or invalid
    }

    // Check for pages/ directory with .vue files (Nuxt convention)
    try {
      const vueFiles = await tools.fs.glob('pages/**/*.vue');
      if (vueFiles.length > 0) {
        return true;
      }
    } catch {
      // glob failed
    }

    // For virtual FS / single file scenarios: check for .vue files in pages/ or app/ paths
    try {
      const allVueFiles = await tools.fs.glob('**/*.vue');
      if (allVueFiles.some(f => f.includes('/pages/') || f.includes('/app/') || f.startsWith('pages/') || f.startsWith('app/'))) {
        return true;
      }
    } catch {
      // glob failed
    }

    return false;
  }

  private async findPageFiles(_projectPath: string, tools: SkillContext['tools']): Promise<string[]> {
    try {
      return await tools.fs.glob('pages/**/*.vue');
    } catch {
      return [];
    }
  }

  private async analyzePageFile(
    fullFilePath: string,
    content: string,
    projectPath: string,
    diagnoses: Diagnosis[],
    tools: SkillContext['tools'],
    logger: SkillContext['logger'],
  ): Promise<void> {
    await this.analyzeVueFile(fullFilePath, content, projectPath, diagnoses, tools, logger);
    this.checkDefinePageMeta(fullFilePath, content, diagnoses);
  }

  private async analyzeVueFile(
    fullFilePath: string,
    content: string,
    _projectPath: string,
    diagnoses: Diagnosis[],
    _tools: SkillContext['tools'],
    logger: SkillContext['logger'],
  ): Promise<void> {
    const vueAst = parseVueFile(content, fullFilePath);
    if (!vueAst) {
      logger.warn(`Failed to parse Vue file: ${fullFilePath}`);
      return;
    }

    // Check <img> without NuxtImg (when @nuxt/image is installed)
    const imgIssues = this.detectImgWithoutNuxtImg(vueAst);
    for (const issue of imgIssues) {
      diagnoses.push({
        id: generateId(),
        skill: this.name,
        type: 'best-practice',
        severity: 'warning',
        title: 'Missing NuxtImage usage',
        description: '使用了 <img> 标签而非 <NuxtImg> 组件。Nuxt Image 提供自动优化、懒加载和响应式图片支持。',
        location: { file: fullFilePath, line: issue.line, column: issue.column },
        evidence: { type: 'code' as const, content: issue.snippet },
        metadata: { ruleId: 'nuxt-image-missing', fixable: true },
        fixSuggestion: {
          description: `将 <img> 替换为 <NuxtImg>`,
          code: issue.fixCode,
          autoApplicable: true,
          riskLevel: 'low',
        },
      });
    }

    // Check <a href="/..."> instead of <NuxtLink>
    const linkIssues = this.detectAnchorWithoutNuxtLink(vueAst);
    for (const issue of linkIssues) {
      diagnoses.push({
        id: generateId(),
        skill: this.name,
        type: 'best-practice',
        severity: 'warning',
        title: 'Missing NuxtLink usage',
        description: '使用了 <a href> 标签而非 <NuxtLink> 组件。NuxtLink 提供客户端导航和预取优化。',
        location: { file: fullFilePath, line: issue.line, column: issue.column },
        evidence: { type: 'code' as const, content: issue.snippet },
        metadata: { ruleId: 'nuxt-link-missing', fixable: true },
        fixSuggestion: {
          description: `将 <a href> 替换为 <NuxtLink to>`,
          code: issue.fixCode,
          autoApplicable: true,
          riskLevel: 'low',
        },
      });
    }

    // Check direct DOM manipulation in script
    const domIssues = this.detectDirectDomAccess(vueAst);
    for (const issue of domIssues) {
      diagnoses.push({
        id: generateId(),
        skill: this.name,
        type: 'code-quality',
        severity: 'warning',
        title: 'Direct DOM manipulation',
        description: issue.message,
        location: { file: fullFilePath, line: issue.line, column: issue.column },
        evidence: { type: 'code' as const, content: issue.snippet },
        metadata: { ruleId: 'nuxt-dom-access', fixable: false },
      });
    }

    // Check window/document access without process.client guard
    const ssrIssues = this.detectSsrMisuse(vueAst);
    for (const issue of ssrIssues) {
      diagnoses.push({
        id: generateId(),
        skill: this.name,
        type: 'functionality',
        severity: 'warning',
        title: 'SSR misuse - browser API without client guard',
        description: issue.message,
        location: { file: fullFilePath, line: issue.line, column: issue.column },
        evidence: { type: 'code' as const, content: issue.snippet },
        metadata: { ruleId: 'nuxt-ssr-misuse', fixable: false },
      });
    }

    // Check for client-side secrets in Vue script
    if (vueAst.scriptAST) {
      const astFile = {
        ast: vueAst.scriptAST,
        lines: vueAst.lines,
        source: content,
        filePath: fullFilePath,
      };
      this.detectClientSecrets(astFile as any, fullFilePath, diagnoses);
      this.detectHardcodedUrls(astFile as any, fullFilePath, diagnoses);
    }
  }

  private async analyzeScriptFile(
    fullFilePath: string,
    content: string,
    _projectPath: string,
    diagnoses: Diagnosis[],
    _tools: SkillContext['tools'],
    _logger: SkillContext['logger'],
  ): Promise<void> {
    const astFile = parseFile(fullFilePath, content);
    if (!astFile) {
      return;
    }

    // Check for client-side secrets
    this.detectClientSecrets(astFile, fullFilePath, diagnoses);

    // Check for hardcoded API URLs
    this.detectHardcodedUrls(astFile, fullFilePath, diagnoses);

    // Check for window/document usage without process.client guard
    this.detectSsrMisuseInScript(astFile, fullFilePath, diagnoses);
  }

  // ---------------------------------------------------------------------------
  // Detection methods
  // ---------------------------------------------------------------------------

  /** Detect <img> elements that should use <NuxtImg> */
  private detectImgWithoutNuxtImg(
    vueAst: ReturnType<typeof parseVueFile>
  ): Array<{ line: number; column: number; snippet: string; fixCode: string; originalLine: string }> {
    const results: Array<{ line: number; column: number; snippet: string; fixCode: string; originalLine: string }> = [];

    if (!vueAst || !vueAst.templateBody) return results;

    const elements = findVElements(vueAst.templateBody);

    for (const el of elements) {
      if (el.name !== 'img') continue;

      const attrs = el.startTag?.attributes ?? [];
      const srcAttr = attrs.find((a: any) => !a.directive && a.key?.name === 'src');
      if (!srcAttr) continue;

      const loc = el.loc;
      const line = loc?.start?.line ?? 0;
      const column = loc?.start?.column ?? 0;
      const snippet = vueAst.lines[line - 1]?.trim() ?? '';

      // Build replacement
      const nuxtImgAttrs = attrs
        .map((attr: any) => this.vueAttrToString(attr))
        .join(' ');

      // Map common img attributes to NuxtImg equivalents
      const fixCode = `<NuxtImg ${nuxtImgAttrs} />`;

      results.push({ line, column, snippet, fixCode, originalLine: snippet });
    }

    return results;
  }

  /** Detect <a href="/..."> that should use <NuxtLink> */
  private detectAnchorWithoutNuxtLink(
    vueAst: ReturnType<typeof parseVueFile>
  ): Array<{ line: number; column: number; snippet: string; fixCode: string }> {
    const results: Array<{ line: number; column: number; snippet: string; fixCode: string }> = [];

    if (!vueAst || !vueAst.templateBody) return results;

    const elements = findVElements(vueAst.templateBody);

    for (const el of elements) {
      if (el.name !== 'a') continue;

      const attrs = el.startTag?.attributes ?? [];
      const hrefAttr = attrs.find((a: any) => {
        if (a.directive) return false;
        return a.key?.name === 'href';
      });
      if (!hrefAttr) continue;

      // Check if href is an internal route (starts with / or is a relative path without protocol)
      let hrefValue = '';
      if (hrefAttr.value) {
        hrefValue = hrefAttr.value.value ?? '';
      }
      // Skip external links
      if (hrefValue.startsWith('http://') || hrefValue.startsWith('https://') || hrefValue.startsWith('//') || hrefValue.startsWith('mailto:') || hrefValue.startsWith('tel:')) {
        continue;
      }

      const loc = el.loc;
      const line = loc?.start?.line ?? 0;
      const column = loc?.start?.column ?? 0;
      const snippet = vueAst.lines[line - 1]?.trim() ?? '';

      // Build replacement - collect all attributes except href
      const otherAttrs = attrs
        .filter((a: any) => a !== hrefAttr)
        .map((a: any) => this.vueAttrToString(a))
        .join(' ');

      // Get text content
      const textContent = this.extractTextContent(el);

      const attrsStr = otherAttrs ? ` ${otherAttrs}` : '';
      const fixCode = `<NuxtLink to="${hrefValue}"${attrsStr}>${textContent}</NuxtLink>`;

      results.push({ line, column, snippet, fixCode });
    }

    return results;
  }

  /** Detect direct DOM manipulation in Vue script sections */
  private detectDirectDomAccess(
    vueAst: ReturnType<typeof parseVueFile>
  ): Array<{ line: number; column: number; message: string; snippet: string }> {
    const results: Array<{ line: number; column: number; message: string; snippet: string }> = [];

    if (!vueAst || !vueAst.scriptAST) return results;

    walkAST(vueAst.scriptAST, (node) => {
      // document.querySelector(), document.getElementById(), etc.
      if (
        node.type === AST_NODE_TYPES.CallExpression &&
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.object.type === AST_NODE_TYPES.Identifier &&
        node.callee.object.name === 'document' &&
        node.callee.property.type === AST_NODE_TYPES.Identifier &&
        [
          'querySelector',
          'querySelectorAll',
          'getElementById',
          'getElementsByClassName',
          'createElement',
        ].includes(node.callee.property.name)
      ) {
        const loc = node.loc;
        results.push({
          line: loc?.start.line ?? 0,
          column: loc?.start.column ?? 0,
          message: `直接使用 document.${node.callee.property.name}() 违反 Vue/Nuxt 数据驱动理念，建议使用 ref 或 useTemplateRef`,
          snippet: vueAst.lines[loc!.start.line - 1]?.trim() ?? '',
        });
        return;
      }

      // document.xxx = ... (direct DOM mutation) or document.title access
      if (
        node.type === AST_NODE_TYPES.MemberExpression &&
        node.object.type === AST_NODE_TYPES.Identifier &&
        node.object.name === 'document'
      ) {
        // Skip if this is the right-hand side of a call expression we already handled
        if (
          node.parent?.type === AST_NODE_TYPES.CallExpression &&
          (node.parent as TSESTree.CallExpression).callee === node
        ) {
          return;
        }
        const loc = node.loc;
        results.push({
          line: loc?.start.line ?? 0,
          column: loc?.start.column ?? 0,
          message: `直接访问 document.${(node.property as TSESTree.Identifier).name} 违反 SSR 安全实践。建议使用 useHead() 或 template ref。`,
          snippet: vueAst.lines[loc!.start.line - 1]?.trim() ?? '',
        });
      }
    });

    return results;
  }

  /** Detect window/document usage without process.client guard in Vue script */
  private detectSsrMisuse(
    vueAst: ReturnType<typeof parseVueFile>
  ): Array<{ line: number; column: number; message: string; snippet: string }> {
    const results: Array<{ line: number; column: number; message: string; snippet: string }> = [];

    if (!vueAst || !vueAst.scriptAST) return results;

    this._detectBrowserApiAccess(vueAst.scriptAST, vueAst.lines, results);

    // Detect anti-pattern: fetch/axios inside onMounted (should use useFetch for SSR)
    this._detectFetchInOnMounted(vueAst.scriptAST, vueAst.lines, results);

    return results;
  }

  /** Detect fetch/axios inside onMounted — anti-pattern in Nuxt SSR apps */
  private _detectFetchInOnMounted(
    ast: TSESTree.Program,
    lines: string[],
    results: Array<{ line: number; column: number; message: string; snippet: string }>,
  ): void {
    walkAST(ast, (node) => {
      if (
        node.type === AST_NODE_TYPES.CallExpression &&
        node.callee.type === AST_NODE_TYPES.Identifier &&
        node.callee.name === 'onMounted'
      ) {
        // onMounted found — check if its callback body contains fetch/axios/XMLHttpRequest
        if (node.arguments.length > 0) {
          const cb = node.arguments[0];
          let hasFetch = false;
          let fetchLine = 0;
          walkAST(cb, (inner) => {
            if (
              inner.type === AST_NODE_TYPES.CallExpression &&
              inner.callee.type === AST_NODE_TYPES.Identifier &&
              (inner.callee.name === 'fetch' || inner.callee.name === 'axios')
            ) {
              hasFetch = true;
              fetchLine = inner.loc?.start.line ?? 0;
            }
          });
          if (hasFetch) {
            results.push({
              line: fetchLine,
              column: 0,
              message: '在 onMounted 中调用 fetch 绕过 SSR 数据获取。建议使用 useFetch / useAsyncData 在服务端获取数据以提升首屏性能。',
              snippet: lines[fetchLine - 1]?.trim() ?? '',
            });
          }
        }
      }
    });
  }

  /** Detect window/document usage without process.client guard in standalone script files */
  private detectSsrMisuseInScript(
    astFile: ReturnType<typeof parseFile>,
    filePath: string,
    diagnoses: Diagnosis[],
  ): void {
    if (!astFile) return;

    const results: Array<{ line: number; column: number; message: string; snippet: string }> = [];
    this._detectBrowserApiAccess(astFile.ast, astFile.lines, results);

    for (const issue of results) {
      diagnoses.push({
        id: generateId(),
        skill: this.name,
        type: 'functionality',
        severity: 'warning',
        title: 'SSR misuse - browser API without client guard',
        description: issue.message,
        location: { file: filePath, line: issue.line, column: issue.column },
        evidence: { type: 'code' as const, content: issue.snippet },
        metadata: { ruleId: 'nuxt-ssr-misuse', fixable: false },
      });
    }
  }

  /** Core browser API access detection with process.client guard check */
  private _detectBrowserApiAccess(
    ast: TSESTree.Program,
    lines: string[],
    results: Array<{ line: number; column: number; message: string; snippet: string }>,
  ): void {
    walkAST(ast, (node) => {
      // window.xxx, window.addEventListener, etc.
      if (
        node.type === AST_NODE_TYPES.MemberExpression &&
        node.object.type === AST_NODE_TYPES.Identifier &&
        node.object.name === 'window'
      ) {
        if (!this.isInsideProcessClientCheck(ast, node)) {
          const loc = node.loc;
          results.push({
            line: loc?.start.line ?? 0,
            column: loc?.start.column ?? 0,
            message: `在 SSR 上下文中直接访问 window 对象可能导致错误。请使用 process.client 或 onMounted 包装。`,
            snippet: lines[loc!.start.line - 1]?.trim() ?? '',
          });
        }
      }

      // document.xxx (but not document in the context of Nuxt's document.head etc.)
      if (
        node.type === AST_NODE_TYPES.MemberExpression &&
        node.object.type === AST_NODE_TYPES.Identifier &&
        node.object.name === 'document'
      ) {
        if (!this.isInsideProcessClientCheck(ast, node)) {
          const loc = node.loc;
          results.push({
            line: loc?.start.line ?? 0,
            column: loc?.start.column ?? 0,
            message: `在 SSR 上下文中直接访问 document 对象可能导致错误。请使用 process.client 或 onMounted 包装。`,
            snippet: lines[loc!.start.line - 1]?.trim() ?? '',
          });
        }
      }

      // localStorage, sessionStorage, navigator
      if (
        node.type === AST_NODE_TYPES.Identifier &&
        ['localStorage', 'sessionStorage', 'navigator'].includes(node.name)
      ) {
        // Check it's not just a variable declaration with same name
        const parent = this.findParentNode(ast, node);
        if (parent && (
          parent.type === AST_NODE_TYPES.VariableDeclarator ||
          parent.type === AST_NODE_TYPES.Property ||
          parent.type === AST_NODE_TYPES.PropertyDefinition
        )) {
          return;
        }

        if (!this.isInsideProcessClientCheck(ast, node)) {
          const loc = node.loc;
          results.push({
            line: loc?.start.line ?? 0,
            column: loc?.start.column ?? 0,
            message: `在 SSR 上下文中直接访问 ${node.name} 可能导致错误。请使用 process.client 或 onMounted 包装。`,
            snippet: lines[loc!.start.line - 1]?.trim() ?? '',
          });
        }
      }
    });
  }

  /** Find the parent of a node in the AST */
  private findParentNode(ast: TSESTree.Program, target: TSESTree.Node): TSESTree.Node | null {
    let found: TSESTree.Node | null = null;
    walkAST(ast, (node) => {
      for (const key of Object.keys(node)) {
        if (key === 'parent') continue;
        const child = (node as unknown as Record<string, unknown>)[key];
        if (child === target) {
          found = node;
          return;
        }
      }
    });
    return found;
  }

  /** Check if a node is inside a process.client or import.meta.client guard */
  private isInsideProcessClientCheck(ast: TSESTree.Program, target: TSESTree.Node): boolean {
    const ancestors = this.getAncestors(ast, target);

    for (const ancestor of ancestors) {
      // Check if (process.client) { ... }
      if (ancestor.type === AST_NODE_TYPES.IfStatement) {
        const ifStmt = ancestor as TSESTree.IfStatement;
        if (this.isProcessClientExpr(ifStmt.test)) {
          // Check if target is in the consequent (the true branch)
          if (this.isNodeInside(ifStmt.consequent, target)) {
            return true;
          }
        }
      }

      // Check process.client && ...
      if (ancestor.type === AST_NODE_TYPES.LogicalExpression) {
        const logExpr = ancestor as TSESTree.LogicalExpression;
        if (logExpr.operator === '&&' && this.isProcessClientExpr(logExpr.left)) {
          if (this.isNodeInside(logExpr.right, target)) {
            return true;
          }
        }
      }

      // Check onMounted(() => { ... })
      if (ancestor.type === AST_NODE_TYPES.CallExpression) {
        const callExpr = ancestor as TSESTree.CallExpression;
        if (
          callExpr.callee.type === AST_NODE_TYPES.Identifier &&
          callExpr.callee.name === 'onMounted'
        ) {
          if (callExpr.arguments.length > 0) {
            const cb = callExpr.arguments[0];
            if (this.isNodeInside(cb, target)) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  /** Check if an expression is process.client or import.meta.client */
  private isProcessClientExpr(node: TSESTree.Node | null): boolean {
    if (!node) return false;

    // process.client
    if (
      node.type === AST_NODE_TYPES.MemberExpression &&
      node.object.type === AST_NODE_TYPES.Identifier &&
      node.object.name === 'process' &&
      node.property.type === AST_NODE_TYPES.Identifier &&
      node.property.name === 'client'
    ) {
      return true;
    }

    // import.meta.client (Nuxt 3)
    if (
      node.type === AST_NODE_TYPES.MemberExpression &&
      node.object.type === AST_NODE_TYPES.MetaProperty &&
      node.object.meta.name === 'import' &&
      node.object.property.name === 'meta' &&
      node.property.type === AST_NODE_TYPES.Identifier &&
      node.property.name === 'client'
    ) {
      return true;
    }

    return false;
  }

  /** Check if target node is inside the given container node */
  private isNodeInside(container: TSESTree.Node, target: TSESTree.Node): boolean {
    if (!container.range || !target.range) return false;
    return container.range[0] <= target.range[0] && container.range[1] >= target.range[1];
  }

  /** Get all ancestor nodes of a target node */
  private getAncestors(ast: TSESTree.Program, target: TSESTree.Node): TSESTree.Node[] {
    const ancestors: TSESTree.Node[] = [];

    walkAST(ast, (node) => {
      for (const key of Object.keys(node)) {
        if (key === 'parent') continue;
        const child = (node as unknown as Record<string, unknown>)[key];
        if (child === target) {
          ancestors.push(node);
        }
      }
    });

    // Build chain of ancestors
    const chain: TSESTree.Node[] = [];
    let current: TSESTree.Node | undefined = target;

    // We need a parent map approach
    const parentMap = new WeakMap<TSESTree.Node, TSESTree.Node>();
    this.buildParentMap(ast, parentMap);

    while (current) {
      const parent = parentMap.get(current);
      if (!parent || parent === ast) break;
      chain.push(parent);
      current = parent;
    }

    return chain;
  }

  /** Build a parent map for the AST */
  private buildParentMap(
    ast: TSESTree.Node,
    parentMap: WeakMap<TSESTree.Node, TSESTree.Node>,
  ): void {
    walkAST(ast, (node) => {
      for (const key of Object.keys(node)) {
        if (key === 'parent') continue;
        const child = (node as unknown as Record<string, unknown>)[key];
        if (child && typeof child === 'object') {
          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && 'type' in item) {
                parentMap.set(item as TSESTree.Node, node);
              }
            }
          } else if ('type' in child) {
            parentMap.set(child as TSESTree.Node, node);
          }
        }
      }
    });
  }

  /** Check for client-side secrets */
  private detectClientSecrets(
    astFile: ReturnType<typeof parseFile>,
    filePath: string,
    diagnoses: Diagnosis[],
  ): void {
    if (!astFile) return;

    const secretPatterns = [
      { pattern: /api[_-]?key\s*=\s*["'][^"']+["']/i, name: 'API Key' },
      { pattern: /secret[_-]?key\s*=\s*["'][^"']+["']/i, name: 'Secret Key' },
      { pattern: /token\s*=\s*["'][^"']+["']/i, name: 'Token' },
      { pattern: /password\s*=\s*["'][^"']+["']/i, name: 'Password' },
      { pattern: /private[_-]?key\s*=\s*["'][^"']+["']/i, name: 'Private Key' },
    ];

    const lines = astFile.lines;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { pattern, name } of secretPatterns) {
        if (pattern.test(line)) {
          // Check if it's using process.env or useRuntimeConfig
          if (line.includes('process.env') || line.includes('useRuntimeConfig') || line.includes('useRuntimeConfig()')) {
            continue;
          }
          diagnoses.push({
            id: generateId(),
            skill: this.name,
            type: 'security',
            severity: 'critical',
            title: 'Hardcoded secret in client-side code',
            description: `检测到硬编码的 ${name}。敏感信息应通过 Nuxt 的 useRuntimeConfig 或服务端 API 访问，不应暴露在客户端代码中。`,
            location: { file: filePath, line: i + 1 },
            evidence: { type: 'code' as const, content: line.trim() },
            metadata: { ruleId: 'nuxt-client-secret', fixable: false },
          });
        }
      }
    }
  }

  /** Check for hardcoded API URLs instead of using runtimeConfig */
  private detectHardcodedUrls(
    astFile: ReturnType<typeof parseFile>,
    filePath: string,
    diagnoses: Diagnosis[],
  ): void {
    if (!astFile) return;

    // Skip server-side files (server/ directory) since they can use env vars directly
    if (filePath.includes('/server/') || filePath.includes('\\server\\')) return;

    // Skip config files
    if (filePath.includes('nuxt.config') || filePath.includes('runtime.config')) return;

    const urlPattern = /https?:\/\/[^\s"']+/g;
    const lines = astFile.lines;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip comments
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      // Skip strings that reference process.env or useRuntimeConfig
      if (line.includes('process.env') || line.includes('useRuntimeConfig')) continue;

      const matches = line.match(urlPattern);
      if (matches) {
        for (const url of matches) {
          // Skip common non-API URLs
          if (
            url.includes('github.com') ||
            url.includes('schema.org') ||
            url.includes('w3.org') ||
            url.includes('node_modules') ||
            url.includes('unpkg.com') ||
            url.includes('cdn.jsdelivr.net')
          ) {
            continue;
          }

          diagnoses.push({
            id: generateId(),
            skill: this.name,
            type: 'best-practice',
            severity: 'warning',
            title: 'Hardcoded API URL',
            description: '检测到硬编码的 API URL。建议使用 useRuntimeConfig 管理 API 地址，以便在不同环境中灵活配置。',
            location: { file: filePath, line: i + 1 },
            evidence: { type: 'code' as const, content: line.trim() },
            metadata: { ruleId: 'nuxt-hardcoded-url', fixable: false },
          });
        }
      }
    }
  }

  /** Check for missing definePageMeta in route pages (Nuxt 3 convention) */
  private checkDefinePageMeta(
    filePath: string,
    content: string,
    diagnoses: Diagnosis[],
  ): void {
    // Skip index pages and layout pages
    const basename = path.basename(filePath);
    if (basename === 'index.vue') return;

    // Check if file has a <script> section
    if (!content.includes('<script')) return;

    // Check if definePageMeta is called
    const hasDefinePageMeta = /definePageMeta\s*\(/.test(content);

    if (!hasDefinePageMeta) {
      diagnoses.push({
        id: generateId(),
        skill: this.name,
        type: 'best-practice',
        severity: 'info',
        title: 'Missing definePageMeta',
        description: `页面文件 ${path.relative(process.cwd(), filePath)} 缺少 definePageMeta() 调用。建议使用 definePageMeta 配置页面元数据（如 layout、middleware、meta 等）。`,
        location: { file: filePath, line: 1 },
        metadata: { ruleId: 'nuxt-pagemeta-missing', fixable: false },
        fixSuggestion: {
          description: '添加 definePageMeta 调用',
          code: `<script setup lang="ts">\ndefinePageMeta({\n  // 配置页面元数据\n})\n</script>`,
          autoApplicable: false,
          riskLevel: 'low',
        },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Fix implementations
  // ---------------------------------------------------------------------------

  private async fixNuxtImage(_diagnosis: Diagnosis, _context: SkillContext): Promise<Fix> {
    const location = _diagnosis.location;
    const fixCode = _diagnosis.fixSuggestion?.code;

    if (!location.file || !fixCode) {
      throw new Error('Cannot fix: missing location or fix code');
    }

    const change: FileChange = {
      file: location.file,
      type: 'replace',
      position: { line: location.line ?? 1 },
      content: fixCode,
      oldContent: location.file ? '' : undefined,
    };

    return {
      id: generateId(),
      diagnosisId: _diagnosis.id,
      description: '将 <img> 替换为 <NuxtImg>',
      changes: [change],
      riskLevel: 'low',
      autoApplicable: true,
    };
  }

  private async fixNuxtLink(_diagnosis: Diagnosis, _context: SkillContext): Promise<Fix> {
    const location = _diagnosis.location;
    const fixCode = _diagnosis.fixSuggestion?.code;

    if (!location.file || !fixCode) {
      throw new Error('Cannot fix: missing location or fix code');
    }

    const change: FileChange = {
      file: location.file,
      type: 'replace',
      position: { line: location.line ?? 1 },
      content: fixCode,
      oldContent: location.file ? '' : undefined,
    };

    return {
      id: generateId(),
      diagnosisId: _diagnosis.id,
      description: '将 <a href> 替换为 <NuxtLink to>',
      changes: [change],
      riskLevel: 'low',
      autoApplicable: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Vue attribute serialization helpers
  // ---------------------------------------------------------------------------

  private vueAttrToString(attr: any): string {
    if (!attr) return '';

    // Directive: v-bind:src="..."
    if (attr.directive) {
      const keyName = attr.key?.name?.name ?? '';
      const argName = attr.key?.argument?.name ?? '';
      if (keyName === 'bind') {
        return `:${argName}="${this.extractAttrValue(attr.value)}"`;
      }
      if (keyName === 'on') {
        return `@${argName}="..."`;
      }
      return `v-${keyName}="..."`;
    }

    // Regular attribute
    const keyName = attr.key?.name ?? '';
    if (attr.value) {
      return `${keyName}="${attr.value.value ?? ''}"`;
    }
    return keyName;
  }

  private extractAttrValue(value: any): string {
    if (!value) return '""';
    if (typeof value === 'string') return `"${value}"`;
    if (value.value !== undefined) return `"${value.value}"`;
    return '""';
  }

  private extractTextContent(el: any): string {
    if (!el.children || el.children.length === 0) return '';

    let text = '';
    for (const child of el.children) {
      if (child.type === 'VText') {
        text += child.value ?? '';
      } else if (child.type === 'VExpressionContainer') {
        text += '{{ expression }}';
      }
    }

    return text.trim() || 'Link';
  }
}

export default NuxtSkill;
