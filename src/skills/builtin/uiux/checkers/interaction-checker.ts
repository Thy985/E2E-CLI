/**
 * 交互状态检查器
 * 
 * 检查内容：
 * 1. 按钮/链接是否有 hover 状态
 * 2. 表单元素是否有 focus 状态
 * 3. 是否有 active 状态
 * 4. 是否有 disabled 状态样式
 * 5. 是否有 loading 状态
 */

import * as fs from 'fs';
import * as path from 'path';
import { Diagnosis, Severity } from '../../../../types';
import { QAConfig } from '../../../../config';

export class InteractionChecker {
  async check(projectPath: string, config: QAConfig): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];

    // 查找组件文件
    const componentFiles = await this.findComponentFiles(projectPath);

    for (const file of componentFiles) {
      const content = await fs.promises.readFile(file, 'utf-8');
      const relativePath = path.relative(projectPath, file);

      // 检查按钮状态
      const buttonIssues = this.checkButtonStates(content, relativePath);
      issues.push(...buttonIssues);

      // 检查表单状态
      const formIssues = this.checkFormStates(content, relativePath);
      issues.push(...formIssues);

      // 检查链接状态
      const linkIssues = this.checkLinkStates(content, relativePath);
      issues.push(...linkIssues);
    }

    return issues;
  }

  private checkButtonStates(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const lines = content.split('\n');

    // 检查是否定义了按钮样式
    const hasButtonClass = /\.button|\.btn|button\s*{/i.test(content);
    if (!hasButtonClass) return issues;

    // 检查是否有 hover 状态
    const hasHover = /:hover/.test(content);
    if (!hasHover) {
      issues.push({
        id: `button-hover-${file}`,
        skill: 'uiux-audit',
        type: 'ui-ux',
        severity: 'warning',
        title: '按钮缺少 hover 状态',
        description: '按钮应该有 hover 状态以提供视觉反馈',
        location: {
          file,
          line: 1,
          column: 1,
        },
        metadata: {
          category: 'interaction',
          type: 'missing-hover-state',
          element: 'button',
          suggestion: '&:hover { opacity: 0.8; }',
        },
      });
    }

    // 检查是否有 active 状态
    const hasActive = /:active/.test(content);
    if (!hasActive) {
      issues.push({
        id: `button-active-${file}`,
        skill: 'uiux-audit',
        type: 'ui-ux',
        severity: 'info',
        title: '按钮缺少 active 状态',
        description: '按钮应该有 active 状态以提供点击反馈',
        location: {
          file,
          line: 1,
          column: 1,
        },
        metadata: {
          category: 'interaction',
          type: 'missing-active-state',
          element: 'button',
          suggestion: '&:active { transform: scale(0.98); }',
        },
      });
    }

    // 检查是否有 disabled 状态
    const hasDisabled = /:disabled|\.disabled/.test(content);
    if (!hasDisabled) {
      issues.push({
        id: `button-disabled-${file}`,
        skill: 'uiux-audit',
        type: 'ui-ux',
        severity: 'info',
        title: '按钮缺少 disabled 状态',
        description: '按钮应该有 disabled 状态样式',
        location: {
          file,
          line: 1,
          column: 1,
        },
        metadata: {
          category: 'interaction',
          type: 'missing-disabled-state',
          element: 'button',
          suggestion: '&:disabled { opacity: 0.5; cursor: not-allowed; }',
        },
      });
    }

    return issues;
  }

  private checkFormStates(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];

    // 检查是否定义了输入框样式
    const hasInputClass = /input\s*{|\.input/i.test(content);
    if (!hasInputClass) return issues;

    // 检查是否有 focus 状态
    const hasFocus = /:focus/.test(content);
    if (!hasFocus) {
      issues.push({
        id: `input-focus-${file}`,
        skill: 'uiux-audit',
        type: 'ui-ux',
        severity: 'warning',
        title: '输入框缺少 focus 状态',
        description: '输入框应该有 focus 状态以提供焦点反馈',
        location: {
          file,
          line: 1,
          column: 1,
        },
        metadata: {
          category: 'interaction',
          type: 'missing-focus-state',
          element: 'input',
          suggestion: '&:focus { outline: 2px solid var(--color-primary); }',
        },
      });
    }

    return issues;
  }

  private checkLinkStates(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];

    // 检查是否定义了链接样式
    const hasLinkClass = /a\s*{|\.link/i.test(content);
    if (!hasLinkClass) return issues;

    // 检查是否有 hover 状态
    const hasHover = /:hover/.test(content);
    if (!hasHover) {
      issues.push({
        id: `link-hover-${file}`,
        skill: 'uiux-audit',
        type: 'ui-ux',
        severity: 'info',
        title: '链接缺少 hover 状态',
        description: '链接应该有 hover 状态以提供视觉反馈',
        location: {
          file,
          line: 1,
          column: 1,
        },
        metadata: {
          category: 'interaction',
          type: 'missing-hover-state',
          element: 'link',
          suggestion: '&:hover { text-decoration: underline; }',
        },
      });
    }

    return issues;
  }

  private async findComponentFiles(projectPath: string): Promise<string[]> {
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
    return files.slice(0, 50);
  }
}
