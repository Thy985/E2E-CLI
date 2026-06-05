/**
 * Figma Design Comparison
 * 
 * 对比代码实现与 Figma 设计稿
 */

import * as fs from 'fs';
import * as path from 'path';
import { FigmaClient } from './client';
import { DesignTokens } from '../../skills/builtin/uiux/design-token-extractor';

// Dynamic imports for optional dependencies
type PixelmatchFn = (
  img1: Uint8Array | Uint8ClampedArray,
  img2: Uint8Array | Uint8ClampedArray,
  output: Uint8Array | Uint8ClampedArray | null,
  width: number,
  height: number,
  options?: { threshold?: number }
) => number;

interface PNGData {
  data: Uint8Array;
  width: number;
  height: number;
}

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
        // Figma 中有，代码中没有
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
    const pixelmatch = await this.loadPixelmatch();
    if (!pixelmatch) {
      console.warn('[FigmaCompare] pixelmatch not available; similarity returns 0');
      return { similarity: 0, diffImagePath: undefined };
    }

    // Read and decode PNG files
    const figmaData = await this.readPNG(figmaImagePath);
    const codeData = await this.readPNG(screenshotPath);

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
    await this.writePNG(diffImagePath, outputBuffer, width, height);

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

  // ==================== Optional Dependency Loaders ====================

  private pixelmatch: PixelmatchFn | null = null;

  private async loadPixelmatch(): Promise<PixelmatchFn | null> {
    if (this.pixelmatch) return this.pixelmatch;
    try {
      const mod = await import('pixelmatch') as { default: PixelmatchFn };
      this.pixelmatch = mod.default;
      return this.pixelmatch;
    } catch {
      return null;
    }
  }

  // ==================== Minimal PNG I/O for pixelmatch ====================

  private async readPNG(filePath: string): Promise<PNGData | null> {
    try {
      const buffer = await fs.promises.readFile(filePath);
      // PNG signature check
      if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
        return null;
      }

      let width = 0;
      let height = 0;
      let bitDepth = 8;
      let colorType = 6; // default RGBA
      const idatChunks: Buffer[] = [];
      let offset = 8; // skip PNG signature

      while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');

        if (type === 'IHDR') {
          width = buffer.readUInt32BE(offset + 8);
          height = buffer.readUInt32BE(offset + 12);
          bitDepth = buffer[offset + 16];
          colorType = buffer[offset + 17];
        } else if (type === 'IDAT') {
          idatChunks.push(buffer.subarray(offset + 8, offset + 8 + length));
        } else if (type === 'IEND') {
          break;
        }

        offset += 12 + length;
      }

      if (width === 0 || height === 0 || idatChunks.length === 0) {
        return null;
      }

      // Decompress IDAT data
      const compressed = Buffer.concat(idatChunks);
      const { inflateRaw } = await import('zlib');
      const decompressed = await new Promise<Buffer>((resolve, reject) => {
        inflateRaw(compressed, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      // Convert PNG raw data (with filter bytes) to RGBA
      const channelsPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
      const bytesPerPixel = channelsPerPixel * (bitDepth >= 8 ? bitDepth / 8 : 1);
      const stride = width * bytesPerPixel + 1; // +1 for filter byte
      const output = Buffer.alloc(width * height * 4);

      for (let y = 0; y < height; y++) {
        const rowStart = y * stride;
        const filterByte = decompressed[rowStart];
        const outRowStart = y * width * 4;

        for (let x = 0; x < width; x++) {
          const srcPos = rowStart + 1 + x * bytesPerPixel;
          const dstPos = outRowStart + x * 4;

          if (colorType === 6) {
            output[dstPos] = decompressed[srcPos];
            output[dstPos + 1] = decompressed[srcPos + 1];
            output[dstPos + 2] = decompressed[srcPos + 2];
            output[dstPos + 3] = decompressed[srcPos + 3];
          } else if (colorType === 2) {
            output[dstPos] = decompressed[srcPos];
            output[dstPos + 1] = decompressed[srcPos + 1];
            output[dstPos + 2] = decompressed[srcPos + 2];
            output[dstPos + 3] = 255;
          } else if (colorType === 0) {
            const v = decompressed[srcPos];
            output[dstPos] = v;
            output[dstPos + 1] = v;
            output[dstPos + 2] = v;
            output[dstPos + 3] = 255;
          } else {
            output[dstPos] = 0;
            output[dstPos + 1] = 0;
            output[dstPos + 2] = 0;
            output[dstPos + 3] = 255;
          }
        }

        // Apply filter
        if (filterByte !== 0) {
          this.applyFilter(output, decompressed, rowStart, stride, y, width, filterByte);
        }
      }

      return { data: new Uint8Array(output), width, height };
    } catch {
      return null;
    }
  }

  private applyFilter(
    output: Buffer,
    raw: Buffer,
    rowStart: number,
    _stride: number,
    y: number,
    width: number,
    filter: number
  ): void {
    const outRowStart = y * width * 4;
    const bytesPerPixel = 4;

    for (let x = 0; x < width; x++) {
      const srcPos = rowStart + 1 + x * bytesPerPixel;
      const dstPos = outRowStart + x * bytesPerPixel;

      for (let b = 0; b < bytesPerPixel; b++) {
        const rawByte = raw[srcPos + b];
        let priorByte = 0;
        let leftByte = 0;
        let priorLeftByte = 0;

        if (y > 0) {
          const prevOutRowStart = (y - 1) * width * 4;
          priorByte = output[prevOutRowStart + x * bytesPerPixel + b];
          if (x > 0) {
            priorLeftByte = output[prevOutRowStart + (x - 1) * bytesPerPixel + b];
          }
        }
        if (x > 0) {
          leftByte = output[outRowStart + (x - 1) * bytesPerPixel + b];
        }

        let result = rawByte;
        switch (filter) {
          case 1: // Sub
            result = (rawByte + leftByte) & 0xff;
            break;
          case 2: // Up
            result = (rawByte + priorByte) & 0xff;
            break;
          case 3: // Average
            result = (rawByte + Math.floor((leftByte + priorByte) / 2)) & 0xff;
            break;
          case 4: // Paeth
            result = (rawByte + this.paethPredictor(leftByte, priorByte, priorLeftByte)) & 0xff;
            break;
        }
        output[dstPos + b] = result;
      }
    }
  }

  private paethPredictor(a: number, b: number, c: number): number {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }

  private async writePNG(
    filePath: string,
    rgbaData: Buffer,
    width: number,
    height: number
  ): Promise<void> {
    const { deflate } = await import('zlib');
    const chunks: Buffer[] = [];

    function makeChunk(type: string, data: Buffer): Buffer {
      const lengthBuf = Buffer.alloc(4);
      lengthBuf.writeUInt32BE(data.length, 0);
      const typeBuf = Buffer.from(type, 'ascii');
      const crcData = Buffer.concat([typeBuf, data]);
      const crc = crc32(crcData);
      const crcBuf = Buffer.alloc(4);
      crcBuf.writeUInt32BE(crc >>> 0, 0);
      return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
    }

    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData[8] = 8; // bit depth
    ihdrData[9] = 6; // color type (RGBA)
    ihdrData[10] = 0; // compression
    ihdrData[11] = 0; // filter
    ihdrData[12] = 0; // interlace

    const rawLines: Buffer[] = [];
    for (let y = 0; y < height; y++) {
      const rowStart = y * width * 4;
      const line = Buffer.alloc(width * 4 + 1);
      line[0] = 0; // filter: None
      rgbaData.copy(line, 1, rowStart, rowStart + width * 4);
      rawLines.push(line);
    }
    const rawData = Buffer.concat(rawLines);

    const compressed = await new Promise<Buffer>((resolve, reject) => {
      deflate(rawData, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    const iendData = Buffer.alloc(0);

    chunks.push(signature);
    chunks.push(makeChunk('IHDR', ihdrData));
    chunks.push(makeChunk('IDAT', compressed));
    chunks.push(makeChunk('IEND', iendData));

    await fs.promises.writeFile(filePath, Buffer.concat(chunks));
  }
}

export default FigmaCompare;

// Simple CRC32 implementation for PNG chunks
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  const table = getCrc32Table();
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let _crc32Table: number[] | null = null;
function getCrc32Table(): number[] {
  if (!_crc32Table) {
    _crc32Table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      _crc32Table[n] = c;
    }
  }
  return _crc32Table;
}
