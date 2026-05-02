/**
 * CSS ä¿®å¤çæå? * 
 * èªå¨çæ CSS/æ ·å¼ä¿®å¤ä»£ç 
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
        throw new Error(`ä¸æ¯æçä¿®å¤ç±»å: ${type}`);
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
        throw new Error(`ä¸æ¯æçä¿®å¤ç±»å: ${type}`);
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
      description: `å°ç¡¬ç¼ç é¢è² ${current} æ¿æ¢ä¸ºè®¾è®¡ä»¤ç?${suggestion}`,
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
      description: `å°é´è·?${current} è°æ´ä¸ºè§èå?${suggestion}`,
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
      description: `å°åè§?${current} è°æ´ä¸ºè§èå?${suggestion}`,
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
    // è¯»åæä»¶åå®¹ä»¥æ¾å°åéçæå¥ä½ç½®
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // æ¾å°åç´ éæ©å¨çç»æä½ç½®
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
      description: `ä¸?${element} æ·»å  hover ç¶æ`,
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
      description: `ä¸?${element} æ·»å  focus ç¶æ`,
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
      description: `ä¸?${element} æ·»å  active ç¶æ`,
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
      description: `ä¸?${element} æ·»å  disabled ç¶æ`,
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
