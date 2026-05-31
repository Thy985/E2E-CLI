/**
 * Figma Design Token Sync
 * 
 * 同步 Figma 设计令牌到代码项目
 */

import * as fs from 'fs';
import * as path from 'path';
import { FigmaClient } from './client';
import { DesignTokens } from '../../skills/builtin/uiux/design-token-extractor';

export interface SyncOptions {
  projectPath: string;
  format: 'css' | 'scss' | 'js' | 'ts' | 'json';
  outputPath?: string;
  prefix?: string;
}

export class FigmaSync {
  private client: FigmaClient;

  constructor(accessToken: string) {
    this.client = new FigmaClient(accessToken);
  }

  /**
   * 同步设计令牌到项目
   */
  async sync(fileKey: string, options: SyncOptions): Promise<void> {
    // 1. 从 Figma 提取设计令牌
    const tokens = await this.client.extractDesignTokens(fileKey);

    // 2. 根据格式生成文件
    const content = this.generateTokenFile(tokens, options.format, options.prefix);

    // 3. 写入文件
    const outputPath = options.outputPath || this.getDefaultOutputPath(options.projectPath, options.format);
    
    // 确保目录存在
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, content, 'utf-8');
  }

  /**
   * 生成设计令牌文件
   */
  private generateTokenFile(tokens: DesignTokens, format: string, prefix?: string): string {
    switch (format) {
      case 'css':
        return this.generateCSS(tokens, prefix);
      case 'scss':
        return this.generateSCSS(tokens, prefix);
      case 'js':
        return this.generateJS(tokens);
      case 'ts':
        return this.generateTS(tokens);
      case 'json':
        return JSON.stringify(tokens, null, 2);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * 生成 CSS 变量
   */
  private generateCSS(tokens: DesignTokens, prefix?: string): string {
    const p = prefix ? `${prefix}-` : '';
    let css = ':root {\n';

    // 颜色
    for (const [name, value] of Object.entries(tokens.colors)) {
      css += `  --${p}color-${this.kebabCase(name)}: ${value};\n`;
    }

    // 间距
    for (const [name, value] of Object.entries(tokens.spacing)) {
      css += `  --${p}spacing-${this.kebabCase(name)}: ${value};\n`;
    }

    // 圆角
    for (const [name, value] of Object.entries(tokens.borderRadius)) {
      css += `  --${p}radius-${this.kebabCase(name)}: ${value};\n`;
    }

    css += '}\n';
    return css;
  }

  /**
   * 生成 SCSS 变量
   */
  private generateSCSS(tokens: DesignTokens, prefix?: string): string {
    const p = prefix ? `${prefix}-` : '';
    let scss = '';

    // 颜色
    for (const [name, value] of Object.entries(tokens.colors)) {
      scss += `$${p}color-${this.kebabCase(name)}: ${value};\n`;
    }

    // 间距
    for (const [name, value] of Object.entries(tokens.spacing)) {
      scss += `$${p}spacing-${this.kebabCase(name)}: ${value};\n`;
    }

    // 圆角
    for (const [name, value] of Object.entries(tokens.borderRadius)) {
      scss += `$${p}radius-${this.kebabCase(name)}: ${value};\n`;
    }

    return scss;
  }

  /**
   * 生成 JavaScript 对象
   */
  private generateJS(tokens: DesignTokens): string {
    return `export const designTokens = ${JSON.stringify(tokens, null, 2)};\n`;
  }

  /**
   * 生成 TypeScript 定义
   */
  private generateTS(tokens: DesignTokens): string {
    return `export const designTokens = ${JSON.stringify(tokens, null, 2)} as const;\n\nexport type DesignTokens = typeof designTokens;\n`;
  }

  /**
   * 获取默认输出路径
   */
  private getDefaultOutputPath(projectPath: string, format: string): string {
    const paths: Record<string, string> = {
      css: 'src/styles/tokens.css',
      scss: 'src/styles/_tokens.scss',
      js: 'src/tokens/index.js',
      ts: 'src/tokens/index.ts',
      json: 'tokens.json',
    };

    return path.join(projectPath, paths[format] || 'tokens.json');
  }

  /**
   * 转换为 kebab-case
   */
  private kebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }
}

export default FigmaSync;
