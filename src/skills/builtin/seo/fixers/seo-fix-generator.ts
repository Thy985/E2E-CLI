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
    // Generate description from page title if available
    const content = fs.readFileSync(filePath, 'utf-8');
    const titleMatch = content.match(/<title>([^<]*)<\/title>/i);
    let description = 'Page description here (150-160 characters)';
    if (titleMatch && titleMatch[1]) {
      description = `Learn more about ${titleMatch[1].trim()}. This page provides detailed information and resources.`;
    }

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Add meta description',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: `  <meta name="description" content="${description}">\n`,
          position: { line: this.findHeadInsertLine(filePath) },
        },
      ],
    };
  }

  private fixMissingKeywords(filePath: string, diagnosis: Diagnosis): Fix {
    // Generate keywords from page title and existing content
    const content = fs.readFileSync(filePath, 'utf-8');
    const titleMatch = content.match(/<title>([^<]*)<\/title>/i);
    let keywords = 'keyword1, keyword2, keyword3';
    if (titleMatch && titleMatch[1]) {
      const titleWords = titleMatch[1].trim().split(/\s+/).slice(0, 5);
      keywords = titleWords.join(', ').toLowerCase();
    }

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Add meta keywords',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: `  <meta name="keywords" content="${keywords}">\n`,
          position: { line: this.findHeadInsertLine(filePath) },
        },
      ],
    };
  }

  private fixMissingOGTag(filePath: string, diagnosis: Diagnosis): Fix {
    const ogTag = diagnosis.title.match(/og:(\w+)/)?.[1] || 'title';
    const content = fs.readFileSync(filePath, 'utf-8');
    const ogContent = this.extractOGContent(ogTag, content);

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: `Add Open Graph ${ogTag} tag`,
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: `  <meta property="og:${ogTag}" content="${ogContent}">\n`,
          position: { line: this.findHeadInsertLine(filePath) },
        },
      ],
    };
  }

  private fixMissingTwitterCard(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const titleMatch = content.match(/<title>([^<]*)<\/title>/i);
    const descMatch = content.match(/<meta[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["\']/i);
    
    const title = titleMatch ? titleMatch[1].trim() : 'Page Title';
    const desc = descMatch ? descMatch[1].trim() : 'Page description';

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Add Twitter Card tags',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: `  <meta name="twitter:card" content="summary_large_image">\n  <meta name="twitter:title" content="${title}">\n  <meta name="twitter:description" content="${desc}">\n  <meta name="twitter:image" content="https://example.com/image.jpg">\n`,
          position: { line: this.findHeadInsertLine(filePath) },
        },
      ],
    };
  }

  private fixMissingCanonical(filePath: string, diagnosis: Diagnosis): Fix {
    // Try to derive canonical URL from file path
    const relativePath = filePath.split('/').filter(Boolean).join('/');
    const htmlFile = relativePath.match(/[^/]+\.html$/i);
    const pagePath = htmlFile ? htmlFile[0].replace(/\.html$/i, '') : 'page';
    const canonicalUrl = `https://example.com/${pagePath}`;

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Add canonical link',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: `  <link rel="canonical" href="${canonicalUrl}">\n`,
          position: { line: this.findHeadInsertLine(filePath) },
        },
      ],
    };
  }

  private fixMissingRobots(filePath: string, diagnosis: Diagnosis): Fix {
    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Add robots meta tag',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: '  <meta name="robots" content="index, follow">\n',
          position: { line: this.findHeadInsertLine(filePath) },
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
    if (/rel\s*=/.test(line)) {
      fixedLine = line.replace(/rel\s*=\s*["']([^"']*)["']/i, 'rel="$1 noopener noreferrer"');
    } else {
      fixedLine = line.replace(/<a/i, '<a rel="noopener noreferrer"');
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

  private extractOGContent(tag: string, content: string): string {
    const defaults: Record<string, string> = {
      title: 'Page Title',
      description: 'Page description',
      image: 'https://example.com/image.jpg',
      url: 'https://example.com/page',
      type: 'website',
    };

    // Try to extract from existing content
    switch (tag) {
      case 'title': {
        const titleMatch = content.match(/<title>([^<]*)<\/title>/i);
        return titleMatch ? titleMatch[1].trim() : defaults.title;
      }
      case 'description': {
        const descMatch = content.match(/<meta[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["\']/i);
        return descMatch ? descMatch[1].trim() : defaults.description;
      }
      case 'url': {
        const canonicalMatch = content.match(/<link[^>]*rel\s*=\s*["']canonical["\'][^>]*href\s*=\s*["']([^"']*)["\']/i);
        return canonicalMatch ? canonicalMatch[1].trim() : defaults.url;
      }
      default:
        return defaults[tag] || 'Content here';
    }
  }
}

export default SEOFixGenerator;
