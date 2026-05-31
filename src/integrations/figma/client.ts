/**
 * Figma Integration
 * 
 * 核心功能：
 * 1. 从 Figma 提取设计令牌（颜色、字体、间距）
 * 2. 同步设计规范到代码
 * 3. 设计稿与代码对比
 * 4. 设计变更检测
 */

import { DesignTokens } from '../../skills/builtin/uiux/design-token-extractor';

export interface FigmaConfig {
  accessToken: string;
  fileKey: string;
  nodeId?: string;
}

export interface FigmaColor {
  name: string;
  color: {
    r: number;
    g: number;
    b: number;
    a: number;
  };
}

export interface FigmaTextStyle {
  name: string;
  fontSize: number;
  fontWeight: number;
  lineHeight?: number;
  fontFamily: string;
}

export interface FigmaComponent {
  id: string;
  name: string;
  type: string;
  children?: FigmaComponent[];
}

export class FigmaClient {
  private baseUrl = 'https://api.figma.com/v1';
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * 获取 Figma 文件信息
   */
  async getFile(fileKey: string, nodeId?: string): Promise<any> {
    const url = nodeId 
      ? `${this.baseUrl}/files/${fileKey}/nodes?ids=${nodeId}`
      : `${this.baseUrl}/files/${fileKey}`;

    const response = await fetch(url, {
      headers: {
        'X-Figma-Token': this.accessToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Figma API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * 提取设计令牌
   */
  async extractDesignTokens(fileKey: string): Promise<DesignTokens> {
    const file = await this.getFile(fileKey);
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
          const color = await this.getStyle(id);
          if (color) {
            tokens.colors[s.name] = this.figmaColorToHex(color);
          }
        } else if (s.styleType === 'TEXT') {
          const textStyle = await this.getStyle(id);
          if (textStyle) {
            tokens.typography[s.name] = {
              fontSize: `${textStyle.fontSize}px`,
              fontWeight: textStyle.fontWeight,
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
      const variables = await this.getLocalVariables(fileKey);
      for (const variable of variables) {
        if (variable.resolvedType === 'COLOR') {
          tokens.colors[variable.name] = this.figmaColorToHex(variable.valuesByMode);
        } else if (variable.resolvedType === 'FLOAT') {
          // 可能是间距或圆角
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
   * 获取样式详情
   */
  private async getStyle(styleKey: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/styles/${styleKey}`, {
      headers: {
        'X-Figma-Token': this.accessToken,
      },
    });

    if (!response.ok) return null;
    return response.json();
  }

  /**
   * 获取本地变量
   */
  private async getLocalVariables(fileKey: string): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/files/${fileKey}/variables/local`, {
      headers: {
        'X-Figma-Token': this.accessToken,
      },
    });

    if (!response.ok) return [];
    const data = await response.json();
    return data.meta?.variables || [];
  }

  /**
   * 获取组件列表
   */
  async getComponents(fileKey: string): Promise<FigmaComponent[]> {
    const file = await this.getFile(fileKey);
    const components: FigmaComponent[] = [];

    const traverse = (node: any) => {
      if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
        components.push({
          id: node.id,
          name: node.name,
          type: node.type,
        });
      }

      if (node.children) {
        node.children.forEach(traverse);
      }
    };

    traverse(file.document);
    return components;
  }

  /**
   * 导出图片
   */
  async exportImage(fileKey: string, nodeId: string, format: 'png' | 'svg' | 'pdf' = 'png'): Promise<string> {
    // 请求导出
    const exportResponse = await fetch(
      `${this.baseUrl}/images/${fileKey}?ids=${nodeId}&format=${format}&scale=2`,
      {
        headers: {
          'X-Figma-Token': this.accessToken,
        },
      }
    );

    if (!exportResponse.ok) {
      throw new Error(`Export failed: ${exportResponse.statusText}`);
    }

    const exportData = await exportResponse.json();
    const imageUrl = exportData.images[nodeId];

    if (!imageUrl) {
      throw new Error('Export URL not found');
    }

    return imageUrl;
  }

  /**
   * 将 Figma 颜色转换为 Hex
   */
  private figmaColorToHex(color: { r: number; g: number; b: number; a?: number }): string {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    
    if (color.a !== undefined && color.a < 1) {
      const a = Math.round(color.a * 255);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${a.toString(16).padStart(2, '0')}`;
    }
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
}

export default FigmaClient;
