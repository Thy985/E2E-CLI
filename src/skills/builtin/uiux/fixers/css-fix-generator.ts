/**
 * CSS 修复生成�? * 
 * 自动生成 CSS/样式修复代码
 */

import * as fs from 'fs';
import { Diagnosis, Fix } from '../../../../types';

export class CSSFixGenerator {
  async generateVisualFix(diagnosis: Diagnosis, projectPath: string): Promise<Fix> {
    const { type, current, suggestion } = diagnosis.metadata || {};
    const file = diagnosis.location.file;
    const fullPath = `${projectPath}/${file}`;

    switch (type) {
      case 'color-mismatch':
        return this.generateColorFix(fullPath, current, suggestion, diagnosis);
      
      case 'spacing-inconsistent':
        return this.generateSpacingFix(fullPath, current, suggestion, diagnosis);
      
      case 'border-radius-mismatch':
        return this.generateRadiusFix(fullPath, current, suggestion, diagnosis);
      
      default:
        throw new Error(`不支持的修复类型: ${type}`);
    }
  }

  async generateInteractionFix(diagnosis: Diagnosis, projectPath: string): Promise<Fix> {
    const { type, element, suggestion } = diagnosis.metadata || {};
    const file = diagnosis.location.file;
    const fullPath = `${projectPath}/${file}`;

    switch (type) {
      case 'missing-hover-state':
        return this.generateHoverStateFix(fullPath, element, suggestion, diagnosis);
      
      case 'missing-focus-state':
        return this.generateFocusStateFix(fullPath, element, suggestion, diagnosis);
      
      case 'missing-active-state':
        return this.generateActiveStateFix(fullPath, element, suggestion, diagnosis);
      
      case 'missing-disabled-state':
        return this.generateDisabledStateFix(fullPath, element, suggestion, diagnosis);
      
      default:
        throw new Error(`不支持的修复类型: ${type}`);
    }
  }

  private generateColorFix(
    filePath: string,
    current: string,
    suggestion: string,
    diagnosis: Diagnosis
  ): Fix {
    return {
      id: `fix-${diagnosis.id}`,
      type: 'code-change',
      description: `将硬编码颜色 ${current} 替换为设计令�?${suggestion}`,
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'replace',
          search: current,
          replace: suggestion,
          line: diagnosis.location.line,
        },
      ],
    };
  }

  private generateSpacingFix(
    filePath: string,
    current: string,
    suggestion: string,
    diagnosis: Diagnosis
  ): Fix {
    return {
      id: `fix-${diagnosis.id}`,
      type: "code-change",
      description: `将间�?${current} 调整为规范�?${suggestion}`,
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'replace',
          search: current,
          replace: suggestion,
          line: diagnosis.location.line,
        },
      ],
    };
  }

  private generateRadiusFix(
    filePath: string,
    current: string,
    suggestion: string,
    diagnosis: Diagnosis
  ): Fix {
    return {
      id: `fix-${diagnosis.id}`,
      type: "code-change",
      description: `将圆�?${current} 调整为规范�?${suggestion}`,
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'replace',
          search: current,
          replace: suggestion,
          line: diagnosis.location.line,
        },
      ],
    };
  }

  private generateHoverStateFix(
    filePath: string,
    element: string,
    suggestion: string,
    diagnosis: Diagnosis
  ): Fix {
    // 读取文件内容以找到合适的插入位置
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // 找到元素选择器的结束位置
    let insertLine = diagnosis.location.line;
    for (let i = diagnosis.location.line; i < lines.length; i++) {
      if (lines[i].trim() === '}' || lines[i].includes('}')) {
        insertLine = i;
        break;
      }
    }

    return {
      id: `fix-${diagnosis.id}`,
      type: "code-change",
      description: `�?${element} 添加 hover 状态`,
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: `\n  &:hover {\n    ${suggestion}\n  }`,
          line: insertLine,
        },
      ],
    };
  }

  private generateFocusStateFix(
    filePath: string,
    element: string,
    suggestion: string,
    diagnosis: Diagnosis
  ): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    let insertLine = diagnosis.location.line;
    for (let i = diagnosis.location.line; i < lines.length; i++) {
      if (lines[i].trim() === '}' || lines[i].includes('}')) {
        insertLine = i;
        break;
      }
    }

    return {
      id: `fix-${diagnosis.id}`,
      type: "code-change",
      description: `�?${element} 添加 focus 状态`,
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: `\n  &:focus {\n    ${suggestion}\n  }`,
          line: insertLine,
        },
      ],
    };
  }

  private generateActiveStateFix(
    filePath: string,
    element: string,
    suggestion: string,
    diagnosis: Diagnosis
  ): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    let insertLine = diagnosis.location.line;
    for (let i = diagnosis.location.line; i < lines.length; i++) {
      if (lines[i].trim() === '}' || lines[i].includes('}')) {
        insertLine = i;
        break;
      }
    }

    return {
      id: `fix-${diagnosis.id}`,
      type: "code-change",
      description: `�?${element} 添加 active 状态`,
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: `\n  &:active {\n    ${suggestion}\n  }`,
          line: insertLine,
        },
      ],
    };
  }

  private generateDisabledStateFix(
    filePath: string,
    element: string,
    suggestion: string,
    diagnosis: Diagnosis
  ): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    let insertLine = diagnosis.location.line;
    for (let i = diagnosis.location.line; i < lines.length; i++) {
      if (lines[i].trim() === '}' || lines[i].includes('}')) {
        insertLine = i;
        break;
      }
    }

    return {
      id: `fix-${diagnosis.id}`,
      type: "code-change",
      description: `�?${element} 添加 disabled 状态`,
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: `\n  &:disabled {\n    ${suggestion}\n  }`,
          line: insertLine,
        },
      ],
    };
  }
}
