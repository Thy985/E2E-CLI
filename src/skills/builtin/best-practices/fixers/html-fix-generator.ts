/**
 * HTML Fix Generator
 * 
 * 自动生成 HTML 修复代码
 */

import * as fs from 'fs';
import { Diagnosis, Fix } from '../../../../types';

export class HTMLFixGenerator {
  async generateFix(diagnosis: Diagnosis, projectPath: string): Promise<Fix> {
    const { type } = diagnosis.metadata || {};
    const file = diagnosis.location.file;
    const fullPath = `${projectPath}/${file}`;

    switch (type) {
      case 'missing-lang':
        return this.fixMissingLang(fullPath, diagnosis);
      
      case 'missing-viewport':
        return this.fixMissingViewport(fullPath, diagnosis);
      
      case 'missing-title':
        return this.fixMissingTitle(fullPath, diagnosis);
      
      case 'missing-alt':
        return this.fixMissingAlt(fullPath, diagnosis);
      
      case 'missing-label':
        return this.fixMissingLabel(fullPath, diagnosis);
      
      case 'external-link-security':
        return this.fixExternalLink(fullPath, diagnosis);
      
      default:
        throw new Error(`Unsupported fix type: ${type}`);
    }
  }

  private fixMissingLang(filePath: string, diagnosis: Diagnosis): Fix {
    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Add lang attribute to html element',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'replace',
          oldContent: '<html>',
          content: '<html lang="en">',
          position: { line: diagnosis.location.line || 0 },
        },
      ],
    };
  }

  private fixMissingViewport(filePath: string, diagnosis: Diagnosis): Fix {
    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Add viewport meta tag',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n',
          position: { line: (diagnosis.location.line || 0) + 1 },
        },
      ],
    };
  }

  private fixMissingTitle(filePath: string, diagnosis: Diagnosis): Fix {
    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Add title element',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: '  <title>Page Title</title>\n',
          position: { line: (diagnosis.location.line || 0) + 1 },
        },
      ],
    };
  }

  private fixMissingAlt(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[(diagnosis.location.line || 1) - 1];
    
    // 在 img 标签中添加 alt=""
    const fixedLine = line.replace(/<img([^>]*)>/i, '<img$1 alt="">');

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Add empty alt attribute to image',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'replace',
          oldContent: line,
          content: fixedLine,
          position: { line: diagnosis.location.line || 0 },
        },
      ],
    };
  }

  private fixMissingLabel(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[(diagnosis.location.line || 1) - 1];
    
    // 提取 input 的 id 或 name
    const idMatch = line.match(/id\s*=\s*["']([^"']+)["']/i);
    const nameMatch = line.match(/name\s*=\s*["']([^"']+)["']/i);
    const identifier = idMatch ? idMatch[1] : (nameMatch ? nameMatch[1] : 'input');
    
    // 添加 aria-label
    const fixedLine = line.replace(/<input/i, `<input aria-label="${identifier}"`);

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Add aria-label to input',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'replace',
          oldContent: line,
          content: fixedLine,
          position: { line: diagnosis.location.line || 0 },
        },
      ],
    };
  }

  private fixExternalLink(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[(diagnosis.location.line || 1) - 1];
    
    // 添加 rel="noopener noreferrer"
    let fixedLine = line;
    if (/target\s*=\s*["']_blank["']/i.test(line)) {
      if (/rel\s*=/.test(line)) {
        // 已有 rel，添加 noopener
        fixedLine = line.replace(/rel\s*=\s*["']([^"']*)["']/i, 'rel="$1 noopener noreferrer"');
      } else {
        // 没有 rel，添加新的
        fixedLine = line.replace(/<a/i, '<a rel="noopener noreferrer"');
      }
    }

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Add rel="noopener noreferrer" to external link',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'replace',
          oldContent: line,
          content: fixedLine,
          position: { line: diagnosis.location.line || 0 },
        },
      ],
    };
  }
}

export default HTMLFixGenerator;
