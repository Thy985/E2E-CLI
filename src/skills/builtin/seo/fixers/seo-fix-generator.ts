/**
 * SEO Fix Generator
 *
 * 自动生成 SEO 修复代码
 */

import * as fs from 'fs/promises';
import { Diagnosis, Fix } from '../../../../types';

export class SEOFixGenerator {
  async generateFix(diagnosis: Diagnosis, projectPath: string): Promise<Fix> {
    const { type } = diagnosis.metadata || {};
    const file = diagnosis.location.file;
    const fullPath = `${projectPath}/${file}`;

    switch (type) {
      case 'missing-description':
        return await this.fixMissingDescription(fullPath, diagnosis);

      case 'missing-keywords':
        return await this.fixMissingKeywords(fullPath, diagnosis);

      case 'missing-og-tag':
        return await this.fixMissingOGTag(fullPath, diagnosis);

      case 'missing-twitter-card':
        return await this.fixMissingTwitterCard(fullPath, diagnosis);

      case 'missing-canonical':
        return await this.fixMissingCanonical(fullPath, diagnosis);

      case 'missing-robots':
        return await this.fixMissingRobots(fullPath, diagnosis);

      case 'external-link-security':
        return await this.fixExternalLink(fullPath, diagnosis);

      default:
        throw new Error(`Unsupported fix type: ${type}`);
    }
  }

  private async fixMissingDescription(filePath: string, diagnosis: Diagnosis): Promise<Fix> {
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
          content: '  <meta name="description" content="Page description here (150-160 characters)">\n',
          position: { line: await this.findHeadInsertLine(filePath) },
        },
      ],
    };
  }

  private async fixMissingKeywords(filePath: string, diagnosis: Diagnosis): Promise<Fix> {
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
          content: '  <meta name="keywords" content="keyword1, keyword2, keyword3">\n',
          position: { line: await this.findHeadInsertLine(filePath) },
        },
      ],
    };
  }

  private async fixMissingOGTag(filePath: string, diagnosis: Diagnosis): Promise<Fix> {
    const ogTag = diagnosis.title.match(/og:(\w+)/)?.[1] || 'title';
    const content = this.getOGContent(ogTag);

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
          content: `  <meta property="og:${ogTag}" content="${content}">\n`,
          position: { line: await this.findHeadInsertLine(filePath) },
        },
      ],
    };
  }

  private async fixMissingTwitterCard(filePath: string, diagnosis: Diagnosis): Promise<Fix> {
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
          content: `  <meta name="twitter:card" content="summary_large_image">\n  <meta name="twitter:title" content="Page Title">\n  <meta name="twitter:description" content="Page description">\n  <meta name="twitter:image" content="https://example.com/image.jpg">\n`,
          position: { line: await this.findHeadInsertLine(filePath) },
        },
      ],
    };
  }

  private async fixMissingCanonical(filePath: string, diagnosis: Diagnosis): Promise<Fix> {
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
          content: '  <link rel="canonical" href="https://example.com/page">\n',
          position: { line: await this.findHeadInsertLine(filePath) },
        },
      ],
    };
  }

  private async fixMissingRobots(filePath: string, diagnosis: Diagnosis): Promise<Fix> {
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
          position: { line: await this.findHeadInsertLine(filePath) },
        },
      ],
    };
  }

  private async fixExternalLink(filePath: string, diagnosis: Diagnosis): Promise<Fix> {
    const content = await fs.readFile(filePath, 'utf-8');
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

  private async findHeadInsertLine(filePath: string): Promise<number> {
    const content = await fs.readFile(filePath, 'utf-8');
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
