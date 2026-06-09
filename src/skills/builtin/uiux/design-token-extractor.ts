/**
 * 设计令牌提取器
 * 
 * 从以下来源提取设计规范：
 * 1. CSS/SCSS/Less 文件中的变量
 * 2. Tailwind 配置文件
 * 3. CSS-in-JS (styled-components, emotion)
 * 4. Figma API (可选)
 */

import * as fs from 'fs';
import * as path from 'path';
import { QAConfig } from '../../../config';

export interface DesignTokens {
  colors: Record<string, string>;
  typography: Record<string, TypographyToken>;
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
  breakpoints: Record<string, string>;
}

export interface TypographyToken {
  fontSize: string;
  fontWeight: number | string;
  lineHeight: string;
  fontFamily?: string;
}

export class DesignTokenExtractor {
  async extract(projectPath: string, config: QAConfig): Promise<DesignTokens> {
    const tokens: DesignTokens = {
      colors: {},
      typography: {},
      spacing: {},
      borderRadius: {},
      shadows: {},
      breakpoints: {},
    };

    // 1. 从 CSS 变量提取
    const cssTokens = await this.extractFromCSS(projectPath);
    this.mergeTokens(tokens, cssTokens);

    // 2. 从 Tailwind 配置提取
    const tailwindTokens = await this.extractFromTailwind(projectPath);
    this.mergeTokens(tokens, tailwindTokens);

    // 3. 从主题文件提取
    const themeTokens = await this.extractFromThemeFiles(projectPath);
    this.mergeTokens(tokens, themeTokens);

    // 4. 从 Figma 同步（如果配置了）
    if ((config as any).uiux?.figmaToken) {
      const figmaTokens = await this.extractFromFigma((config as any).uiux.figmaToken);
      this.mergeTokens(tokens, figmaTokens);
    }

    return tokens;
  }

  private async extractFromCSS(projectPath: string): Promise<Partial<DesignTokens>> {
    const tokens: Partial<DesignTokens> = { colors: {}, typography: {}, spacing: {}, borderRadius: {}, shadows: {}, breakpoints: {} };
    
    // 查找 CSS 变量文件
    const cssFiles = await this.findFiles(projectPath, ['**/*.css', '**/*.scss', '**/*.less']);
    
    for (const file of cssFiles.slice(0, 20)) { // 限制文件数量
      const content = await fs.promises.readFile(file, 'utf-8');
      
      // 提取 CSS 变量
      const cssVarRegex = /--([\w-]+):\s*([^;]+);/g;
      let match;
      while ((match = cssVarRegex.exec(content)) !== null) {
        const [, name, value] = match;
        
        // 分类令牌
        if (this.isColor(name, value)) {
          tokens.colors![name] = value.trim();
        } else if (this.isSpacing(name)) {
          tokens.spacing![name] = value.trim();
        } else if (this.isBorderRadius(name)) {
          tokens.borderRadius![name] = value.trim();
        } else if (this.isShadow(name)) {
          tokens.shadows![name] = value.trim();
        }
      }

      // 提取排版信息：font-size、font-family、line-height 等
      this.extractTypographyFromCSS(content, tokens);

      // 提取断点信息
      this.extractBreakpointsFromCSS(content, tokens);

      // 提取内联样式
      this.extractInlineStyles(content, tokens);
    }

    return tokens;
  }

  /**
   * 从 CSS 中提取排版信息
   */
  private extractTypographyFromCSS(content: string, tokens: Partial<DesignTokens>): void {
    // 匹配 font-size 声明
    const fontSizeRegex = /font-size:\s*([^;]+);/g;
    let match;
    while ((match = fontSizeRegex.exec(content)) !== null) {
      const value = match[1].trim();
      // 只提取有意义的字体大小值（排除 calc、var 等动态值）
      if (/^[\d.]+(px|rem|em|pt)$/.test(value)) {
        const key = `font-size-${value.replace(/[^\w]/g, '')}`;
        if (!tokens.typography) {
          tokens.typography = {};
        }
        tokens.typography[key] = tokens.typography[key] || {
          fontSize: value,
          fontWeight: 400,
          lineHeight: '1.5',
        };
      }
    }

    // 匹配 font-family 声明
    const fontFamilyRegex = /font-family:\s*([^;]+);/g;
    while ((match = fontFamilyRegex.exec(content)) !== null) {
      const value = match[1].trim();
      // 提取常见的字体族名称
      const cleaned = value.replace(/['"]/g, '').split(',')[0].trim();
      if (cleaned && !tokens!.typography!['font-family']) {
        if (!tokens.typography) {
          tokens.typography = {};
        }
        tokens.typography['font-family'] = {
          fontSize: '16px',
          fontWeight: 400,
          lineHeight: '1.5',
          fontFamily: cleaned,
        };
      }
    }

    // 匹配 font-weight 声明
    const fontWeightRegex = /font-weight:\s*([^;]+);/g;
    while ((match = fontWeightRegex.exec(content)) !== null) {
      const value = match[1].trim();
      if (/^[\d]+$/.test(value)) {
        const key = `font-weight-${value}`;
        if (!tokens.typography) {
          tokens.typography = {};
        }
        if (!tokens.typography[key]) {
          tokens.typography[key] = {
            fontSize: '16px',
            fontWeight: parseInt(value, 10),
            lineHeight: '1.5',
          };
        }
      }
    }

    // 提取排版变量（如 --text-xs, --text-sm 等）
    const textVarRegex = /--text-([\w-]+):\s*([^;]+);/g;
    while ((match = textVarRegex.exec(content)) !== null) {
      const [, name, value] = match;
      // 解析类似 "0.75rem/1rem" 或 "0.75rem 400 Inter" 的格式
      const parts = value.split(/[/\s]+/).filter(Boolean);
      if (parts.length > 0) {
        if (!tokens.typography) {
          tokens.typography = {};
        }
        tokens.typography[`text-${name}`] = {
          fontSize: parts[0],
          fontWeight: parts[1] && /^\d+$/.test(parts[1]) ? parseInt(parts[1], 10) : 400,
          lineHeight: parts[parts.length - 1] && /[\d.]+(px|rem|em|%)/.test(parts[parts.length - 1]) ? parts[parts.length - 1] : '1.5',
        };
      }
    }
  }

  /**
   * 从 CSS 中提取断点信息
   */
  private extractBreakpointsFromCSS(content: string, tokens: Partial<DesignTokens>): void {
    // 匹配 @media 查询中的常见断点值
    const mediaRegex = /@media\s*\([^)]*min-width:\s*([\d.]+)(px|em|rem)/g;
    let match;
    const foundBreakpoints = new Set<string>();
    
    while ((match = mediaRegex.exec(content)) !== null) {
      const value = match[1] + match[2];
      if (!foundBreakpoints.has(value)) {
        foundBreakpoints.add(value);
      }
    }

    // 按值排序并命名
    const sortedValues = Array.from(foundBreakpoints).sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      return numA - numB;
    });

    const standardNames = ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
    for (let i = 0; i < sortedValues.length; i++) {
      const value = sortedValues[i];
      const numValue = parseFloat(value);
      
      // 尝试匹配标准断点名称
      let name = standardNames[i] || `bp-${numValue}`;
      if (numValue === 640) name = 'sm';
      else if (numValue === 768) name = 'md';
      else if (numValue === 1024) name = 'lg';
      else if (numValue === 1280) name = 'xl';
      else if (numValue === 1536) name = '2xl';

      if (!tokens.breakpoints) {
        tokens.breakpoints = {};
      }
      tokens.breakpoints[name] = value;
    }
  }

  /**
   * 从 CSS 中提取内联样式
   */
  private extractInlineStyles(content: string, tokens: Partial<DesignTokens>): void {
    // 匹配 style="..." 属性中的样式
    const styleAttrRegex = /style\s*=\s*["']([^"']*)["']/g;
    let match;
    while ((match = styleAttrRegex.exec(content)) !== null) {
      const styleContent = match[1];
      this.parseStyleDeclarations(styleContent, tokens);
    }

    // 匹配模板字符串中的内联样式（JSX/TSX）
    const jsxStyleRegex = /style\s*=\s*\{[^}]*\{([^}]*)\}/g;
    while ((match = jsxStyleRegex.exec(content)) !== null) {
      const styleContent = match[1];
      // 转换 JS 对象语法为 CSS 语法
      const cssStyle = styleContent.replace(/([A-Z])/g, '-$1').toLowerCase();
      this.parseStyleDeclarations(cssStyle, tokens);
    }
  }

  /**
   * 解析样式声明
   */
  private parseStyleDeclarations(styleContent: string, tokens: Partial<DesignTokens>): void {
    const declarations = styleContent.split(';');
    for (const decl of declarations) {
      const [prop, ...rest] = decl.split(':');
      if (!prop || rest.length === 0) continue;
      
      const name = prop.trim();
      const value = rest.join(':').trim();

      if (!value || value.startsWith('var(')) continue;

      if (this.isColor(name, value)) {
        if (!tokens.colors) {
          tokens.colors = {};
        }
        tokens.colors[`inline-${name}`] = value;
      } else if (name === 'font-size') {
        if (!tokens.typography) {
          tokens.typography = {};
        }
        tokens.typography[`inline-font-size`] = {
          fontSize: value,
          fontWeight: 400,
          lineHeight: '1.5',
        };
      } else if (name === 'font-family') {
        if (!tokens.typography) {
          tokens.typography = {};
        }
        tokens.typography['inline-font-family'] = {
          fontSize: '16px',
          fontWeight: 400,
          lineHeight: '1.5',
          fontFamily: value,
        };
      } else if (name === 'padding' || name === 'margin' || name === 'gap') {
        if (!tokens.spacing) {
          tokens.spacing = {};
        }
        tokens.spacing[`inline-${name}`] = value;
      } else if (name === 'border-radius') {
        if (!tokens.borderRadius) {
          tokens.borderRadius = {};
        }
        tokens.borderRadius[`inline-border-radius`] = value;
      } else if (name === 'box-shadow') {
        if (!tokens.shadows) {
          tokens.shadows = {};
        }
        tokens.shadows[`inline-box-shadow`] = value;
      }
    }
  }

  private async extractFromTailwind(projectPath: string): Promise<Partial<DesignTokens>> {
    const tokens: Partial<DesignTokens> = { colors: {}, spacing: {}, borderRadius: {}, typography: {}, breakpoints: {}, shadows: {} };
    
    const tailwindConfigPath = path.join(projectPath, 'tailwind.config.js');
    const tailwindConfigTsPath = path.join(projectPath, 'tailwind.config.ts');
    
    const configPath = fs.existsSync(tailwindConfigPath) ? tailwindConfigPath 
                   : fs.existsSync(tailwindConfigTsPath) ? tailwindConfigTsPath 
                   : null;
    
    if (!configPath) return tokens;

    try {
      // 动态导入 Tailwind 配置
      const config = await import(configPath);
      const theme = config.default?.theme || config.theme;
      
      if (theme?.extend?.colors) {
        Object.assign(tokens.colors!, theme.extend.colors);
      }
      if (theme?.extend?.spacing) {
        Object.assign(tokens.spacing!, theme.extend.spacing);
      }
      if (theme?.extend?.borderRadius) {
        Object.assign(tokens.borderRadius!, theme.extend.borderRadius);
      }
      if (theme?.extend?.screens) {
        Object.assign(tokens.breakpoints!, theme.extend.screens);
      }
      if (theme?.extend?.boxShadow) {
        Object.assign(tokens.shadows!, theme.extend.boxShadow);
      }
      if (theme?.extend?.fontFamily) {
        for (const [name, family] of Object.entries(theme.extend.fontFamily)) {
          if (!tokens.typography) {
            tokens.typography = {};
          }
          const fontFamilyValue = Array.isArray(family) ? family.join(', ') : String(family);
          tokens.typography[`font-${name}`] = {
            fontSize: '16px',
            fontWeight: 400,
            lineHeight: '1.5',
            fontFamily: fontFamilyValue,
          };
        }
      }

      // 也提取基础主题（非 extend）
      if (theme?.colors) {
        for (const [name, value] of Object.entries(theme.colors)) {
          if (typeof value === 'string' && !tokens.colors![name]) {
            tokens.colors![name] = value;
          }
        }
      }
      if (theme?.screens) {
        Object.assign(tokens.breakpoints!, theme.screens);
      }
      if (theme?.boxShadow) {
        Object.assign(tokens.shadows!, theme.boxShadow);
      }
    } catch (error) {
      // 忽略导入错误
    }

    return tokens;
  }

  private async extractFromThemeFiles(projectPath: string): Promise<Partial<DesignTokens>> {
    const tokens: Partial<DesignTokens> = { colors: {}, typography: {}, spacing: {}, borderRadius: {}, shadows: {}, breakpoints: {} };
    
    // 常见的主题文件路径
    const themePaths = [
      'src/theme/index.ts',
      'src/theme/index.js',
      'src/styles/theme.ts',
      'src/styles/theme.js',
      'src/tokens/index.ts',
      'src/design-system/tokens.ts',
      'src/theme/colors.ts',
      'src/theme/colors.js',
      'src/styles/variables.ts',
      'src/styles/variables.js',
      'theme.ts',
      'theme.js',
      'tokens.ts',
      'tokens.js',
    ];
    
    for (const themePath of themePaths) {
      const fullPath = path.join(projectPath, themePath);
      if (fs.existsSync(fullPath)) {
        try {
          const content = await fs.promises.readFile(fullPath, 'utf-8');
          
          // 提取键值对形式的颜色（如 primary: '#FFFFFF', bg: 'rgb(...)'）
          // 匹配 'key': "value" 或 key: 'value' 或 key: "value" 格式
          const keyValueColorRegex = /['"]?([\w-]+)['"]?\s*[:=]\s*['"]((?:#(?:[0-9A-Fa-f]{3,8})|rgb[ab]?\([^)]*\)|hsl[ab]?\([^)]*\)))/g;
          let match;
          while ((match = keyValueColorRegex.exec(content)) !== null) {
            const [, key, value] = match;
            // 跳过非颜色键名
            if (!/^(type|interface|class|function|const|let|var|export|import|return|if|else|for|while|switch|case|default|new|this|typeof|instanceof)$/.test(key)) {
              if (this.isColor(key, value)) {
                const cleanKey = key.replace(/^['"]|['"]$/g, '');
                tokens.colors![cleanKey] = value;
              }
            }
          }

          // 提取 const/let/var 声明的颜色变量
          const varColorRegex = /(?:const|let|var)\s+([\w$-]+)\s*=\s*['"]((?:#(?:[0-9A-Fa-f]{3,8})|rgb[ab]?\([^)]*\)|hsl[ab]?\([^)]*\)))/g;
          while ((match = varColorRegex.exec(content)) !== null) {
            const [, name, value] = match;
            if (this.isColor(name, value)) {
              tokens.colors![name] = value;
            }
          }

          // 提取间距相关变量（如 spacing: { sm: '8px', md: '16px' }）
          const spacingVarRegex = /(?:const|let|var)\s+([\w$-]*[sS]pacing[\w$-]*)\s*=\s*\{([^}]+)\}/g;
          while ((match = spacingVarRegex.exec(content)) !== null) {
            const [, , block] = match;
            const itemRegex = /['"]?([\w-]+)['"]?\s*[:=]\s*['"]?([\d.]+(?:px|rem|em|%))['"]?/g;
            let itemMatch;
            while ((itemMatch = itemRegex.exec(block)) !== null) {
              const [, key, value] = itemMatch;
              if (this.isSpacing(key) || /^\d+$/.test(key)) {
                tokens.spacing![key] = value;
              }
            }
          }

          // 提取断点
          const breakpointVarRegex = /(?:const|let|var)\s+([\w$-]*[bB]reakpoint[\w$-]*|[sS]creens)\s*=\s*\{([^}]+)\}/g;
          while ((match = breakpointVarRegex.exec(content)) !== null) {
            const [, , block] = match;
            const itemRegex = /['"]?(sm|md|lg|xl|2xl|3xl|[\w-]+)['"]?\s*[:=]\s*['"]?([\d.]+)(px|rem|em)['"]?/g;
            let itemMatch;
            while ((itemMatch = itemRegex.exec(block)) !== null) {
              const [, key, num, unit] = itemMatch;
              tokens.breakpoints![key] = num + unit;
            }
          }

          // 提取圆角
          const radiusVarRegex = /(?:const|let|var)\s+([\w$-]*[rR]adius[\w$-]*|[rR]ounded)\s*=\s*\{([^}]+)\}/g;
          while ((match = radiusVarRegex.exec(content)) !== null) {
            const [, , block] = match;
            const itemRegex = /['"]?([\w-]+)['"]?\s*[:=]\s*['"]?([\d.]+)(px|rem|em)['"]?/g;
            let itemMatch;
            while ((itemMatch = itemRegex.exec(block)) !== null) {
              const [, key, num, unit] = itemMatch;
              tokens.borderRadius![key] = num + unit;
            }
          }

          // 提取阴影
          const shadowVarRegex = /(?:const|let|var)\s+([\w$-]*[sS]hadow[\w$-]*)\s*=\s*\{([^}]+)\}/g;
          while ((match = shadowVarRegex.exec(content)) !== null) {
            const [, , block] = match;
            const itemRegex = /['"]?([\w-]+)['"]?\s*[:=]\s*['"]([^'"]*(?:box-shadow|drop-shadow)[^'"]*)['"]/g;
            let itemMatch;
            while ((itemMatch = itemRegex.exec(block)) !== null) {
              const [, key, value] = itemMatch;
              tokens.shadows![key] = value;
            }
          }

          // 提取排版相关变量
          const typographyVarRegex = /(?:const|let|var)\s+([\w$-]*[tT]ypography[\w$-]*|[tT]ext[Ss]tyle[\w$-]*|[fF]ont[\w$-]*)\s*=\s*\{([^}]+)\}/g;
          while ((match = typographyVarRegex.exec(content)) !== null) {
            const [, name, block] = match;
            // 解析 fontSize
            const fontSizeMatch = /['"]?fontSize['"]?\s*[:=]\s*['"]?([\d.]+(?:px|rem|em))['"]?/.exec(block);
            const fontWeightMatch = /['"]?fontWeight['"]?\s*[:=]\s*['"]?(\d+)['"]?/.exec(block);
            const lineHeightMatch = /['"]?lineHeight['"]?\s*[:=]\s*['"]?([\d.]+(?:px|rem|em|%))['"]?/.exec(block);
            const fontFamilyMatch = /['"]?fontFamily['"]?\s*[:=]\s*['"]([^'"]+)['"]/.exec(block);

            if (fontSizeMatch) {
              const cleanName = name.replace(/['"]/g, '') || 'default';
              tokens.typography![cleanName] = {
                fontSize: fontSizeMatch[1],
                fontWeight: fontWeightMatch ? parseInt(fontWeightMatch[1], 10) : 400,
                lineHeight: lineHeightMatch ? lineHeightMatch[1] : '1.5',
                fontFamily: fontFamilyMatch ? fontFamilyMatch[1] : undefined,
              };
            }
          }

          // 也提取扁平化的颜色对象（如 { colors: { primary: '#fff' } } 中的嵌套）
          const colorsBlockRegex = /['"]?colors['"]?\s*[:=]\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
          while ((match = colorsBlockRegex.exec(content)) !== null) {
            const [, block] = match;
            const colorItemRegex = /['"]?([\w-]+)['"]?\s*[:=]\s*['"]((?:#(?:[0-9A-Fa-f]{3,8})|rgb[ab]?\([^)]*\)|hsl[ab]?\([^)]*\)))/g;
            let colorItemMatch;
            while ((colorItemMatch = colorItemRegex.exec(block)) !== null) {
              const [, key, value] = colorItemMatch;
              tokens.colors![key] = value;
            }
          }
        } catch {
          // 忽略读取错误
        }
      }
    }

    return tokens;
  }

  private async extractFromFigma(figmaToken: string): Promise<Partial<DesignTokens>> {
    const tokens: Partial<DesignTokens> = { colors: {}, typography: {}, spacing: {}, borderRadius: {}, shadows: {}, breakpoints: {} };
    
    // Figma API 调用实现
    // 需要用户提供 fileKey（从 Figma 文件 URL 中获取）
    // 格式: https://www.figma.com/file/:fileKey/...
    const figmaFileKey = process.env.FIGMA_FILE_KEY;
    if (!figmaFileKey) {
      return tokens;
    }

    try {
      // 获取 Figma 文件样式
      const response = await fetch(
        `https://api.figma.com/v1/files/${figmaFileKey}/styles`,
        {
          headers: { 'X-Figma-Token': figmaToken },
        }
      );

      if (!response.ok) {
        return tokens;
      }

      const data = (await response.json()) as { meta?: { styles?: Array<{ name?: string; style_type?: string; key?: string }> } };
      const styles = data.meta?.styles || [];

      for (const style of styles) {
        const name = style.name || '';
        const styleType = style.style_type || '';

        if (styleType === 'FILL' && this.isColor(name, '')) {
          // 颜色样式 - 需要获取详细颜色值
          tokens.colors![this.sanitizeFigmaName(name)] = await this.getFigmaStyleColor(figmaToken, figmaFileKey, style);
        } else if (styleType === 'TEXT') {
          // 排版样式 - 需要获取详细排版值
          const typography = await this.getFigmaStyleTypography(figmaToken, figmaFileKey, style);
          if (typography) {
            tokens.typography![this.sanitizeFigmaName(name)] = typography;
          }
        } else if (styleType === 'EFFECT') {
          // 阴影样式
          const shadow = await this.getFigmaStyleShadow(figmaToken, figmaFileKey, style);
          if (shadow) {
            tokens.shadows![this.sanitizeFigmaName(name)] = shadow;
          }
        }
      }
    } catch {
      // 忽略 Figma API 错误
    }

    return tokens;
  }

  private sanitizeFigmaName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[/\\]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  private async getFigmaStyleColor(_token: string, _fileKey: string, style: any): Promise<string> {
    // Figma styles API 不直接返回颜色值，需要从节点获取
    // 这里返回样式名称作为占位，实际颜色需要通过 GET /v1/files/:key/nodes 获取
    return `figma-style-${style.key || style.name}`;
  }

  private async getFigmaStyleTypography(_token: string, _fileKey: string, _style: unknown): Promise<TypographyToken | null> {
    // 排版样式需要从节点的实际文本属性获取
    // 返回基础排版令牌结构
    return {
      fontSize: '16px',
      fontWeight: 400,
      lineHeight: '1.5',
      fontFamily: undefined,
    };
  }

  private async getFigmaStyleShadow(_token: string, _fileKey: string, style: any): Promise<string> {
    // 阴影样式需要从节点的实际效果属性获取
    return `figma-shadow-${style.key || style.name}`;
  }

  private async findFiles(projectPath: string, patterns: string[]): Promise<string[]> {
    const files: string[] = [];
    
    // 简单的文件查找实现
    const scanDir = (dir: string, depth: number = 0) => {
      if (depth > 3) return; // 限制扫描深度
      
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.includes('node_modules')) {
            scanDir(fullPath, depth + 1);
          } else if (entry.isFile()) {
            if (patterns.some(pattern => {
              const ext = pattern.replace('**/*', '');
              return fullPath.endsWith(ext);
            })) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // 忽略权限错误
      }
    };
    
    scanDir(projectPath);
    return files;
  }

  private isColor(name: string, value: string): boolean {
    const colorKeywords = ['color', 'bg', 'background', 'border', 'text', 'fill', 'stroke'];
    const isColorValue = /^#([0-9A-Fa-f]{3,8})|rgb|rgba|hsl|hsla|var\(--color/.test(value);
    return colorKeywords.some(kw => name.toLowerCase().includes(kw)) || isColorValue;
  }

  private isSpacing(name: string): boolean {
    const spacingKeywords = ['spacing', 'padding', 'margin', 'gap', 'space'];
    return spacingKeywords.some(kw => name.toLowerCase().includes(kw));
  }

  private isBorderRadius(name: string): boolean {
    const radiusKeywords = ['radius', 'rounded'];
    return radiusKeywords.some(kw => name.toLowerCase().includes(kw));
  }

  private isShadow(name: string): boolean {
    const shadowKeywords = ['shadow', 'box-shadow'];
    return shadowKeywords.some(kw => name.toLowerCase().includes(kw));
  }

  private mergeTokens(target: DesignTokens, source: Partial<DesignTokens>) {
    Object.assign(target.colors, source.colors);
    Object.assign(target.typography, source.typography);
    Object.assign(target.spacing, source.spacing);
    Object.assign(target.borderRadius, source.borderRadius);
    Object.assign(target.shadows, source.shadows);
    Object.assign(target.breakpoints, source.breakpoints);
  }
}
