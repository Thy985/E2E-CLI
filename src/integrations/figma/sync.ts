/**
 * Figma Design Token Sync
 * 
 * 同步 Figma 设计令牌到代码项目
 */

import * as fs from 'fs';
import * as path from 'path';
import { FigmaClient } from './client';
import { DesignTokens, TypographyToken } from '../../skills/builtin/uiux/design-token-extractor';

export interface SyncOptions {
  projectPath: string;
  format: 'css' | 'scss' | 'js' | 'ts' | 'json';
  outputPath?: string;
  prefix?: string;
}

export interface DesignChange {
  type: 'added' | 'modified' | 'removed';
  category: string;
  name: string;
  oldValue?: string;
  newValue?: string;
}

export interface SyncedComponent {
  id: string;
  name: string;
  type: string;
  description?: string;
  figmaNodeUrl: string;
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
   * 同步设计令牌：提取颜色、排版、间距
   */
  async syncDesignTokens(fileKey: string): Promise<DesignTokens> {
    const file = await this.client.getFile(fileKey);
    const tokens: DesignTokens = {
      colors: {},
      typography: {},
      spacing: {},
      borderRadius: {},
      shadows: {},
      breakpoints: {},
    };

    // 从样式中提取颜色
    if (file.styles) {
      for (const [id, style] of Object.entries(file.styles)) {
        const s = style as any;
        if (s.styleType === 'FILL') {
          const color = await this.client['getStyle'](id);
          if (color && color.paints) {
            const paint = color.paints[0];
            if (paint && paint.color) {
              tokens.colors[s.name] = this.client['figmaColorToHex'](paint.color);
            }
          }
        } else if (s.styleType === 'TEXT') {
          const textStyle = await this.client['getStyle'](id);
          if (textStyle) {
            tokens.typography[s.name] = {
              fontSize: textStyle.fontSize ? `${textStyle.fontSize}px` : '16px',
              fontWeight: textStyle.fontWeight || 400,
              lineHeight: textStyle.lineHeightPercent 
                ? `${textStyle.lineHeightPercent}%` 
                : '1.5',
              fontFamily: textStyle.fontFamily,
            };
          }
        }
      }
    }

    // 从变量中提取（Figma 新功能）
    try {
      const variables = await this.client['getLocalVariables'](fileKey);
      for (const variable of variables) {
        if (variable.resolvedType === 'COLOR') {
          const colorValue = variable.valuesByMode;
          if (colorValue && typeof colorValue === 'object' && 'r' in colorValue) {
            tokens.colors[variable.name] = this.client['figmaColorToHex'](colorValue);
          } else if (typeof colorValue === 'string') {
            tokens.colors[variable.name] = colorValue;
          }
        } else if (variable.resolvedType === 'FLOAT') {
          if (variable.name.toLowerCase().includes('spacing')) {
            tokens.spacing[variable.name] = `${variable.valuesByMode}px`;
          } else if (variable.name.toLowerCase().includes('radius')) {
            tokens.borderRadius[variable.name] = `${variable.valuesByMode}px`;
          }
        }
      }
    } catch {
      // 变量 API 可能不可用，忽略错误
    }

    return tokens;
  }

  /**
   * 同步组件：提取组件信息
   */
  async syncComponents(fileKey: string): Promise<SyncedComponent[]> {
    const components = await this.client.getComponents(fileKey);
    
    return components.map(comp => ({
      id: comp.id,
      name: comp.name,
      type: comp.type,
      figmaNodeUrl: `https://www.figma.com/file/${fileKey}?node-id=${comp.id}`,
    }));
  }

  /**
   * 检测设计变更：比较已有令牌与设计令牌
   */
  async detectDesignChanges(
    fileKey: string,
    existingTokens: DesignTokens
  ): Promise<{ changes: DesignChange[]; summary: { added: number; modified: number; removed: number } }> {
    const designTokens = await this.syncDesignTokens(fileKey);
    const changes: DesignChange[] = [];

    // 比较颜色
    this.compareCategory(existingTokens.colors, designTokens.colors, 'color', changes);
    
    // 比较排版
    this.compareTypographyCategory(existingTokens.typography, designTokens.typography, 'typography', changes);
    
    // 比较间距
    this.compareCategory(existingTokens.spacing, designTokens.spacing, 'spacing', changes);
    
    // 比较圆角
    this.compareCategory(existingTokens.borderRadius, designTokens.borderRadius, 'borderRadius', changes);
    
    // 比较阴影
    this.compareCategory(existingTokens.shadows, designTokens.shadows, 'shadows', changes);
    
    // 比较断点
    this.compareCategory(existingTokens.breakpoints, designTokens.breakpoints, 'breakpoints', changes);

    return {
      changes,
      summary: {
        added: changes.filter(c => c.type === 'added').length,
        modified: changes.filter(c => c.type === 'modified').length,
        removed: changes.filter(c => c.type === 'removed').length,
      },
    };
  }

  /**
   * 同步设计令牌到项目：写入 tokens.json 文件
   */
  async syncDesignTokensToProject(
    fileKey: string,
    projectPath: string,
    outputFileName: string = 'tokens.json'
  ): Promise<string> {
    const tokens = await this.syncDesignTokens(fileKey);
    const outputPath = path.join(projectPath, outputFileName);
    
    // 确保目录存在
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(tokens, null, 2), 'utf-8');
    return outputPath;
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

  /**
   * 比较单个类别的令牌
   */
  private compareCategory(
    existing: Record<string, string>,
    design: Record<string, string>,
    category: string,
    changes: DesignChange[]
  ): void {
    const existingKeys = Object.keys(existing);
    const designKeys = Object.keys(design);

    // 检查新增和修改
    for (const key of designKeys) {
      if (!(key in existing)) {
        changes.push({
          type: 'added',
          category,
          name: key,
          newValue: design[key],
        });
      } else if (existing[key] !== design[key]) {
        changes.push({
          type: 'modified',
          category,
          name: key,
          oldValue: existing[key],
          newValue: design[key],
        });
      }
    }

    // 检查删除
    for (const key of existingKeys) {
      if (!(key in design)) {
        changes.push({
          type: 'removed',
          category,
          name: key,
          oldValue: existing[key],
        });
      }
    }
  }

  /**
   * 比较排版类别的令牌
   */
  private compareTypographyCategory(
    existing: Record<string, TypographyToken>,
    design: Record<string, TypographyToken>,
    category: string,
    changes: DesignChange[]
  ): void {
    const existingKeys = Object.keys(existing);
    const designKeys = Object.keys(design);

    for (const key of designKeys) {
      if (!(key in existing)) {
        changes.push({
          type: 'added',
          category,
          name: key,
          newValue: JSON.stringify(design[key]),
        });
      } else {
        const existingStr = JSON.stringify(existing[key]);
        const designStr = JSON.stringify(design[key]);
        if (existingStr !== designStr) {
          changes.push({
            type: 'modified',
            category,
            name: key,
            oldValue: existingStr,
            newValue: designStr,
          });
        }
      }
    }

    for (const key of existingKeys) {
      if (!(key in design)) {
        changes.push({
          type: 'removed',
          category,
          name: key,
          oldValue: JSON.stringify(existing[key]),
        });
      }
    }
  }
}

export default FigmaSync;
