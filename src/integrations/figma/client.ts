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

/**
 * Minimal Figma REST API surface we actually use. Anything not in here
 * is `unknown` so we never silently propagate `any` through the call site.
 * See https://www.figma.com/developers/api
 */
interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
}

interface FigmaStyleMeta {
  key: string;
  name: string;
  styleType: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID';
  description?: string;
}

interface FigmaFillStyle {
  key: string;
  name: string;
  styleType: 'FILL';
  fills: Array<{
    type: string;
    color?: { r: number; g: number; b: number; a: number };
    visible?: boolean;
  }>;
}

interface FigmaTextStyleRaw {
  key: string;
  name: string;
  styleType: 'TEXT';
  fontSize: number;
  fontWeight: number;
  lineHeightPercent?: number;
  fontFamily: string;
}

interface FigmaVariable {
  id: string;
  name: string;
  resolvedType: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
  valuesByMode: FigmaColor['color'] | number | string | boolean;
}

interface FigmaVariablesResponse {
  meta?: { variables?: FigmaVariable[] };
}

interface FigmaFile {
  document: FigmaNode;
  styles: Record<string, FigmaStyleMeta>;
}

export interface FigmaComponent {
  id: string;
  name: string;
  type: string;
  children?: FigmaComponent[];
}

/** Set of node types we treat as design components. */
const COMPONENT_NODE_TYPES = new Set(['COMPONENT', 'COMPONENT_SET']);

export class FigmaClient {
  private baseUrl = 'https://api.figma.com/v1';
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * 获取 Figma 文件信息
   */
  async getFile(fileKey: string, nodeId?: string): Promise<FigmaFile> {
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

    // Top-level Figma file shape is huge; we only read `document` and `styles`.
    const data = (await response.json()) as {
      document?: FigmaNode;
      styles?: Record<string, FigmaStyleMeta>;
    };

    return {
      document: data.document ?? { id: 'root', name: 'Document', type: 'DOCUMENT' },
      styles: data.styles ?? {},
    };
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
    for (const [id, style] of Object.entries(file.styles)) {
      if (style.styleType === 'FILL') {
        const color = await this.getFillStyle(id);
        if (color) {
          tokens.colors[style.name] = this.figmaColorToHex(color);
        }
      } else if (style.styleType === 'TEXT') {
        const textStyle = await this.getTextStyle(id);
        if (textStyle) {
          tokens.typography[style.name] = {
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

    // 从变量中提取（Figma 新功能）
    try {
      const variables = await this.getLocalVariables(fileKey);
      for (const variable of variables) {
        if (variable.resolvedType === 'COLOR') {
          // 必须是 RGBA 对象才能转 hex
          if (this.isFigmaColor(variable.valuesByMode)) {
            tokens.colors[variable.name] = this.figmaColorToHex(variable.valuesByMode);
          }
        } else if (variable.resolvedType === 'FLOAT') {
          // 可能是间距或圆角
          if (typeof variable.valuesByMode === 'number') {
            if (variable.name.toLowerCase().includes('spacing')) {
              tokens.spacing[variable.name] = `${variable.valuesByMode}px`;
            } else if (variable.name.toLowerCase().includes('radius')) {
              tokens.borderRadius[variable.name] = `${variable.valuesByMode}px`;
            }
          }
        }
      }
    } catch {
      // 变量 API 可能不可用，忽略错误
    }

    return tokens;
  }

  /**
   * 获取样式详情（FILL 颜色）
   */
  private async getFillStyle(styleKey: string): Promise<FigmaColor['color'] | null> {
    const raw = await this.getStyle<FigmaFillStyle>(styleKey);
    if (!raw) return null;
    const firstFill = raw.fills.find((f) => f.color);
    return firstFill?.color ?? null;
  }

  /**
   * 获取样式详情（TEXT 排版）
   */
  private async getTextStyle(styleKey: string): Promise<FigmaTextStyleRaw | null> {
    return this.getStyle<FigmaTextStyleRaw>(styleKey);
  }

  /**
   * 通用样式获取：返回已解析为指定类型的 payload，解析失败则 null。
   * 之所以单独成方法，是为了让 /styles/:key 端点的 404 / 解析失败都安静地跳过。
   */
  private async getStyle<T>(styleKey: string): Promise<T | null> {
    const response = await fetch(`${this.baseUrl}/styles/${styleKey}`, {
      headers: {
        'X-Figma-Token': this.accessToken,
      },
    });

    if (!response.ok) return null;
    const data = (await response.json()) as T;
    return data;
  }

  /**
   * 获取本地变量
   */
  private async getLocalVariables(fileKey: string): Promise<FigmaVariable[]> {
    const response = await fetch(`${this.baseUrl}/files/${fileKey}/variables/local`, {
      headers: {
        'X-Figma-Token': this.accessToken,
      },
    });

    if (!response.ok) return [];
    const data = (await response.json()) as FigmaVariablesResponse;
    return data.meta?.variables ?? [];
  }

  /**
   * 获取组件列表
   */
  async getComponents(fileKey: string): Promise<FigmaComponent[]> {
    const file = await this.getFile(fileKey);
    const components: FigmaComponent[] = [];
    const seen = new Set<string>();

    const traverse = (node: FigmaNode): void => {
      // Set 防 cycle（Figma 文档理论上不会循环，但 mock 数据可能）
      if (seen.has(node.id)) return;
      seen.add(node.id);

      if (COMPONENT_NODE_TYPES.has(node.type)) {
        components.push({
          id: node.id,
          name: node.name,
          type: node.type,
        });
      }

      if (node.children) {
        for (const child of node.children) {
          traverse(child);
        }
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

    const exportData = (await exportResponse.json()) as { images?: Record<string, string> };
    const imageUrl = exportData.images?.[nodeId];

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

  /**
   * 运行时 type guard：Figma Color 变量在 valuesByMode 里是 {r,g,b,a} 对象，
   * 但 FLOAT 变量是 number，STRING 变量是 string —— 必须区分。
   */
  private isFigmaColor(value: unknown): value is FigmaColor['color'] {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
      typeof v.r === 'number' &&
      typeof v.g === 'number' &&
      typeof v.b === 'number' &&
      (typeof v.a === 'number' || v.a === undefined)
    );
  }
}

export default FigmaClient;
