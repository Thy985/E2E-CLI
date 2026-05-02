/**
 * SEO Skill
 * 
 * 检查 SEO 最佳实践：
 * 1. Meta 标签
 * 2. 结构化数据
 * 3. 链接优化
 * 4. 内容优化
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseSkill } from '../../base-skill';
import {
  SkillContext,
  Diagnosis,
  Severity,
  Fix,
} from '../../../types';
import { SEOFixGenerator } from './fixers/seo-fix-generator';

export class SEOSkill extends BaseSkill {
  name = 'seo';
  version = '1.0.0';
  description = 'SEO optimization checker';

  triggers = [
    { type: 'command', pattern: 'seo', priority: 100 },
    { type: 'keyword', pattern: /seo|meta|structured.?data|schema/i, priority: 80 },
    { type: 'file', pattern: /\.(html|htm|tsx|jsx|vue)$/i, priority: 60 },
  ];

  capabilities = [
    { name: 'meta-tags', description: 'Meta tags check', autoFixable: true, riskLevel: 'low' },
    { name: 'structured-data', description: 'Structured data check', autoFixable: false, riskLevel: 'low' },
    { name: 'link-optimization', description: 'Link optimization', autoFixable: true, riskLevel: 'low' },
    { name: 'content-optimization', description: 'Content optimization', autoFixable: false, riskLevel: 'low' },
  ];

  private fixGenerator: SEOFixGenerator;

  constructor() {
    super();
    this.fixGenerator = new SEOFixGenerator();
  }

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];
    const { project } = context;

    const htmlFiles = await this.findHTMLFiles(project.rootPath);

    for (const file of htmlFiles) {
      const content = await fs.promises.readFile(file, 'utf-8');
      const relativePath = path.relative(project.rootPath, file);

      // Meta 标签检查
      const metaIssues = this.checkMetaTags(content, relativePath);
      issues.push(...metaIssues);

      // 结构化数据检查
      const structuredDataIssues = this.checkStructuredData(content, relativePath);
      issues.push(...structuredDataIssues);

      // 链接优化检查
      const linkIssues = this.checkLinks(content, relativePath);
      issues.push(...linkIssues);

      // 内容优化检查
      const contentIssues = this.checkContent(content, relativePath);
      issues.push(...contentIssues);

      // 图片 SEO 检查
      const imageIssues = this.checkImageSEO(content, relativePath);
      issues.push(...imageIssues);

      // URL 结构检查
      const urlIssues = this.checkURLStructure(content, relativePath);
      issues.push(...urlIssues);
    }

    return issues;
  }

  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    return await this.fixGenerator.generateFix(diagnosis, context.project.rootPath);
  }

  canAutoFix(diagnosis: Diagnosis): boolean {
    const autoFixableTypes = [
      'missing-description',
      'missing-keywords',
      'missing-og-tag',
      'missing-twitter-card',
      'missing-canonical',
      'missing-robots',
      'external-link-security',
    ];
    return autoFixableTypes.includes(diagnosis.metadata?.type);
  }

  private checkMetaTags(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];

    // 检查 description
    if (!/<meta[^>]*name\s*=\s*["\']description["\'][^>]*>/i.test(content)) {
      issues.push({
        id: `seo-description-${file}`,
        skill: 'seo',
        type: 'seo',
        severity: 'warning',
        title: 'Missing meta description',
        description: 'Meta description is important for SEO and social sharing',
        location: { file, line: 1, column: 1 },
        metadata: {
          category: 'seo',
          type: 'missing-description',
          suggestion: '<meta name="description" content="Page description">',
        },
      });
    }

    // 检查 keywords（虽然现代 SEO 不太重视，但仍建议有）
    if (!/<meta[^>]*name\s*=\s*["\']keywords["\'][^>]*>/i.test(content)) {
      issues.push({
        id: `seo-keywords-${file}`,
        skill: 'seo',
        type: 'seo',
        severity: 'info',
        title: 'Missing meta keywords',
        description: 'Meta keywords can help with SEO',
        location: { file, line: 1, column: 1 },
        metadata: {
          category: 'seo',
          type: 'missing-keywords',
          suggestion: '<meta name="keywords" content="keyword1, keyword2">',
        },
      });
    }

    // 检查 Open Graph 标签
    const ogTags = ['og:title', 'og:description', 'og:image', 'og:url'];
    for (const tag of ogTags) {
      if (!new RegExp(`<meta[^>]*property\s*=\s*["\']${tag}["\']`, 'i').test(content)) {
        issues.push({
          id: `seo-og-${tag}-${file}`,
          skill: 'seo',
          type: 'seo',
          severity: 'info',
          title: `Missing Open Graph tag: ${tag}`,
          description: 'Open Graph tags improve social media sharing',
          location: { file, line: 1, column: 1 },
          metadata: {
            category: 'seo',
            type: 'missing-og-tag',
            suggestion: `<meta property="${tag}" content="...">`,
          },
        });
      }
    }

    // 检查 Twitter Card 标签
    if (!/<meta[^>]*name\s*=\s*["\']twitter:card["\'][^>]*>/i.test(content)) {
      issues.push({
        id: `seo-twitter-card-${file}`,
        skill: 'seo',
        type: 'seo',
        severity: 'info',
        title: 'Missing Twitter Card tags',
        description: 'Twitter Card tags improve Twitter sharing',
        location: { file, line: 1, column: 1 },
        metadata: {
          category: 'seo',
          type: 'missing-twitter-card',
          suggestion: '<meta name="twitter:card" content="summary_large_image">',
        },
      });
    }

    // 检查 canonical 链接
    if (!/<link[^>]*rel\s*=\s*["\']canonical["\'][^>]*>/i.test(content)) {
      issues.push({
        id: `seo-canonical-${file}`,
        skill: 'seo',
        type: 'seo',
        severity: 'warning',
        title: 'Missing canonical link',
        description: 'Canonical link helps prevent duplicate content issues',
        location: { file, line: 1, column: 1 },
        metadata: {
          category: 'seo',
          type: 'missing-canonical',
          suggestion: '<link rel="canonical" href="https://example.com/page">',
        },
      });
    }

    // 检查 robots meta
    if (!/<meta[^>]*name\s*=\s*["\']robots["\'][^>]*>/i.test(content)) {
      issues.push({
        id: `seo-robots-${file}`,
        skill: 'seo',
        type: 'seo',
        severity: 'info',
        title: 'Missing robots meta tag',
        description: 'Robots meta tag controls search engine indexing',
        location: { file, line: 1, column: 1 },
        metadata: {
          category: 'seo',
          type: 'missing-robots',
          suggestion: '<meta name="robots" content="index, follow">',
        },
      });
    }

    return issues;
  }

  private checkStructuredData(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];

    // 检查是否有结构化数据
    if (!/<script[^>]*type\s*=\s*["\']application\/ld\+json["\'][^>]*>/i.test(content)) {
      issues.push({
        id: `seo-structured-data-${file}`,
        skill: 'seo',
        type: 'seo',
        severity: 'info',
        title: 'Missing structured data',
        description: 'Structured data (Schema.org) helps search engines understand content',
        location: { file, line: 1, column: 1 },
        metadata: {
          category: 'seo',
          type: 'missing-structured-data',
          suggestion: 'Add JSON-LD structured data for your content type',
        },
      });
    }

    return issues;
  }

  private checkLinks(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // 检查外部链接是否有 rel="noopener noreferrer"
      const externalLinkRegex = /<a[^>]*href\s*=\s*["\']https?:\/\/[^"\']+["\'][^>]*>/gi;
      let match;
      while ((match = externalLinkRegex.exec(line)) !== null) {
        const linkTag = match[0];
        if (!/rel\s*=\s*["\'][^"\']*noopener/.test(linkTag)) {
          issues.push({
            id: `seo-external-link-${file}-${index}`,
            skill: 'seo',
            type: 'seo',
            severity: 'warning',
            title: 'External link missing rel="noopener"',
            description: 'External links should use rel="noopener noreferrer" for security and performance',
            location: { file, line: index + 1, column: match.index + 1 },
            evidence: { code: line.trim() },
            metadata: {
              category: 'seo',
              type: 'external-link-security',
              suggestion: 'Add rel="noopener noreferrer"',
            },
          });
        }
      }

      // 检查是否有空链接
      const emptyLinkRegex = /<a[^>]*href\s*=\s*["\']#?["\'][^>]*>/gi;
      while ((match = emptyLinkRegex.exec(line)) !== null) {
        issues.push({
          id: `seo-empty-link-${file}-${index}`,
          skill: 'seo',
          type: 'seo',
          severity: 'warning',
          title: 'Empty or placeholder link',
          description: 'Links should have meaningful destinations',
          location: { file, line: index + 1, column: match.index + 1 },
          evidence: { code: line.trim() },
          metadata: {
            category: 'seo',
            type: 'empty-link',
            suggestion: 'Provide a valid URL or remove the link',
          },
        });
      }
    });

    return issues;
  }

  private checkContent(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];

    // 检查标题长度
    const titleMatch = content.match(/<title>([^<]*)<\/title>/i);
    if (titleMatch) {
      const titleLength = titleMatch[1].length;
      if (titleLength < 10 || titleLength > 60) {
        issues.push({
          id: `seo-title-length-${file}`,
          skill: 'seo',
          type: 'seo',
          severity: 'warning',
          title: 'Title length not optimal',
          description: `Title is ${titleLength} characters. Optimal length is 50-60 characters`,
          location: { file, line: 1, column: 1 },
          metadata: {
            category: 'seo',
            type: 'title-length',
            suggestion: 'Keep title between 50-60 characters',
          },
        });
      }
    }

    // 检查描述长度
    const descMatch = content.match(/<meta[^>]*name\s*=\s*["\']description["\'][^>]*content\s*=\s*["\']([^"\']*)["\'][^>]*>/i);
    if (descMatch) {
      const descLength = descMatch[1].length;
      if (descLength < 50 || descLength > 160) {
        issues.push({
          id: `seo-description-length-${file}`,
          skill: 'seo',
          type: 'seo',
          severity: 'warning',
          title: 'Description length not optimal',
          description: `Description is ${descLength} characters. Optimal length is 150-160 characters`,
          location: { file, line: 1, column: 1 },
          metadata: {
            category: 'seo',
            type: 'description-length',
            suggestion: 'Keep description between 150-160 characters',
          },
        });
      }
    }

    // 检查是否有多个 H1
    const h1Matches = content.match(/<h1[^>]*>/gi);
    if (h1Matches && h1Matches.length > 1) {
      issues.push({
        id: `seo-multiple-h1-${file}`,
        skill: 'seo',
        type: 'seo',
        severity: 'warning',
        title: 'Multiple H1 tags',
        description: 'Page should have only one H1 tag for proper SEO structure',
        location: { file, line: 1, column: 1 },
        metadata: {
          category: 'seo',
          type: 'multiple-h1',
          suggestion: 'Use only one H1 tag per page',
        },
      });
    }

    return issues;
  }

  private checkImageSEO(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const imgRegex = /<img[^>]*>/gi;
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      let match;
      while ((match = imgRegex.exec(line)) !== null) {
        const imgTag = match[0];
        
        // 检查文件名是否描述性
        const srcMatch = imgTag.match(/src\s*=\s*["\']([^"\']+)["\']/i);
        if (srcMatch) {
          const filename = srcMatch[1].split('/').pop() || '';
          if (/^\d+\.(jpg|png|gif)$/i.test(filename) || /^(image|photo|pic|img)\d*\./i.test(filename)) {
            issues.push({
              id: `seo-image-filename-${file}-${index}`,
              skill: 'seo',
              type: 'seo',
              severity: 'info',
              title: 'Non-descriptive image filename',
              description: 'Image filenames should be descriptive for SEO',
              location: { file, line: index + 1, column: match.index + 1 },
              evidence: { code: filename },
              metadata: {
                category: 'seo',
                type: 'image-filename',
                suggestion: 'Use descriptive filenames like "red-apple.jpg" instead of "IMG_1234.jpg"',
              },
            });
          }
        }
      }
    });

    return issues;
  }

  private checkURLStructure(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];

    // 检查是否有重复内容（多个 URL 指向相同内容）
    // 这需要分析整个站点的链接结构，简化处理

    return issues;
  }

  private async findHTMLFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.html', '.htm', '.vue', '.tsx', '.jsx'];

    const scanDir = (dir: string, depth: number = 0) => {
      if (depth > 4) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scanDir(fullPath, depth + 1);
          } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // 忽略权限错误
      }
    };

    scanDir(projectPath);
    return files.slice(0, 50);
  }
}

export default SEOSkill;
