/**
 * Figma Design Comparison
 * 
 * 对比代码实现与 Figma 设计稿
 */

import * as fs from 'fs';
import * as path from 'path';
import { FigmaClient } from './client';
import { DesignTokens } from '../../skills/builtin/uiux/design-token-extractor';
import { readPNG, writePNG, loadPixelmatch } from '../../utils/image';

export interface ComparisonResult {
  matches: ComparisonItem[];
  mismatches: ComparisonItem[];
  missing: ComparisonItem[];
  extra: ComparisonItem[];
}

export interface ComparisonItem {
  name: string;
  figmaValue: string;
  codeValue: string;
  file?: string;
  line?: number;
}

export class FigmaCompare {
  private client: FigmaClient;

  constructor(accessToken: string) {
    this.client = new FigmaClient(accessToken);
  }

  /**
   * 对比设计令牌
   */
  async compareTokens(
    fileKey: string,
    codeTokens: DesignTokens,
    _projectPath: string
  ): Promise<ComparisonResult> {
    const figmaTokens = await this.client.extractDesignTokens(fileKey);
    const result: ComparisonResult = {
      matches: [],
      mismatches: [],
      missing: [],
      extra: [],
    };

    // 对比颜色
    this.compareCategory(
      figmaTokens.colors,
      codeTokens.colors,
      'color',
      result
    );

    // 对比间距
    this.compareCategory(
      figmaTokens.spacing,
      codeTokens.spacing,
      'spacing',
      result
    );

    // 对比圆角
    this.compareCategory(
      figmaTokens.borderRadius,
      codeTokens.borderRadius,
      'border-radius',
      result
    );

    return result;
  }

  /**
   * 对比单个类别
   */
  private compareCategory(
    figmaValues: Record<string, string>,
    codeValues: Record<string, string>,
    category: string,
    result: ComparisonResult
  ): void {
    const figmaKeys = Object.keys(figmaValues);
    const codeKeys = Object.keys(codeValues);

    // 检查匹配和不匹配
    for (const key of figmaKeys) {
      const figmaValue = figmaValues[key];
      const codeValue = codeValues[key];

      if (codeValue === undefined) {
        // Figma 有，代码中没有
        result.missing.push({
          name: `${category}/${key}`,
          figmaValue,
          codeValue: 'N/A',
        });
      } else if (this.normalizeValue(figmaValue) === this.normalizeValue(codeValue)) {
        // 完全匹配
        result.matches.push({
          name: `${category}/${key}`,
          figmaValue,
          codeValue,
        });
      } else {
        // 不匹配
        result.mismatches.push({
          name: `${category}/${key}`,
          figmaValue,
          codeValue,
        });
      }
    }

    // 检查代码中多余的
    for (const key of codeKeys) {
      if (!figmaValues[key]) {
        result.extra.push({
          name: `${category}/${key}`,
          figmaValue: 'N/A',
          codeValue: codeValues[key],
        });
      }
    }
  }

  /**
   * 对比截图
   */
  async compareScreenshots(
    fileKey: string,
    nodeId: string,
    screenshotPath: string
  ): Promise<{ similarity: number; diffImagePath?: string }> {
    // 导出 Figma 设计稿截图
    const figmaImageUrl = await this.client.exportImage(fileKey, nodeId, 'png');

    // Ensure output directory exists
    const outputDir = path.join(process.cwd(), '.qa-agent');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 下载 Figma 截图
    const figmaImagePath = path.join(outputDir, 'figma-screenshot.png');
    await this.downloadImage(figmaImageUrl, figmaImagePath);

    // Try to load pixelmatch
    const pixelmatch = await loadPixelmatch();
    if (!pixelmatch) {
      console.warn('[FigmaCompare] pixelmatch not available; similarity returns 0');
      return { similarity: 0, diffImagePath: undefined };
    }

    // Read and decode PNG files
    const figmaData = await readPNG(figmaImagePath);
    const codeData = await readPNG(screenshotPath);

    if (!figmaData || !codeData) {
      console.warn('[FigmaCompare] Could not decode screenshots for comparison');
      return { similarity: 0, diffImagePath: undefined };
    }

    // Check dimensions
    if (figmaData.width !== codeData.width || figmaData.height !== codeData.height) {
      console.warn('[FigmaCompare] Screenshot dimensions differ; cannot compute pixel similarity');
      return { similarity: 0, diffImagePath: undefined };
    }

    const { width, height } = figmaData;
    const totalPixels = width * height;
    const outputBuffer = Buffer.alloc(totalPixels * 4);

    const mismatchedPixels = pixelmatch(
      figmaData.data,
      codeData.data,
      outputBuffer,
      width,
      height,
      { threshold: 0.1 }
    );

    // Write diff image
    const diffImagePath = path.join(outputDir, 'figma-diff.png');
    await writePNG(diffImagePath, outputBuffer, width, height);

    const similarity = ((totalPixels - mismatchedPixels) / totalPixels) * 100;

    return {
      similarity: Math.round(similarity * 100) / 100,
      diffImagePath,
    };
  }

  /**
   * 生成对比报告
   */
  generateReport(result: ComparisonResult): string {
    let report = '# Figma Design Comparison Report\n\n';

    // 统计
    const total = result.matches.length + result.mismatches.length + result.missing.length;
    const matchRate = total > 0 ? (result.matches.length / total) * 100 : 100;

    report += `## Summary\n\n`;
    report += `- **Match Rate**: ${matchRate.toFixed(1)}%\n`;
    report += `- **Matches**: ${result.matches.length}\n`;
    report += `- **Mismatches**: ${result.mismatches.length}\n`;
    report += `- **Missing**: ${result.missing.length}\n`;
    report += `- **Extra**: ${result.extra.length}\n\n`;

    // 不匹配项
    if (result.mismatches.length > 0) {
      report += `## Mismatches\n\n`;
      report += '| Name | Figma | Code |\n';
      report += '|------|-------|------|\n';
      for (const item of result.mismatches) {
        report += `| ${item.name} | ${item.figmaValue} | ${item.codeValue} |\n`;
      }
      report += '\n';
    }

    // 缺失项
    if (result.missing.length > 0) {
      report += `## Missing in Code\n\n`;
      report += '| Name | Figma Value |\n';
      report += '|------|-------------|\n';
      for (const item of result.missing) {
        report += `| ${item.name} | ${item.figmaValue} |\n`;
      }
      report += '\n';
    }

    // 多余项
    if (result.extra.length > 0) {
      report += `## Extra in Code\n\n`;
      report += '| Name | Code Value |\n';
      report += '|------|------------|\n';
      for (const item of result.extra) {
        report += `| ${item.name} | ${item.codeValue} |\n`;
      }
      report += '\n';
    }

    return report;
  }

  /**
   * 归一化值
   */
  private normalizeValue(value: string): string {
    // 统一颜色格式
    if (value.startsWith('#')) {
      return value.toLowerCase();
    }
    // 统一间距格式
    if (value.endsWith('px')) {
      return value;
    }
    return value.trim().toLowerCase();
  }

  /**
   * 下载图片
   */
  private async downloadImage(url: string, outputPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(buffer));
  }
}

export default FigmaCompare;
