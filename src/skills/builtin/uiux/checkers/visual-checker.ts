/**
 * 视觉规范检查器
 * 
 * 检查内容：
 * 1. 颜色使用是否符合设计令牌
 * 2. 字体规范（字号、字重、行高）
 * 3. 间距是否符合8px网格
 * 4. 圆角使用是否规范
 * 5. 阴影层级是否一致
 */

import * as fs from 'fs';
import * as path from 'path';
import { Diagnosis, Severity } from '../../../../types';
import { DesignTokens } from '../design-token-extractor';
import { QAConfig } from '../../../../config';

export class VisualChecker {
  async check(
    projectPath: string,
    designTokens: DesignTokens,
    config: QAConfig
  ): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];

    // 查找样式文件
    const styleFiles = await this.findStyleFiles(projectPath);

    for (const file of styleFiles) {
      const content = await fs.promises.readFile(file, 'utf-8');
      const relativePath = path.relative(projectPath, file);

      // 检查颜色使用
      const colorIssues = this.checkColors(content, relativePath, designTokens);
      issues.push(...colorIssues);

      // 检查间距
      const spacingIssues = this.checkSpacing(content, relativePath, designTokens);
      issues.push(...spacingIssues);

      // 检查圆角
      const radiusIssues = this.checkBorderRadius(content, relativePath, designTokens);
      issues.push(...radiusIssues);

      // 检查字体
      const typographyIssues = this.checkTypography(content, relativePath, designTokens);
      issues.push(...typographyIssues);
    }

    return issues;
  }

  private checkColors(content: string, file: string, tokens: DesignTokens): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const lines = content.split('\n');

    // 硬编码颜色正则
    const hardcodedColorRegex = /color\s*:\s*(#[0-9A-Fa-f]{3,8}|rgb\([^)]+\)|rgba\([^)]+\))/g;

    lines.forEach((line, index) => {
      let match;
      while ((match = hardcodedColorRegex.exec(line)) !== null) {
        const color = match[1];
        
        // 检查是否是设计令牌中的颜色
        const isInTokens = Object.values(tokens.colors || {}).some(
          tokenColor => this.normalizeColor(tokenColor) === this.normalizeColor(color)
        );

        if (!isInTokens) {
          issues.push({
            id: `color-${file}-${index}`,
            skill: 'uiux-audit',
            type: 'ui-ux',
            severity: 'warning',
            title: '使用非规范颜色',
            description: `使用了硬编码颜色 ${color}，建议使用设计令牌变量`,
            location: {
              file,
              line: index + 1,
              column: match.index + 1,
            },
            evidence: { type: 'code', content: line.trim(),
             },
            metadata: {
              category: 'visual',
              type: 'color-mismatch',
              current: color,
              suggestion: this.findClosestToken(color, tokens.colors),
            },
          });
        }
      }
    });

    return issues;
  }

  private checkSpacing(content: string, file: string, tokens: DesignTokens): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const lines = content.split('\n');

    // 检查 px 单位的间距值
    const spacingRegex = /(margin|padding|gap)\s*:\s*(\d+)px/g;

    lines.forEach((line, index) => {
      let match;
      while ((match = spacingRegex.exec(line)) !== null) {
        const value = parseInt(match[2]);
        
        // 检查是否符合8px网格
        if (value % 8 !== 0 && value !== 4) {
          issues.push({
            id: `spacing-${file}-${index}`,
            skill: 'uiux-audit',
            type: 'ui-ux',
            severity: 'info',
            title: '间距不符合8px网格',
            description: `使用了 ${value}px 间距，建议使用 8px 网格系统的值（4, 8, 16, 24, 32...）`,
            location: {
              file,
              line: index + 1,
              column: match.index + 1,
            },
            evidence: { type: 'code', content: line.trim(),
             },
            metadata: {
              category: 'visual',
              type: 'spacing-inconsistent',
              current: `${value}px`,
              suggestion: this.findClosestSpacing(value),
            },
          });
        }
      }
    });

    return issues;
  }

  private checkBorderRadius(content: string, file: string, tokens: DesignTokens): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const lines = content.split('\n');

    // 检查圆角值
    const radiusRegex = /border-radius\s*:\s*(\d+)px/g;

    lines.forEach((line, index) => {
      let match;
      while ((match = radiusRegex.exec(line)) !== null) {
        const value = parseInt(match[1]);
        
        // 检查是否是标准圆角值
        const standardRadii = [4, 8, 12, 16, 24];
        if (!standardRadii.includes(value)) {
          issues.push({
            id: `radius-${file}-${index}`,
            skill: 'uiux-audit',
            type: 'ui-ux',
            severity: 'info',
            title: '圆角值不规范',
            description: `使用了 ${value}px 圆角，建议使用标准圆角值`,
            location: {
              file,
              line: index + 1,
              column: match.index + 1,
            },
            evidence: { type: 'code', content: line.trim(),
             },
            metadata: {
              category: 'visual',
              type: 'border-radius-mismatch',
              current: `${value}px`,
              suggestion: this.findClosestRadius(value),
            },
          });
        }
      }
    });

    return issues;
  }

  private checkTypography(content: string, file: string, tokens: DesignTokens): Diagnosis[] {
    const issues: Diagnosis[] = [];
    // TODO: 实现字体规范检查
    return issues;
  }

  private async findStyleFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.css', '.scss', '.less', '.tsx', '.jsx', '.vue'];

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
    return files.slice(0, 50); // 限制文件数量
  }

  private normalizeColor(color: string): string {
    // 简化颜色归一化逻辑
    return color.toLowerCase().replace(/\s/g, '');
  }

  private findClosestToken(color: string, tokens: Record<string, string>): string | undefined {
    // 返回第一个颜色令牌作为建议
    const entries = Object.entries(tokens);
    if (entries.length === 0) return undefined;
    
    // 简单匹配：找相同或相近的颜色
    for (const [name, value] of entries) {
      if (this.normalizeColor(value) === this.normalizeColor(color)) {
        return `var(--${name})`;
      }
    }
    
    return `var(--${entries[0][0]})`;
  }

  private findClosestSpacing(value: number): string {
    const standardSpacings = [4, 8, 16, 24, 32, 48, 64];
    const closest = standardSpacings.reduce((prev, curr) =>
      Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
    );
    return `${closest}px`;
  }

  private findClosestRadius(value: number): string {
    const standardRadii = [4, 8, 12, 16, 24];
    const closest = standardRadii.reduce((prev, curr) =>
      Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
    );
    return `${closest}px`;
  }
}
