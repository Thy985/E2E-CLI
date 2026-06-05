/**
 * CSS 修复生成器
 *
 * 自动生成 CSS/样式修复代码
 */

import * as fsp from 'fs/promises';
import { Diagnosis, Fix } from '../../../../types';

const STATE_FIX_HANDLERS = {
  'missing-hover-state': (element: string, suggestion: string) =>
    `\n  &:hover {\n    ${suggestion}\n  }`,
  'missing-focus-state': (element: string, suggestion: string) =>
    `\n  &:focus {\n    ${suggestion}\n  }`,
  'missing-active-state': (element: string, suggestion: string) =>
    `\n  &:active {\n    ${suggestion}\n  }`,
  'missing-disabled-state': (element: string, suggestion: string) =>
    `\n  &:disabled {\n    ${suggestion}\n  }`,
} as const satisfies Record<string, (element: string, suggestion: string) => string>;

type InteractionFixType = keyof typeof STATE_FIX_HANDLERS;

const VISUAL_FIX_DESCRIPTIONS = {
  'color-mismatch': (current: string, suggestion: string) =>
    `将硬编码颜色 ${current} 替换为设计令牌 ${suggestion}`,
  'spacing-inconsistent': (current: string, suggestion: string) =>
    `将间距 ${current} 调整为规范值 ${suggestion}`,
  'border-radius-mismatch': (current: string, suggestion: string) =>
    `将圆角 ${current} 调整为规范值 ${suggestion}`,
} as const;

type VisualFixType = keyof typeof VISUAL_FIX_DESCRIPTIONS;

export class CSSFixGenerator {
  async generateVisualFix(diagnosis: Diagnosis, projectPath: string): Promise<Fix> {
    const metadata = diagnosis.metadata || {};
    const type = metadata.type as string | undefined;
    const file = diagnosis.location.file;
    const fullPath = `${projectPath}/${file}`;
    const current = String(metadata.current ?? '');
    const suggestion = String(metadata.suggestion ?? '');

    if (!type || !(type in VISUAL_FIX_DESCRIPTIONS)) {
      throw new Error(`不支持的修复类型: ${type ?? '(missing)'}`);
    }

    return this.buildVisualFix(
      fullPath,
      type as VisualFixType,
      current,
      suggestion,
      diagnosis
    );
  }

  async generateInteractionFix(diagnosis: Diagnosis, projectPath: string): Promise<Fix> {
    const metadata = diagnosis.metadata || {};
    const type = metadata.type as InteractionFixType | undefined;
    const file = diagnosis.location.file;
    const fullPath = `${projectPath}/${file}`;
    const element = String(metadata.element ?? '');
    const suggestion = String(metadata.suggestion ?? '');

    if (!type || !(type in STATE_FIX_HANDLERS)) {
      throw new Error(`不支持的修复类型: ${type ?? '(missing)'}`);
    }

    // 找 CSS 块结束行（首个独立的 `}`），4 个 stateFix 共享同一查找逻辑
    const startLine = diagnosis.location.line || 0;
    const content = await fsp.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');
    const insertLine = findClosingBraceLine(lines, startLine);

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: `为 ${element} 添加 ${type.replace('missing-', '').replace('-state', '')} 状态`,
      riskLevel: 'low',
      changes: [
        {
          file: fullPath,
          type: 'insert',
          content: STATE_FIX_HANDLERS[type](element, suggestion),
          position: { line: insertLine },
        },
      ],
    };
  }

  private buildVisualFix(
    filePath: string,
    type: VisualFixType,
    current: string,
    suggestion: string,
    diagnosis: Diagnosis
  ): Fix {
    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: VISUAL_FIX_DESCRIPTIONS[type](current, suggestion),
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'replace',
          oldContent: current,
          content: suggestion,
          position: { line: diagnosis.location.line || 0 },
        },
      ],
    };
  }
}

/**
 * 找 CSS/SCSS/Less 块的结束行：从 startLine 开始向下扫描，返回首个
 * 独立 `}` 行的 0-based 索引。如果没找到就返回 startLine。
 */
function findClosingBraceLine(lines: string[], startLine: number): number {
  for (let i = startLine; i < lines.length; i++) {
    if (lines[i].trim() === '}' || lines[i].includes('}')) {
      return i;
    }
  }
  return startLine;
}
