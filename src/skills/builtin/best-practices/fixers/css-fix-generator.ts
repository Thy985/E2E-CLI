/**
 * CSS Fix Generator
 *
 * 自动生成 CSS 修复代码
 */

import * as fs from 'fs/promises';
import { Diagnosis, Fix } from '../../../../types';

export class CSSFixGenerator {
  async generateFix(diagnosis: Diagnosis, projectPath: string): Promise<Fix> {
    const { type } = diagnosis.metadata || {};
    const file = diagnosis.location.file;
    const fullPath = `${projectPath}/${file}`;

    switch (type) {
      case 'at-import':
        return await this.fixAtImport(fullPath, diagnosis);

      case 'empty-rule':
        return await this.fixEmptyRule(fullPath, diagnosis);

      case 'important-overuse':
        return await this.fixImportantOveruse(fullPath, diagnosis);

      case 'id-selector':
        return await this.fixIdSelector(fullPath, diagnosis);

      case 'universal-selector':
        return await this.fixUniversalSelector(fullPath, diagnosis);

      default:
        throw new Error(`Unsupported fix type: ${type}`);
    }
  }

  private async fixAtImport(filePath: string, diagnosis: Diagnosis): Promise<Fix> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[(diagnosis.location.line || 1) - 1];

    // 提取 URL
    const urlMatch = line.match(/@import\s+url\(['"]?([^'"]+)['"]?\)/i);
    const url = urlMatch ? urlMatch[1] : '';

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: `Remove @import and suggest using <link> tag instead`,
      riskLevel: 'medium',
      changes: [
        {
          file: filePath,
          type: 'delete',
          position: { line: diagnosis.location.line || 0 },
        },
      ],
      notes: `Add this to HTML instead: <link rel="stylesheet" href="${url}">`,
    };
  }

  private async fixEmptyRule(filePath: string, diagnosis: Diagnosis): Promise<Fix> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[(diagnosis.location.line || 1) - 1];

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Remove empty CSS rule',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'delete',
          position: { line: diagnosis.location.line || 0 },
        },
      ],
    };
  }

  private async fixImportantOveruse(filePath: string, diagnosis: Diagnosis): Promise<Fix> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[(diagnosis.location.line || 1) - 1];

    // 移除 !important
    const fixedLine = line.replace(/\s*!important/g, '');

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Remove !important (review specificity)',
      riskLevel: 'high',
      changes: [
        {
          file: filePath,
          type: 'replace',
          oldContent: line,
          content: fixedLine,
          position: { line: diagnosis.location.line || 0 },
        },
      ],
      notes: 'Review CSS specificity to ensure styles still apply correctly',
    };
  }

  private async fixIdSelector(filePath: string, diagnosis: Diagnosis): Promise<Fix> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[(diagnosis.location.line || 1) - 1];

    // 将 #id 替换为 .class
    const fixedLine = line.replace(/#([a-zA-Z][a-zA-Z0-9_-]*)/g, '.$1');

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Convert ID selector to class selector',
      riskLevel: 'high',
      changes: [
        {
          file: filePath,
          type: 'replace',
          oldContent: line,
          content: fixedLine,
          position: { line: diagnosis.location.line || 0 },
        },
      ],
      notes: 'Remember to update HTML to use class instead of id',
    };
  }

  private async fixUniversalSelector(filePath: string, diagnosis: Diagnosis): Promise<Fix> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[(diagnosis.location.line || 1) - 1];

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Remove universal selector (manual review needed)',
      riskLevel: 'high',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: '/* TODO: Replace universal selector with specific selectors */',
          position: { line: diagnosis.location.line || 0 },
        },
      ],
      notes: 'Universal selector impacts performance. Consider using more specific selectors.',
    };
  }
}

export default CSSFixGenerator;
