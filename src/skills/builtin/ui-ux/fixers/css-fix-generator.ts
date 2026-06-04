/**
 * CSS Fix Generator
 * Auto-generates CSS/style fix code
 */

import * as fs from 'fs/promises';
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
        throw new Error(`Unsupported fix type: ${type}`);
    }
  }

  async generateInteractionFix(diagnosis: Diagnosis, projectPath: string): Promise<Fix> {
    const { type, element, suggestion } = diagnosis.metadata || {};
    const file = diagnosis.location.file;
    const fullPath = `${projectPath}/${file}`;

    switch (type) {
      case 'missing-hover-state':
        return await this.generateHoverStateFix(fullPath, element, suggestion, diagnosis);

      case 'missing-focus-state':
        return await this.generateFocusStateFix(fullPath, element, suggestion, diagnosis);

      case 'missing-active-state':
        return await this.generateActiveStateFix(fullPath, element, suggestion, diagnosis);

      case 'missing-disabled-state':
        return await this.generateDisabledStateFix(fullPath, element, suggestion, diagnosis);

      default:
        throw new Error(`Unsupported fix type: ${type}`);
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
      description: `Replace hardcoded color ${current} with design token ${suggestion}`,
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
      description: `Adjust spacing ${current} to standard ${suggestion}`,
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
      description: `Adjust radius ${current} to standard ${suggestion}`,
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

  private async generateHoverStateFix(
    filePath: string,
    element: string,
    suggestion: string,
    diagnosis: Diagnosis
  ): Promise<Fix> {
    const content = await fs.readFile(filePath, 'utf-8');
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
      description: `Add hover state for ${element}`,
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

  private async generateFocusStateFix(
    filePath: string,
    element: string,
    suggestion: string,
    diagnosis: Diagnosis
  ): Promise<Fix> {
    const content = await fs.readFile(filePath, 'utf-8');
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
      description: `Add focus state for ${element}`,
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

  private async generateActiveStateFix(
    filePath: string,
    element: string,
    suggestion: string,
    diagnosis: Diagnosis
  ): Promise<Fix> {
    const content = await fs.readFile(filePath, 'utf-8');
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
      description: `Add active state for ${element}`,
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

  private async generateDisabledStateFix(
    filePath: string,
    element: string,
    suggestion: string,
    diagnosis: Diagnosis
  ): Promise<Fix> {
    const content = await fs.readFile(filePath, 'utf-8');
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
      description: `Add disabled state for ${element}`,
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
