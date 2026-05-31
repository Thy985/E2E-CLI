/**
 * Visual Comparison Module
 * Screenshot comparison using pixelmatch
 */

import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { CompareOptions, CompareResult } from '../types';

export class VisualComparator {
  private threshold: number;

  constructor(threshold: number = 0.1) {
    this.threshold = threshold;
  }

  /**
   * Compare two images
   */
  async compare(options: CompareOptions): Promise<CompareResult> {
    const { baseline, current, threshold = this.threshold, output } = options;

    // Load images
    const img1 = await this.loadImage(baseline);
    const img2 = await this.loadImage(current);

    // Check dimensions
    if (img1.width !== img2.width || img1.height !== img2.height) {
      // Resize to match
      const maxWidth = Math.max(img1.width, img2.width);
      const maxHeight = Math.max(img1.height, img2.height);
      
      if (img1.width !== maxWidth || img1.height !== maxHeight) {
        this.resizeImage(img1, maxWidth, maxHeight);
      }
      if (img2.width !== maxWidth || img2.height !== maxHeight) {
        this.resizeImage(img2, maxWidth, maxHeight);
      }
    }

    // Create diff image
    const diff = new PNG({ width: img1.width, height: img1.height });

    // Compare
    const diffPixels = pixelmatch(
      img1.data,
      img2.data,
      diff.data,
      img1.width,
      img1.height,
      { threshold: 0.1 }
    );

    const totalPixels = img1.width * img1.height;
    const diffPercentage = (diffPixels / totalPixels) * 100;
    const match = diffPercentage <= threshold * 100;

    // Save diff image if output path provided
    let diffImage: Buffer | undefined;
    if (output && diffPixels > 0) {
      const diffBuffer = PNG.sync.write(diff);
      await fs.promises.writeFile(output, diffBuffer);
      diffImage = diffBuffer;
    }

    return {
      match,
      diffPercentage,
      diffPixels,
      totalPixels,
      diffImage,
    };
  }

  /**
   * Load image from file or buffer
   */
  private async loadImage(source: string | Buffer): Promise<PNG> {
    let buffer: Buffer;

    if (typeof source === 'string') {
      buffer = await fs.promises.readFile(source);
    } else {
      buffer = source;
    }

    return PNG.sync.read(buffer);
  }

  /**
   * Resize image (pad with transparent pixels)
   */
  private resizeImage(img: PNG, width: number, height: number): void {
    const newData = Buffer.alloc(width * height * 4);
    
    // Copy original data
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const srcIdx = (img.width * y + x) << 2;
        const dstIdx = (width * y + x) << 2;
        newData[dstIdx] = img.data[srcIdx];
        newData[dstIdx + 1] = img.data[srcIdx + 1];
        newData[dstIdx + 2] = img.data[srcIdx + 2];
        newData[dstIdx + 3] = img.data[srcIdx + 3];
      }
    }

    img.data = newData;
    img.width = width;
    img.height = height;
  }

  /**
   * Save screenshot to file
   */
  async saveScreenshot(buffer: Buffer, filepath: string): Promise<void> {
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    await fs.promises.writeFile(filepath, buffer);
  }

  /**
   * Check if baseline exists
   */
  async hasBaseline(filepath: string): Promise<boolean> {
    return fs.existsSync(filepath);
  }

  /**
   * Get baseline path
   */
  getBaselinePath(baselineDir: string, name: string): string {
    return path.join(baselineDir, `${name}.png`);
  }

  /**
   * Get current screenshot path
   */
  getCurrentPath(currentDir: string, name: string, timestamp?: number): string {
    const ts = timestamp || Date.now();
    return path.join(currentDir, `${name}-${ts}.png`);
  }

  /**
   * Get diff path
   */
  getDiffPath(diffDir: string, name: string): string {
    return path.join(diffDir, `${name}-diff.png`);
  }
}
