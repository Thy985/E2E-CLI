/**
 * 布局对齐检查器
 * 
 * 检查内容：
 * 1. 元素对齐（Flexbox/Grid对齐）
 * 2. 响应式断点处理
 * 3. 容器约束（最大宽度、内边距）
 */

import * as fs from 'fs';
import * as path from 'path';
import { Diagnosis, Severity } from '../../../../types';
import { DesignTokens } from '../design-token-extractor';
import { QAConfig } from '../../../../config';

export class LayoutChecker {
  async check(
    projectPath: string,
    designTokens: DesignTokens,
    config: QAConfig
  ): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];

    // 查找组件文件
    const componentFiles = await this.findComponentFiles(projectPath);

    for (const file of componentFiles) {
      const content = await fs.promises.readFile(file, 'utf-8');
      const relativePath = path.relative(projectPath, file);

      // 检查Flexbox对齐
      const flexIssues = this.checkFlexAlignment(content, relativePath);
      issues.push(...flexIssues);

      // 检查响应式
      const responsiveIssues = this.checkResponsive(content, relativePath);
      issues.push(...responsiveIssues);

      // 检查容器约束
      const containerIssues = this.checkContainerConstraints(content, relativePath);
      issues.push(...containerIssues);
    }

    return issues;
  }

  private checkFlexAlignment(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const lines = content.split('\n');

    // 检查常见的Flexbox对齐问题
    lines.forEach((line, index) => {
      // 检查是否使用了space-between但没有处理边缘情况
      if (line.includes('justify-content: space-between')) {
        // 简单检查：如果只有2-3个元素，space-between可能不是最佳选择
        issues.push({
          id: `flex-${file}-${index}`,
          skill: 'uiux-audit',
          type: 'ui-ux',
          severity: 'info',
          title: 'Flexbox对齐方式检查',
          description: '使用了 justify-content: space-between，请确保子元素数量变化时布局仍然合理',
          location: {
            file,
            line: index + 1,
            column: line.indexOf('justify-content') + 1,
          },
          evidence: { type: 'code', content: line.trim(),
           },
          metadata: {
            category: 'layout',
            type: 'flex-alignment',
          },
        });
      }

      // 检查是否缺少align-items
      if (line.includes('display: flex') && !content.includes('align-items')) {
        issues.push({
          id: `flex-align-${file}-${index}`,
          skill: 'uiux-audit',
          type: 'ui-ux',
          severity: 'info',
          title: '缺少垂直对齐设置',
          description: 'Flex容器建议显式设置 align-items 以确保垂直对齐一致',
          location: {
            file,
            line: index + 1,
            column: 1,
          },
          evidence: { type: 'code', content: line.trim(),
           },
          metadata: {
            category: 'layout',
            type: 'missing-align-items',
            suggestion: 'align-items: center;',
          },
        });
      }
    });

    return issues;
  }

  private checkResponsive(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    
    // 检查是否使用了固定宽度
    const fixedWidthRegex = /width\s*:\s*\d+px/g;
    if (fixedWidthRegex.test(content) && !content.includes('@media')) {
      issues.push({
        id: `responsive-${file}`,
        skill: 'uiux-audit',
        type: 'ui-ux',
        severity: 'warning',
        title: '缺少响应式处理',
        description: '使用了固定宽度但未检测到媒体查询，建议添加响应式断点处理',
        location: {
          file,
          line: 1,
          column: 1,
        },
        metadata: {
          category: 'layout',
          type: 'missing-responsive',
          suggestion: '添加 @media (max-width: 768px) { ... }',
        },
      });
    }

    return issues;
  }

  private checkContainerConstraints(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // 检查是否缺少max-width
      if (line.includes('width: 100%') && !content.includes('max-width')) {
        // 这可能是容器元素，建议添加max-width
        if (line.includes('container') || line.includes('wrapper') || line.includes('layout')) {
          issues.push({
            id: `container-${file}-${index}`,
            skill: 'uiux-audit',
            type: 'ui-ux',
            severity: 'info',
            title: '建议添加最大宽度约束',
            description: '容器使用 width: 100% 时建议添加 max-width 以限制内容宽度',
            location: {
              file,
              line: index + 1,
              column: 1,
            },
            evidence: { type: 'code', content: line.trim(),
             },
            metadata: {
              category: 'layout',
              type: 'missing-max-width',
              suggestion: 'max-width: 1200px; margin: 0 auto;',
            },
          });
        }
      }
    });

    return issues;
  }

  private async findComponentFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.tsx', '.jsx', '.vue', '.css', '.scss'];

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
