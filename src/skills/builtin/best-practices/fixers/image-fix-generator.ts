/**
 * Image Fix Generator
 * 
 * 自动生成图片优化修复代码
 */

import * as fs from 'fs';
import { Diagnosis, Fix } from '../../../../types';

export class ImageFixGenerator {
  async generateFix(diagnosis: Diagnosis, projectPath: string): Promise<Fix> {
    const { type } = diagnosis.metadata || {};
    const file = diagnosis.location.file;
    const fullPath = `${projectPath}/${file}`;

    switch (type) {
      case 'missing-dimensions':
        return this.fixMissingDimensions(fullPath, diagnosis);
      
      case 'missing-lazy-loading':
        return this.fixMissingLazyLoading(fullPath, diagnosis);
      
      case 'legacy-format':
        return this.fixLegacyFormat(fullPath, diagnosis);
      
      default:
        throw new Error(`Unsupported fix type: ${type}`);
    }
  }

  private fixMissingDimensions(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[diagnosis.location.line - 1];
    
    // 添加 width 和 height 属性（使用占位值）
    let fixedLine = line;
    
    if (!/width=/.test(line)) {
      fixedLine = fixedLine.replace(/<img/i, '<img width=""');
    }
    if (!/height=/.test(line)) {
      fixedLine = fixedLine.replace(/<img/i, '<img height=""');
    }

    return {
      id: `fix-${diagnosis.id}`,
      type: 'code-change',
      description: 'Add width and height attributes to prevent layout shift',
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
      notes: 'Fill in actual dimensions: width="800" height="600"',
    };
  }

  private fixMissingLazyLoading(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[diagnosis.location.line - 1];
    
    // 添加 loading="lazy"
    const fixedLine = line.replace(/<img/i, '<img loading="lazy"');

    return {
      id: `fix-${diagnosis.id}`,
      type: 'code-change',
      description: 'Add lazy loading to image',
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
      notes: 'Images above the fold should use loading="eager" instead',
    };
  }

  private fixLegacyFormat(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[diagnosis.location.line - 1];
    
    // 提取 src
    const srcMatch = line.match(/src\s*=\s*["']([^"']+)["']/);
    if (!srcMatch) {
      throw new Error('Could not find image src');
    }

    const src = srcMatch[1];
    const webpSrc = src.replace(/\.(jpg|jpeg|png)$/i, '.webp');
    
    // 构建 picture 元素
    const altMatch = line.match(/alt\s*=\s*["']([^"']*)["']/);
    const alt = altMatch ? altMatch[1] : '';
    
    const pictureElement = `<picture>
  <source srcset="${webpSrc}" type="image/webp">
  <img src="${src}" alt="${alt}" loading="lazy">
</picture>`;

    return {
      id: `fix-${diagnosis.id}`,
      type: 'code-change',
      description: 'Convert to modern image format with fallback',
      riskLevel: 'medium',
      changes: [
        {
          file: filePath,
          type: 'replace',
          search: line,
          replace: pictureElement,
          line: diagnosis.location.line,
        },
      ],
      notes: `Remember to generate ${webpSrc} from ${src}`,
    };
  }
}

export default ImageFixGenerator;
