/**
 * CSS Checker
 * 
 * 检查 CSS 最佳实践
 */

import * as fs from 'fs';
import * as path from 'path';
import { Diagnosis, Severity } from '../../../../types';

export class CSSChecker {
  async check(projectPath: string): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];
    const cssFiles = await this.findCSSFiles(projectPath);

    for (const file of cssFiles) {
      const content = await fs.promises.readFile(file, 'utf-8');
      const relativePath = path.relative(projectPath, file);

      // 检查 @import
      const importIssues = this.checkAtImport(content, relativePath);
      issues.push(...importIssues);

      // 检查过度嵌套
      const nestingIssues = this.checkDeepNesting(content, relativePath);
      issues.push(...nestingIssues);

      // 检查 !important
      const importantIssues = this.checkImportant(content, relativePath);
      issues.push(...importantIssues);

      // 检查 ID 选择器
      const idSelectorIssues = this.checkIdSelectors(content, relativePath);
      issues.push(...idSelectorIssues);

      // 检查通用选择器
      const universalIssues = this.checkUniversalSelector(content, relativePath);
      issues.push(...universalIssues);

      // 检查空规则
      const emptyRuleIssues = this.checkEmptyRules(content, relativePath);
      issues.push(...emptyRuleIssues);
    }

    return issues;
  }

  private checkAtImport(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      if (/^\s*@import\s+url/.test(line)) {
        issues.push({
          id: `css-import-${file}-${index}`,
          skill: 'best-practices',
          type: 'best-practice',
          severity: 'info',
          title: '@import with url() may cause performance issues',
          description: '@import blocks parallel downloads. Consider using <link> tags instead',
          location: { file, line: index + 1, column: 1 },
          evidence: { code: line.trim() },
          metadata: {
            category: 'css',
            type: 'at-import',
            suggestion: 'Use <link rel="stylesheet"> in HTML instead',
          },
        });
      }
    });

    return issues;
  }

  private checkDeepNesting(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const lines = content.split('\n');
    let nestingLevel = 0;
    let currentLine = 0;

    lines.forEach((line, index) => {
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;

      if (openBraces > 0) {
        nestingLevel += openBraces;
        if (nestingLevel > 4 && currentLine === 0) {
          currentLine = index + 1;
        }
      }

      if (closeBraces > 0) {
        nestingLevel -= closeBraces;
        if (nestingLevel <= 4) {
          currentLine = 0;
        }
      }

      if (nestingLevel > 4 && currentLine > 0) {
        issues.push({
          id: `css-nesting-${file}-${index}`,
          skill: 'best-practices',
          type: 'best-practice',
          severity: 'info',
          title: 'Deep CSS nesting detected',
          description: 'CSS nesting deeper than 4 levels can impact performance and readability',
          location: { file, line: currentLine, column: 1 },
          metadata: {
            category: 'css',
            type: 'deep-nesting',
            suggestion: 'Refactor to reduce nesting depth',
          },
        });
        currentLine = 0; // 只报告一次
      }
    });

    return issues;
  }

  private checkImportant(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const lines = content.split('\n');
    let importantCount = 0;

    lines.forEach((line, index) => {
      const matches = line.match(/!important/g);
      if (matches) {
        importantCount += matches.length;
        
        if (importantCount > 10) {
          issues.push({
            id: `css-important-${file}`,
            skill: 'best-practices',
            type: 'best-practice',
            severity: 'warning',
            title: 'Excessive use of !important',
            description: `Found ${importantCount} uses of !important. This indicates specificity issues`,
            location: { file, line: index + 1, column: 1 },
            metadata: {
              category: 'css',
              type: 'important-overuse',
              suggestion: 'Refactor CSS to use proper specificity instead of !important',
            },
          });
          importantCount = 0; // 重置计数
        }
      }
    });

    return issues;
  }

  private checkIdSelectors(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const idRegex = /#[a-zA-Z][a-zA-Z0-9_-]*\s*{/g;
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      let match;
      while ((match = idRegex.exec(line)) !== null) {
        issues.push({
          id: `css-id-${file}-${index}`,
          skill: 'best-practices',
          type: 'best-practice',
          severity: 'info',
          title: 'ID selector used',
          description: 'ID selectors have high specificity and are hard to override. Consider using class selectors',
          location: { file, line: index + 1, column: match.index + 1 },
          evidence: { code: line.trim() },
          metadata: {
            category: 'css',
            type: 'id-selector',
            suggestion: 'Replace with class selector',
          },
        });
      }
    });

    return issues;
  }

  private checkUniversalSelector(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const universalRegex = /\*\s*{/g;
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      if (universalRegex.test(line)) {
        issues.push({
          id: `css-universal-${file}-${index}`,
          skill: 'best-practices',
          type: 'best-practice',
          severity: 'warning',
          title: 'Universal selector (*) may impact performance',
          description: 'The universal selector matches all elements and can slow down rendering',
          location: { file, line: index + 1, column: 1 },
          evidence: { code: line.trim() },
          metadata: {
            category: 'css',
            type: 'universal-selector',
            suggestion: 'Use more specific selectors or target specific elements',
          },
        });
      }
    });

    return issues;
  }

  private checkEmptyRules(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const emptyRuleRegex = /[.#]?[a-zA-Z][a-zA-Z0-9_-]*\s*{\s*}/g;
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      if (emptyRuleRegex.test(line)) {
        issues.push({
          id: `css-empty-${file}-${index}`,
          skill: 'best-practices',
          type: 'best-practice',
          severity: 'info',
          title: 'Empty CSS rule',
          description: 'Empty CSS rules should be removed',
          location: { file, line: index + 1, column: 1 },
          evidence: { code: line.trim() },
          metadata: {
            category: 'css',
            type: 'empty-rule',
            suggestion: 'Remove the empty rule',
          },
        });
      }
    });

    return issues;
  }

  private async findCSSFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.css', '.scss', '.less'];

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
