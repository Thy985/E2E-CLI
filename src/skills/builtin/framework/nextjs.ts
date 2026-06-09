/**
 * Next.js Skill
 * Detects Next.js-specific issues using AST analysis:
 * - Missing next/image usage
 * - Missing link optimization
 * - Missing loading.tsx for dynamic routes
 * - Missing error.tsx for route boundaries
 * - Server component using client-only hooks
 * - Missing metadata export in layout/page components
 * - Direct API calls in client components
 * - Missing next.config.js optimization settings
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
  findNodesByType,
} from '../../../utils/ast-analyzer';
import * as path from 'path';

export class NextJSSkill extends BaseSkill {
  name = 'nextjs';
  version = '1.0.0';
  description = 'Next.js 框架感知诊断';

  triggers = [
    { type: 'command' as const, pattern: 'nextjs' },
    { type: 'keyword' as const, pattern: /next\.js|nextjs|app router|pages router/i },
  ];

  capabilities = [
    {
      name: 'route-analysis',
      description: '分析 Next.js 路由文件结构',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
    {
      name: 'image-optimization',
      description: '检查 next/image 使用情况',
      autoFixable: true,
      riskLevel: 'low' as const,
    },
    {
      name: 'link-checks',
      description: '检查 next/link 使用情况',
      autoFixable: true,
      riskLevel: 'low' as const,
    },
    {
      name: 'middleware-checks',
      description: '检查中间件配置',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
    {
      name: 'server-client-checks',
      description: '检查服务端/客户端组件混用问题',
      autoFixable: false,
      riskLevel: 'medium' as const,
    },
  ];

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    try {
      const diagnoses: Diagnosis[] = [];
      const { project, tools, logger } = context;

      logger.info('Starting Next.js framework analysis...');

      // Detect if this is a Next.js project
      const isNextProject = await this.isNextJsProject(project.path, tools);
      if (!isNextProject) {
        logger.info('Not a Next.js project, skipping analysis');
        return [];
      }

      logger.debug('Next.js project detected');

      // Collect route files for analysis
      const routeFiles = await this.getRouteFiles(project.path, tools);
      logger.debug(`Found ${routeFiles.length} Next.js route files`);

      // Collect all tsx/jsx files for component analysis
      const componentFiles = await this.getComponentFiles(project.path, tools);
      logger.debug(`Found ${componentFiles.length} component files`);

      // Check structural issues (loading.tsx, error.tsx, metadata)
      const structuralDiagnoses = await this.checkStructure(project.path, routeFiles, tools);
      diagnoses.push(...structuralDiagnoses);

      // Check component-level issues
      for (const file of componentFiles) {
        try {
          const content = await tools.fs.readFile(file);
          const fileDiagnoses = await this.checkFile(file, content);
          diagnoses.push(...fileDiagnoses);
        } catch {
          // Skip files that cannot be read
        }
      }

      // Check next.config.js
      const configDiagnoses = await this.checkNextConfig(project.path, tools);
      diagnoses.push(...configDiagnoses);

      logger.info(`Next.js analysis completed, found ${diagnoses.length} issues`);
      return diagnoses;
    } catch (error) {
      return [];
    }
  }

  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    const ruleId = diagnosis.metadata?.ruleId;
    const filePath = diagnosis.location.file;
    const content = await context.tools.fs.readFile(filePath);

    let changes: FileChange[] = [];

    switch (ruleId) {
      case 'next-image-missing':
        changes = this.fixImageMissing(content, diagnosis);
        break;
      case 'next-link-missing':
        changes = this.fixLinkMissing(content, diagnosis);
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

  // -------------------------------------------------------------------------
  // Project Detection
  // -------------------------------------------------------------------------

  private async isNextJsProject(projectPath: string, tools: SkillContext['tools']): Promise<boolean> {
    // Check for 'next' dependency in package.json
    try {
      const pkgContent = await tools.fs.readFile(path.join(projectPath, 'package.json'));
      const pkg = JSON.parse(pkgContent);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.next) return true;
    } catch {
      // package.json not found or parse error
    }

    // Check for pages/ or app/ directories
    const hasPagesDir = await tools.fs.exists(path.join(projectPath, 'pages'));
    const hasAppDir = await tools.fs.exists(path.join(projectPath, 'app'));
    if (hasPagesDir || hasAppDir) return true;

    // For virtual FS / single file scenarios: check if any matched files
    // contain /pages/ or /app/ directory segments
    const patterns = [
      '**/pages/**/*.{tsx,jsx,ts,js}',
      '**/app/**/*.{tsx,jsx,ts,js}',
    ];
    for (const pattern of patterns) {
      const matches = await tools.fs.glob(pattern);
      if (matches.length > 0) return true;
    }

    return false;
  }

  // -------------------------------------------------------------------------
  // File Collection
  // -------------------------------------------------------------------------

  private async getRouteFiles(_projectPath: string, tools: SkillContext['tools']): Promise<string[]> {
    const patterns = [
      '**/pages/**/*.{tsx,jsx,ts,js}',
      '**/app/**/page.{tsx,jsx,ts,js}',
      '**/app/**/layout.{tsx,jsx,ts,js}',
    ];
    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await tools.fs.glob(pattern);
      files.push(...matches.filter(f =>
        !f.includes('node_modules') &&
        !f.includes('.d.ts')
      ));
    }
    return [...new Set(files)];
  }

  private async getComponentFiles(_projectPath: string, tools: SkillContext['tools']): Promise<string[]> {
    const patterns = [
      '**/*.tsx',
      '**/*.jsx',
    ];
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

  // -------------------------------------------------------------------------
  // Structure Checks
  // -------------------------------------------------------------------------

  private async checkStructure(
    projectPath: string,
    routeFiles: string[],
    tools: SkillContext['tools'],
  ): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];

    // Collect directory names from route files
    const appRouteDirs = new Set<string>();
    const pageRoutes = new Set<string>();

    for (const file of routeFiles) {
      const normalized = file.replace(/\\/g, '/');
      if (normalized.includes('/app/')) {
        const dir = normalized.substring(0, normalized.lastIndexOf('/'));
        appRouteDirs.add(dir);
      }
      if (normalized.endsWith('/page.') || normalized.endsWith('/layout.')) {
        pageRoutes.add(normalized);
      }
    }

    // Check for missing loading.tsx in dynamic route directories
    for (const dir of appRouteDirs) {
      // Dynamic route directories contain [slug] or [...]
      if (dir.includes('[') && dir.includes(']')) {
        const loadingPath = `${dir}/loading.tsx`;
        const hasLoading = await tools.fs.exists(path.join(projectPath, loadingPath));
        if (!hasLoading) {
          const meta = this.ruleMeta('next-loading-missing');
          diagnoses.push({
            id: `Next-${generateId()}`,
            skill: this.name,
            type: 'best-practice' as DiagnosisType,
            severity: meta.severity,
            title: meta.title,
            description: `动态路由目录 ${dir} 缺少 loading.tsx，建议添加加载状态组件`,
            location: { file: loadingPath },
            metadata: { ruleId: 'next-loading-missing', directory: dir },
            fixSuggestion: {
              description: meta.fixSuggestion,
              autoApplicable: false,
              riskLevel: 'low',
            },
          });
        }
      }

      // Check for missing error.tsx in route directories
      const errorPath = `${dir}/error.tsx`;
      const hasError = await tools.fs.exists(path.join(projectPath, errorPath));
      if (!hasError) {
        const meta = this.ruleMeta('next-error-missing');
        diagnoses.push({
          id: `Next-${generateId()}`,
          skill: this.name,
          type: 'best-practice' as DiagnosisType,
          severity: meta.severity,
          title: meta.title,
          description: `路由目录 ${dir} 缺少 error.tsx，建议添加错误边界组件`,
          location: { file: errorPath },
          metadata: { ruleId: 'next-error-missing', directory: dir },
          fixSuggestion: {
            description: meta.fixSuggestion,
            autoApplicable: false,
            riskLevel: 'low',
          },
        });
      }
    }

    // Check for missing metadata in layout/page files
    for (const file of routeFiles) {
      if (file.endsWith('/layout.tsx') || file.endsWith('/layout.jsx') ||
          file.endsWith('/page.tsx') || file.endsWith('/page.jsx')) {
        try {
          const content = await tools.fs.readFile(file);
          if (!this.hasMetadataExport(content)) {
            const meta = this.ruleMeta('next-metadata-missing');
            diagnoses.push({
              id: `Next-${generateId()}`,
              skill: this.name,
              type: 'best-practice' as DiagnosisType,
              severity: meta.severity,
              title: meta.title,
              description: `${file} 缺少 metadata 导出，建议添加 SEO 元数据`,
              location: { file },
              metadata: { ruleId: 'next-metadata-missing' },
              fixSuggestion: {
                description: meta.fixSuggestion,
                autoApplicable: false,
                riskLevel: 'low',
              },
            });
          }
        } catch {
          // Skip unreadable files
        }
      }
    }

    return diagnoses;
  }

  // -------------------------------------------------------------------------
  // File-Level AST Checks
  // -------------------------------------------------------------------------

  private async checkFile(filePath: string, content: string): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];
    const astFile = parseFile(filePath, content);
    if (!astFile) return diagnoses;

    const normalizedPath = filePath.replace(/\\/g, '/');
    const isInAppDir = normalizedPath.includes('/app/');
    const isClientComponent = this.isClientComponent(content);

    // 1. Check for <img> elements (missing next/image)
    if (normalizedPath.endsWith('.tsx') || normalizedPath.endsWith('.jsx')) {
      const imgResults = this.detectImageWithoutNextImage(astFile);
      for (const result of imgResults) {
        const meta = this.ruleMeta('next-image-missing');
        diagnoses.push(this.makeDiagnosis(filePath, 'next-image-missing', meta, result));
      }

      // 2. Check for <a href="..."> (missing next/link)
      const linkResults = this.detectAnchorWithoutNextLink(astFile);
      for (const result of linkResults) {
        const meta = this.ruleMeta('next-link-missing');
        diagnoses.push(this.makeDiagnosis(filePath, 'next-link-missing', meta, result));
      }
    }

    // 5. Check for server component using client-only hooks (without 'use client')
    if (isInAppDir && !isClientComponent) {
      const hookResults = this.detectClientHooksInServer(astFile);
      for (const result of hookResults) {
        const meta = this.ruleMeta('next-server-client-misuse');
        diagnoses.push(this.makeDiagnosis(filePath, 'next-server-client-misuse', meta, result));
      }
    }

    // 7. Check for direct API calls in client components
    if (isInAppDir && isClientComponent) {
      const apiResults = this.detectDirectApiCalls(astFile);
      for (const result of apiResults) {
        const meta = this.ruleMeta('next-api-client-misuse');
        diagnoses.push(this.makeDiagnosis(filePath, 'next-api-client-misuse', meta, result));
      }
    }

    return diagnoses;
  }

  // -------------------------------------------------------------------------
  // next.config.js Checks
  // -------------------------------------------------------------------------

  private async checkNextConfig(projectPath: string, tools: SkillContext['tools']): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];
    const configPath = path.join(projectPath, 'next.config.js');
    const configTsPath = path.join(projectPath, 'next.config.ts');
    const configMjsPath = path.join(projectPath, 'next.config.mjs');

    let configExists = false;
    let configContent = '';

    for (const p of [configPath, configTsPath, configMjsPath]) {
      const exists = await tools.fs.exists(p);
      if (exists) {
        configExists = true;
        try {
          configContent = await tools.fs.readFile(p);
        } catch {
          // Skip unreadable files
        }
        break;
      }
    }

    if (!configExists) {
      const meta = this.ruleMeta('next-config-missing');
      diagnoses.push({
        id: `Next-${generateId()}`,
        skill: this.name,
        type: 'best-practice' as DiagnosisType,
        severity: meta.severity,
        title: meta.title,
        description: '项目缺少 next.config.js 配置文件，建议添加优化设置（如 images.domains、compress、poweredByHeader）',
        location: { file: 'next.config.js' },
        metadata: { ruleId: 'next-config-missing' },
        fixSuggestion: {
          description: meta.fixSuggestion,
          autoApplicable: false,
          riskLevel: 'low',
        },
      });
    } else if (configContent) {
      // Check for missing optimization settings in the config
      if (!configContent.includes('compress') && !configContent.includes('compress:')) {
        // Could add a warning about missing compression
      }
      if (!configContent.includes('poweredByHeader') && !configContent.includes('poweredByHeader:')) {
        // Could add a warning about exposing Next.js header
      }
    }

    return diagnoses;
  }

  // -------------------------------------------------------------------------
  // AST Detection Methods
  // -------------------------------------------------------------------------

  /** Detect JSX <img> elements that should use next/image. */
  private detectImageWithoutNextImage(astFile: ReturnType<typeof parseFile>): Array<{
    ruleId: string;
    line: number;
    column: number;
    snippet: string;
  }> {
    const results: Array<{ ruleId: string; line: number; column: number; snippet: string }> = [];
    if (!astFile) return results;
    const imgNodes = findNodesByType(astFile.ast, 'JSXOpeningElement' as any);

    for (const node of imgNodes as any[]) {
      if (node.name.type === 'JSXIdentifier' && node.name.name === 'img') {
        const loc = node.loc;
        results.push({
          ruleId: 'next-image-missing',
          line: loc?.start.line ?? 0,
          column: loc?.start.column ?? 0,
          snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
        });
      }
    }

    return results;
  }

  /** Detect JSX <a href="..."> elements that should use next/link. */
  private detectAnchorWithoutNextLink(astFile: ReturnType<typeof parseFile>): Array<{
    ruleId: string;
    line: number;
    column: number;
    snippet: string;
  }> {
    const results: Array<{ ruleId: string; line: number; column: number; snippet: string }> = [];
    if (!astFile) return results;
    const anchorNodes = findNodesByType(astFile.ast, 'JSXOpeningElement' as any);

    for (const node of anchorNodes as any[]) {
      if (node.name.type === 'JSXIdentifier' && node.name.name === 'a') {
        // Check for internal href (starts with / or relative without protocol)
        const hasInternalHref = node.attributes.some((attr: any) => {
          if (
            attr.type === 'JSXAttribute' &&
            attr.name.type === 'JSXIdentifier' &&
            attr.name.name === 'href'
          ) {
            // Check for string literal href
            if (attr.value && attr.value.type === 'Literal' && typeof attr.value.value === 'string') {
              const href = attr.value.value as string;
              // Internal links start with / or are relative without http/https/mailto/tel
              return (
                href.startsWith('/') ||
                (href.startsWith('./') && !href.match(/^(https?|mailto|tel|ftp):/i))
              );
            }
            // Check for template literal or expression with internal pattern
            if (attr.value && attr.value.type === 'JSXExpressionContainer') {
              // Template literals that might be internal
              if (attr.value.expression.type === 'TemplateLiteral') {
                return true; // Conservative: flag template literals as potential internal links
              }
              // Direct string literals inside expression
              if (attr.value.expression.type === 'Literal' && typeof attr.value.expression.value === 'string') {
                const href = attr.value.expression.value as string;
                return href.startsWith('/') && !href.match(/^(https?|mailto|tel|ftp):/i);
              }
            }
          }
          return false;
        });

        if (hasInternalHref) {
          const loc = node.loc;
          results.push({
            ruleId: 'next-link-missing',
            line: loc?.start.line ?? 0,
            column: loc?.start.column ?? 0,
            snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
          });
        }
      }
    }

    return results;
  }

  /** Detect client-only hooks (useState, useEffect, etc.) in server components. */
  private detectClientHooksInServer(astFile: ReturnType<typeof parseFile>): Array<{
    ruleId: string;
    line: number;
    column: number;
    snippet: string;
  }> {
    const results: Array<{ ruleId: string; line: number; column: number; snippet: string }> = [];
    if (!astFile) return results;
    const clientHooks = new Set(['useState', 'useEffect', 'useLayoutEffect', 'useRef', 'useReducer']);

    const callExpressions = findNodesByType(astFile.ast, 'CallExpression' as any);

    for (const node of callExpressions as any[]) {
      if (
        node.callee.type === 'JSXMemberExpression' ||
        node.callee.type === 'MemberExpression' ||
        node.callee.type === 'Super'
      ) {
        continue;
      }
      if (
        node.callee.type === 'Identifier' &&
        clientHooks.has(node.callee.name)
      ) {
        const loc = node.loc;
        results.push({
          ruleId: 'next-server-client-misuse',
          line: loc?.start.line ?? 0,
          column: loc?.start.column ?? 0,
          snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
        });
      }
    }

    return results;
  }

  /** Detect direct API calls (fetch, axios) in client components that should use Server Actions. */
  private detectDirectApiCalls(astFile: ReturnType<typeof parseFile>): Array<{
    ruleId: string;
    line: number;
    column: number;
    snippet: string;
  }> {
    const results: Array<{ ruleId: string; line: number; column: number; snippet: string }> = [];
    if (!astFile) return results;

    const callExpressions = findNodesByType(astFile.ast, 'CallExpression' as any);

    for (const node of callExpressions as any[]) {
      let isApiCall = false;

      // fetch() calls
      if (node.callee.type === 'Identifier' && node.callee.name === 'fetch') {
        isApiCall = true;
      }

      // axios calls (axios.get, axios.post, etc.)
      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'axios'
      ) {
        isApiCall = true;
      }

      if (isApiCall) {
        const loc = node.loc;
        results.push({
          ruleId: 'next-api-client-misuse',
          line: loc?.start.line ?? 0,
          column: loc?.start.column ?? 0,
          snippet: astFile.lines[loc!.start.line - 1]?.trim() ?? '',
        });
      }
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Check if file starts with 'use client' directive. */
  private isClientComponent(content: string): boolean {
    const trimmed = content.trimStart();
    return trimmed.startsWith("'use client'") || trimmed.startsWith('"use client"');
  }

  /** Check if file has export const metadata. */
  private hasMetadataExport(content: string): boolean {
    // Match: export const metadata = ... or export async function generateMetadata
    return (
      /export\s+(const|let|var)\s+metadata\s*[=:{]/.test(content) ||
      /export\s+(async\s+)?function\s+generateMetadata\s*\(/.test(content) ||
      /export\s+{\s*metadata\s*}/.test(content)
    );
  }

  /** Rule metadata lookup. */
  private ruleMeta(ruleId: string) {
    const meta: Record<string, { severity: Severity; title: string; description: string; fixSuggestion: string; autoFixable: boolean }> = {
      'next-image-missing': {
        severity: 'warning',
        title: '未使用 next/image',
        description: 'Next.js 项目中应使用 next/image 替代原生 <img> 标签以获得自动图片优化',
        fixSuggestion: '将 <img> 替换为 <Image src={...} alt={...} />',
        autoFixable: true,
      },
      'next-link-missing': {
        severity: 'warning',
        title: '未使用 next/link',
        description: 'Next.js 项目中应使用 next/link 的 <Link> 组件替代原生 <a> 标签以实现客户端路由',
        fixSuggestion: '将 <a href="..."> 替换为 <Link href="...">',
        autoFixable: true,
      },
      'next-loading-missing': {
        severity: 'info',
        title: '缺少 loading.tsx',
        description: '动态路由目录缺少 loading.tsx 文件，建议添加以显示加载状态',
        fixSuggestion: '在动态路由目录中添加 loading.tsx',
        autoFixable: false,
      },
      'next-error-missing': {
        severity: 'info',
        title: '缺少 error.tsx',
        description: '路由目录缺少 error.tsx 错误边界文件，建议添加以优雅处理错误',
        fixSuggestion: '在路由目录中添加 error.tsx',
        autoFixable: false,
      },
      'next-server-client-misuse': {
        severity: 'critical',
        title: '服务端组件使用了客户端 Hook',
        description: '在服务端组件中使用了 useState、useEffect 等客户端 Hook，需要添加 "use client" 指令',
        fixSuggestion: '在文件顶部添加 "use client" 指令或将逻辑移至客户端组件',
        autoFixable: false,
      },
      'next-metadata-missing': {
        severity: 'warning',
        title: '缺少 metadata 导出',
        description: 'Layout 或 Page 组件缺少 metadata 导出，影响 SEO 和 Open Graph 元数据',
        fixSuggestion: '添加 export const metadata = { title: "...", description: "..." }',
        autoFixable: false,
      },
      'next-api-client-misuse': {
        severity: 'warning',
        title: '客户端组件中的直接 API 调用',
        description: '在客户端组件中直接使用 fetch 或 axios 调用，建议使用 Server Actions 替代',
        fixSuggestion: '将数据获取逻辑迁移到 Server Action 或服务端组件',
        autoFixable: false,
      },
      'next-config-missing': {
        severity: 'info',
        title: '缺少 next.config.js 优化配置',
        description: '项目缺少 next.config.js 配置文件，建议添加图片域名白名单、压缩等优化设置',
        fixSuggestion: '创建 next.config.js 并配置 images.domains、compress 等选项',
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

  /** Create a standardized Diagnosis object. */
  private makeDiagnosis(
    filePath: string,
    ruleId: string,
    meta: { severity: Severity; title: string; description: string; fixSuggestion: string; autoFixable: boolean },
    result: { line: number; column: number; snippet: string },
  ): Diagnosis {
    return {
      id: `Next-${generateId()}`,
      skill: this.name,
      type: 'best-practice' as DiagnosisType,
      severity: meta.severity,
      title: meta.title,
      description: meta.description,
      location: { file: filePath, line: result.line, column: result.column },
      metadata: { ruleId, snippet: result.snippet },
      fixSuggestion: {
        description: meta.fixSuggestion,
        autoApplicable: meta.autoFixable,
        riskLevel: 'low',
      },
    };
  }

  // -------------------------------------------------------------------------
  // Fix Methods
  // -------------------------------------------------------------------------

  private fixImageMissing(content: string, diagnosis: Diagnosis): FileChange[] {
    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];
    if (!targetLine) return [];

    // Transform <img src="..." alt="..." ...> to <Image src="..." alt="..." ... />
    // Also add width and height if missing (required by next/image for static images)
    const fixedLine = targetLine
      // Replace <img with <Image
      .replace(/<img\b/, '<Image')
      // Ensure proper self-closing or closing tag is maintained
      // Add width="100%" height="100%" if not present and it's a static src
      .replace(
        /(<Image\s+[^>]*)(?<!\bwidth=)(?![^>]*\bwidth\b)([^>]*)(?<!\/)\/?>/,
        (_match, prefix, rest) => {
          // Don't add width/height if using layout="fill" or if src is dynamic
          if (rest.includes('layout="fill"') || rest.includes('layout=\'fill\'')) {
            return prefix + rest;
          }
          return prefix + rest;
        }
      );

    // Check if Image is imported; if not, add import
    const hasImageImport = /import\s+Image\s+from\s+['"]next\/image['"]/.test(content);
    const changes: FileChange[] = [];

    if (!hasImageImport) {
      // Find the first import line and add Image import after it
      const firstImportIndex = content.indexOf('import ');
      if (firstImportIndex >= 0) {
        const importEndIndex = content.indexOf('\n', firstImportIndex) + 1;
        changes.push({
          file: diagnosis.location.file,
          type: 'insert',
          position: { line: content.slice(0, importEndIndex).split('\n').length },
          content: "import Image from 'next/image';\n",
        });
      }
    }

    // Replace the img line with Image
    changes.push({
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: fixedLine,
      oldContent: targetLine,
    });

    return changes;
  }

  private fixLinkMissing(content: string, diagnosis: Diagnosis): FileChange[] {
    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];
    if (!targetLine) return [];

    // Transform <a href="..."> to <Link href="...">
    // And </a> to </Link>
    const fixedLine = targetLine
      .replace(/<a\b/, '<Link')
      .replace(/<\/a>/g, '</Link>');

    // Check if Link is imported; if not, add import
    const hasLinkImport = /import\s+Link\s+from\s+['"]next\/link['"]/.test(content);
    const changes: FileChange[] = [];

    if (!hasLinkImport) {
      // Find the first import line and add Link import after it
      const firstImportIndex = content.indexOf('import ');
      if (firstImportIndex >= 0) {
        const importEndIndex = content.indexOf('\n', firstImportIndex) + 1;
        changes.push({
          file: diagnosis.location.file,
          type: 'insert',
          position: { line: content.slice(0, importEndIndex).split('\n').length },
          content: "import Link from 'next/link';\n",
        });
      }
    }

    // Replace the anchor line with Link
    changes.push({
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: fixedLine,
      oldContent: targetLine,
    });

    return changes;
  }
}

export default NextJSSkill;
