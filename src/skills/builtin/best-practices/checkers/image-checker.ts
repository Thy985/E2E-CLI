/**
 * Image Checker
 * 
 * 检查图片优化问题
 */

import * as fs from 'fs';
import * as path from 'path';
import { Diagnosis, Severity } from '../../../../types';

export class ImageChecker {
  async check(projectPath: string): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];
    const htmlFiles = await this.findHTMLFiles(projectPath);

    for (const file of htmlFiles) {
      const content = await fs.promises.readFile(file, 'utf-8');
      const relativePath = path.relative(projectPath, file);

      // 检查图片尺寸属性
      const dimensionIssues = this.checkImageDimensions(content, relativePath);
      issues.push(...dimensionIssues);

      // 检查懒加载
      const lazyLoadingIssues = this.checkLazyLoading(content, relativePath);
      issues.push(...lazyLoadingIssues);

      // 检查图片格式
      const formatIssues = this.checkImageFormat(content, relativePath);
      issues.push(...formatIssues);

      // 检查响应式图片
      const responsiveIssues = this.checkResponsiveImages(content, relativePath);
      issues.push(...responsiveIssues);
    }

    return issues;
  }

  private checkImageDimensions(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const imgRegex = /<img[^>]*>/g;
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      let match;
      while ((match = imgRegex.exec(line)) !== null) {
        const imgTag = match[0];
        
        // 检查是否有 width 和 height
        const hasWidth = /width=/.test(imgTag);
        const hasHeight = /height=/.test(imgTag);

        if (!hasWidth || !hasHeight) {
          issues.push({
            id: `img-dimensions-${file}-${index}`,
            skill: 'best-practices',
            type: 'best-practice',
            severity: 'info',
            title: 'Image missing width or height attributes',
            description: 'Images should have explicit width and height to prevent layout shift (CLS)',
            location: { file, line: index + 1, column: match.index + 1 },
            evidence: { type: 'code', content: line.trim()  },
            metadata: {
              category: 'image',
              type: 'missing-dimensions',
              suggestion: 'Add width="" height="" attributes',
            },
          });
        }
      }
    });

    return issues;
  }

  private checkLazyLoading(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const imgRegex = /<img[^>]*>/g;
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      let match;
      while ((match = imgRegex.exec(line)) !== null) {
        const imgTag = match[0];
        
        // 检查是否有 loading="lazy"
        if (!/loading\s*=\s*["\']lazy["\']/.test(imgTag)) {
          issues.push({
            id: `img-lazy-${file}-${index}`,
            skill: 'best-practices',
            type: 'best-practice',
            severity: 'info',
            title: 'Image missing lazy loading',
            description: 'Images below the fold should use loading="lazy" for better performance',
            location: { file, line: index + 1, column: match.index + 1 },
            evidence: { type: 'code', content: line.trim()  },
            metadata: {
              category: 'image',
              type: 'missing-lazy-loading',
              suggestion: 'Add loading="lazy" for images below the fold',
            },
          });
        }
      }
    });

    return issues;
  }

  private checkImageFormat(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const imgRegex = /<img[^>]*src\s*=\s*["\']([^"\']+)["\'][^>]*>/g;
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      let match;
      while ((match = imgRegex.exec(line)) !== null) {
        const src = match[1];
        
        // 检查是否使用了现代格式
        if (/\.(jpg|jpeg|png)$/i.test(src) && !/\.(webp|avif)$/i.test(src)) {
          // 检查是否有 picture/source 提供现代格式
          if (!/<picture>/.test(content.substring(Math.max(0, match.index - 500), match.index))) {
            issues.push({
              id: `img-format-${file}-${index}`,
              skill: 'best-practices',
              type: 'best-practice',
              severity: 'info',
              title: 'Image not using modern format',
              description: 'Consider using WebP or AVIF format for better compression',
              location: { file, line: index + 1, column: match.index + 1 },
              evidence: { type: 'code', content: line.trim()  },
              metadata: {
                category: 'image',
                type: 'legacy-format',
                suggestion: 'Use WebP with JPEG fallback: <picture><source srcset="image.webp"><img src="image.jpg"></picture>',
              },
            });
          }
        }
      }
    });

    return issues;
  }

  private checkResponsiveImages(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const imgRegex = /<img[^>]*>/g;
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      let match;
      while ((match = imgRegex.exec(line)) !== null) {
        const imgTag = match[0];
        
        // 检查是否有 srcset
        if (!/srcset=/.test(imgTag)) {
          // 检查图片是否很大（简单启发式）
          const srcMatch = imgTag.match(/src\s*=\s*["\']([^"\']+)["\']/);
          if (srcMatch) {
            issues.push({
              id: `img-responsive-${file}-${index}`,
              skill: 'best-practices',
              type: 'best-practice',
              severity: 'info',
              title: 'Image missing responsive srcset',
              description: 'Consider using srcset for responsive images to serve appropriate sizes',
              location: { file, line: index + 1, column: match.index + 1 },
              evidence: { type: 'code', content: line.trim()  },
              metadata: {
                category: 'image',
                type: 'missing-srcset',
                suggestion: 'Add srcset with multiple sizes: srcset="img-400.jpg 400w, img-800.jpg 800w"',
              },
            });
          }
        }
      }
    });

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
