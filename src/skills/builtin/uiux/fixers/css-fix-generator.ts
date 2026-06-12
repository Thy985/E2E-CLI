/**
 * CSS Ã¤Â¿Â®Ã¥Â¤ÂÃ§Â”ÂŸÃ¦ÂˆÂÃ¥Â™? * 
 * Ã¨Â‡ÂªÃ¥ÂŠÂ¨Ã§Â”ÂŸÃ¦ÂˆÂ CSS/Ã¦ Â·Ã¥Â¼ÂÃ¤Â¿Â®Ã¥Â¤ÂÃ¤Â»Â£Ã§ Â
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
        throw new Error(`Ã¤Â¸ÂÃ¦Â”Â¯Ã¦ÂŒÂÃ§ÂšÂ„Ã¤Â¿Â®Ã¥Â¤ÂÃ§Â±Â»Ã¥ÂžÂ‹: ${type}`);
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
        throw new Error(`Ã¤Â¸ÂÃ¦Â”Â¯Ã¦ÂŒÂÃ§ÂšÂ„Ã¤Â¿Â®Ã¥Â¤ÂÃ§Â±Â»Ã¥ÂžÂ‹: ${type}`);
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
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: `Ã¥Â°Â†Ã§Â¡Â¬Ã§Â¼Â–Ã§ ÂÃ©Â¢ÂœÃ¨Â‰Â² ${current} Ã¦Â›Â¿Ã¦ÂÂ¢Ã¤Â¸ÂºÃ¨Â®Â¾Ã¨Â®Â¡Ã¤Â»Â¤Ã§Â‰?${suggestion}`,
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

  private generateSpacingFix(
    filePath: string,
    current: string,
    suggestion: string,
    diagnosis: Diagnosis
  ): Fix {
    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: `Ã¥Â°Â†Ã©Â—Â´Ã¨Â·?${current} Ã¨Â°ÂƒÃ¦Â•Â´Ã¤Â¸ÂºÃ¨Â§Â„Ã¨ÂŒÂƒÃ¥Â€?${suggestion}`,
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

  private generateRadiusFix(
    filePath: string,
    current: string,
    suggestion: string,
    diagnosis: Diagnosis
  ): Fix {
    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: `Ã¥Â°Â†Ã¥ÂœÂ†Ã¨Â§?${current} Ã¨Â°ÂƒÃ¦Â•Â´Ã¤Â¸ÂºÃ¨Â§Â„Ã¨ÂŒÂƒÃ¥Â€?${suggestion}`,
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
    let insertLine = diagnosis.location.line || 0;
    for (let i = (diagnosis.location.line || 0); i < lines.length; i++) {
      if (lines[i].trim() === '}' || lines[i].includes('}')) {
        insertLine = i;
        break;
      }
    }

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: `Ã¤Â¸?${element} Ã¦Â·Â»Ã¥ÂŠ  hover Ã§ÂŠÂ¶Ã¦Â€Â`,
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: `\n  &:hover {\n    ${suggestion}\n  }`,
          position: { line: insertLine },
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
    
    let insertLine = diagnosis.location.line || 0;
    for (let i = (diagnosis.location.line || 0); i < lines.length; i++) {
      if (lines[i].trim() === '}' || lines[i].includes('}')) {
        insertLine = i;
        break;
      }
    }

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: `Ã¤Â¸?${element} Ã¦Â·Â»Ã¥ÂŠ  focus Ã§ÂŠÂ¶Ã¦Â€Â`,
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: `\n  &:focus {\n    ${suggestion}\n  }`,
          position: { line: insertLine },
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
    
    let insertLine = diagnosis.location.line || 0;
    for (let i = (diagnosis.location.line || 0); i < lines.length; i++) {
      if (lines[i].trim() === '}' || lines[i].includes('}')) {
        insertLine = i;
        break;
      }
    }

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: `Ã¤Â¸?${element} Ã¦Â·Â»Ã¥ÂŠ  active Ã§ÂŠÂ¶Ã¦Â€Â`,
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: `\n  &:active {\n    ${suggestion}\n  }`,
          position: { line: insertLine },
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
    
    let insertLine = diagnosis.location.line || 0;
    for (let i = (diagnosis.location.line || 0); i < lines.length; i++) {
      if (lines[i].trim() === '}' || lines[i].includes('}')) {
        insertLine = i;
        break;
      }
    }

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: `Ã¤Â¸?${element} Ã¦Â·Â»Ã¥ÂŠ  disabled Ã§ÂŠÂ¶Ã¦Â€Â`,
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: `\n  &:disabled {\n    ${suggestion}\n  }`,
          position: { line: insertLine },
        },
      ],
    };
  }
}
