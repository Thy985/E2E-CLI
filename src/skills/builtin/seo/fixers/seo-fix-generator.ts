/**
 * SEO Fix Generator
 * 
 * 自动生成 SEO 修复代码
 */

import * as fs from 'fs';
import { Diagnosis, Fix } from '../../../../types';

export class SEOFixGenerator {
  async generateFix(diagnosis: Diagnosis, projectPath: string): Promise<Fix> {
    const { type } = diagnosis.metadata || {};
    const file = diagnosis.location.file;
    const fullPath = `${projectPath}/${file}`;

    switch (type) {
      case 'missing-description':
        return this.fixMissingDescription(fullPath, diagnosis);
      
      case 'missing-keywords':
        return this.fixMissingKeywords(fullPath, diagnosis);
      
      case 'missing-og-tag':
        return this.fixMissingOGTag(fullPath, diagnosis);
      
      case 'missing-twitter-card':
        return this.fixMissingTwitterCard(fullPath, diagnosis);
      
      case 'missing-canonical':
        return this.fixMissingCanonical(fullPath, diagnosis);
      
      case 'missing-robots':
        return this.fixMissingRobots(fullPath, diagnosis);
      
      case 'external-link-security':
        return this.fixExternalLink(fullPath, diagnosis);
      
      default:
        throw new Error(`Unsupported fix type: ${type}`);
    }
  }

  private fixMissingDescription(filePath: string, diagnosis: Diagnosis): Fix {
    return {
      id: `fix-${diagnosis.id}`,
      type: 'code-change',
      description: 'Add meta description',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: '  <meta name="description" content="Page description here (150-160 characters)">\n',
          line: this.findHeadInsertLine(filePath),
        },
      ],
    };
  }

  private fixMissingKeywords(filePath: string, diagnosis: Diagnosis): Fix {
    return {
      id: `fix-${diagnosis.id}`,
      type: 'code-change',
      description: 'Add meta keywords',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: '  <meta name="keywords" content="keyword1, keyword2, keyword3">\n',
          line: this.findHeadInsertLine(filePath),
        },
      ],
    };
  }

  private fixMissingOGTag(filePath: string, diagnosis: Diagnosis): Fix {
    const ogTag = diagnosis.title.match(/og:(\w+)/)?.[1] || 'title';
    const content = this.getOGContent(ogTag);

    return {
      id: `fix-${diagnosis.id}`,
      type: 'code-change',
      description: `Add Open Graph ${ogTag} tag`,
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: `  <meta property="og:${ogTag}" content="${content}">\n`,
          line: this.findHeadInsertLine(filePath),
        },
      ],
    };
  }

  private fixMissingTwitterCard(filePath: string, diagnosis: Diagnosis): Fix {
    return {
      id: `fix-${diagnosis.id}`,
      type: 'code-change',
      description: 'Add Twitter Card tags',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: `  <meta name="twitter:card" content="summary_large_image">\n  <meta name="twitter:title" content="Page Title">\n  <meta name="twitter:description" content="Page description">\n  <meta name="twitter:image" content="https://example.com/image.jpg">\n`,
          line: this.findHeadInsertLine(filePath),
        },
      ],
    };
  }

  private fixMissingCanonical(filePath: string, diagnosis: Diagnosis): Fix {
    return {
      id: `fix-${diagnosis.id}`,
      type: 'code-change',
      description: 'Add canonical link',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: '  <link rel="canonical" href="https://example.com/page">\n',
          line: this.findHeadInsertLine(filePath),
        },
      ],
    };
  }

  private fixMissingRobots(filePath: string, diagnosis: Diagnosis): Fix {
    return {
      id: `fix-${diagnosis.id}`,
      type: 'code-change',
      description: 'Add robots meta tag',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: '  <meta name="robots" content="index, follow">\n',
          line: this.findHeadInsertLine(filePath),
        },
      ],
    };
  }

  private fixExternalLink(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[diagnosis.location.line - 1];
    
    // 添加 rel="noopener noreferrer"
    let fixedLine = line;
    if (/rel\s*=/.test(line)) {
      fixedLine = line.replace(/rel\s*=\s*["']([^"']*)["']/i, 'rel="$1 noopener noreferrer"');
    } else {
      fixedLine = line.replace(/<a/i, '<a rel="noopener noreferrer"');
    }

    return {
      id: `fix-${diagnosis.id}`,
      type: 'code-change',
      description: 'Add rel="noopener noreferrer" to external link',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'replace',
          search: line,
          replace: fixedLine,
          line: diagnosis.location.line,
        },
      ],
    };
  }

  private findHeadInsertLine(filePath: string): number {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // 查找 </head> 标签
    for (let i = 0; i < lines.length; i++) {
      if (/<\/head>/i.test(lines[i])) {
        return i;
      }
    }
    
    // 如果没找到，查找 <head> 标签
    for (let i = 0; i < lines.length; i++) {
      if (/<head>/i.test(lines[i])) {
        return i + 1;
      }
    }
    
    return 1;
  }

  private getOGContent(tag: string): string {
    const defaults: Record<string, string> = {
      title: 'Page Title',
      description: 'Page description',
      image: 'https://example.com/image.jpg',
      url: 'https://example.com/page',
      type: 'website',
    };
    return defaults[tag] || 'Content here';
  }
}

export default SEOFixGenerator;
