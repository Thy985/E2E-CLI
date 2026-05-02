/**
 * CSS Fix Generator
 * 
 * 鑷姩生成 CSS 淇以ｇ爜
 */

import * as fs from 'fs';
import { Diagnosis, Fix } from '../../../../types';

export class CSSFixGenerator {
  async generateFix(diagnosis: Diagnosis, projectPath: string): Promise<Fix> {
    const { type } = diagnosis.metadata || {};
    const file = diagnosis.location.file;
    const fullPath = `${projectPath}/${file}`;

    switch (type) {
      case 'at-import':
        return this.fixAtImport(fullPath, diagnosis);
      
      case 'empty-rule':
        return this.fixEmptyRule(fullPath, diagnosis);
      
      case 'important-overuse':
        return this.fixImportantOveruse(fullPath, diagnosis);
      
      case 'id-selector':
        return this.fixIdSelector(fullPath, diagnosis);
      
      case 'universal-selector':
        return this.fixUniversalSelector(fullPath, diagnosis);
      
      default:
        throw new Error(`Unsupported fix type: ${type}`);
    }
  }

  private fixAtImport(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[(diagnosis.location.line || 1) - 1];
    
    // 鎻愬彇 URL
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

  private fixEmptyRule(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
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

  private fixImportantOveruse(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[(diagnosis.location.line || 1) - 1];
    
    // 绉婚櫎 !important
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

  private fixIdSelector(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[(diagnosis.location.line || 1) - 1];
    
    // 灏?#id 杞崲涓?.class
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

  private fixUniversalSelector(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
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


