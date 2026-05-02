/**
 * HTML Checker
 * 
 * 检查 HTML 语义化和可访问性问题
 */

import * as fs from 'fs';
import * as path from 'path';
import { Diagnosis, Severity } from '../../../../types';

export class HTMLChecker {
  async check(projectPath: string): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];
    const htmlFiles = await this.findHTMLFiles(projectPath);

    for (const file of htmlFiles) {
      const content = await fs.promises.readFile(file, 'utf-8');
      const relativePath = path.relative(projectPath, file);

      // 检查缺少 lang 属性
      const langIssues = this.checkLangAttribute(content, relativePath);
      issues.push(...langIssues);

      // 检查标题层级
      const headingIssues = this.checkHeadingHierarchy(content, relativePath);
      issues.push(...headingIssues);

      // 检查表单 label
      const formIssues = this.checkFormLabels(content, relativePath);
      issues.push(...formIssues);

      // 检查图片 alt
      const imageIssues = this.checkImageAlt(content, relativePath);
      issues.push(...imageIssues);

      // 检查 viewport meta
      const viewportIssues = this.checkViewport(content, relativePath);
      issues.push(...viewportIssues);

      // 检查 title
      const titleIssues = this.checkTitle(content, relativePath);
      issues.push(...titleIssues);
    }

    return issues;
  }

  private checkLangAttribute(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    
    if (!/<html[^>]*lang=/.test(content)) {
      issues.push({
        id: `html-lang-${file}`,
        skill: 'best-practices',
        type: 'best-practice',
        severity: 'warning',
        title: 'Missing lang attribute on html element',
        description: 'The html element should have a lang attribute for accessibility and SEO',
        location: { file, line: 1, column: 1 },
        metadata: {
          category: 'html',
          type: 'missing-lang',
          suggestion: '<html lang="en"> or <html lang="zh-CN">',
        },
      });
    }

    return issues;
  }

  private checkHeadingHierarchy(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const headingRegex = /<h([1-6])[^>]*>/g;
    const headings: { level: number; line: number }[] = [];
    
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      let match;
      while ((match = headingRegex.exec(line)) !== null) {
        headings.push({ level: parseInt(match[1]), line: index + 1 });
      }
    });

    // 检查层级跳跃
    for (let i = 1; i < headings.length; i++) {
      const prev = headings[i - 1];
      const curr = headings[i];
      
      if (curr.level > prev.level + 1) {
        issues.push({
          id: `heading-hierarchy-${file}-${curr.line}`,
          skill: 'best-practices',
          type: 'best-practice',
          severity: 'warning',
          title: 'Heading hierarchy violation',
          description: `Heading level jumps from h${prev.level} to h${curr.level}`,
          location: { file, line: curr.line, column: 1 },
          metadata: {
            category: 'html',
            type: 'heading-hierarchy',
            suggestion: `Consider using h${prev.level + 1} instead of h${curr.level}`,
          },
        });
      }
    }

    return issues;
  }

  private checkFormLabels(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const inputRegex = /<input[^>]*>/g;
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      let match;
      while ((match = inputRegex.exec(line)) !== null) {
        const inputTag = match[0];
        
        // 检查是否有 aria-label 或 aria-labelledby
        const hasAriaLabel = /aria-label|aria-labelledby/.test(inputTag);
        // 检查是否有 id（用于 label 关联）
        const hasId = /id=/.test(inputTag);
        // 检查是否有 placeholder（不能替代 label）
        const hasPlaceholder = /placeholder=/.test(inputTag);

        if (!hasAriaLabel && !hasId) {
          issues.push({
            id: `form-label-${file}-${index}`,
            skill: 'best-practices',
            type: 'best-practice',
            severity: 'warning',
            title: 'Input missing label',
            description: 'Form inputs should have associated labels for accessibility',
            location: { file, line: index + 1, column: match.index + 1 },
            evidence: { code: line.trim() },
            metadata: {
              category: 'html',
              type: 'missing-label',
              suggestion: 'Add a <label> element or aria-label attribute',
            },
          });
        }
      }
    });

    return issues;
  }

  private checkImageAlt(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const imgRegex = /<img[^>]*>/g;
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      let match;
      while ((match = imgRegex.exec(line)) !== null) {
        const imgTag = match[0];
        
        if (!/alt=/.test(imgTag)) {
          issues.push({
            id: `img-alt-${file}-${index}`,
            skill: 'best-practices',
            type: 'best-practice',
            severity: 'warning',
            title: 'Image missing alt attribute',
            description: 'Images should have alt attributes for accessibility',
            location: { file, line: index + 1, column: match.index + 1 },
            evidence: { code: line.trim() },
            metadata: {
              category: 'html',
              type: 'missing-alt',
              suggestion: 'Add alt="description" or alt="" for decorative images',
            },
          });
        }
      }
    });

    return issues;
  }

  private checkViewport(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    
    if (!/<meta[^>]*viewport/.test(content)) {
      issues.push({
        id: `viewport-${file}`,
        skill: 'best-practices',
        type: 'best-practice',
        severity: 'warning',
        title: 'Missing viewport meta tag',
        description: 'Mobile devices need viewport meta tag for proper rendering',
        location: { file, line: 1, column: 1 },
        metadata: {
          category: 'html',
          type: 'missing-viewport',
          suggestion: '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        },
      });
    }

    return issues;
  }

  private checkTitle(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    
    if (!/<title>/.test(content)) {
      issues.push({
        id: `title-${file}`,
        skill: 'best-practices',
        type: 'best-practice',
        severity: 'warning',
        title: 'Missing title element',
        description: 'HTML documents should have a title element for SEO and accessibility',
        location: { file, line: 1, column: 1 },
        metadata: {
          category: 'html',
          type: 'missing-title',
          suggestion: '<title>Page Title</title>',
        },
      });
    }

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
