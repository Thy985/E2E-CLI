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
    if (config.skills?.uiux?.figmaToken) {
      const figmaTokens = await this.extractFromFigma(config.skills.uiux.figmaToken);
      this.mergeTokens(tokens, figmaTokens);
    }

    return tokens;
  }

  private async extractFromCSS(projectPath: string): Promise<Partial<DesignTokens>> {
    const tokens: Partial<DesignTokens> = { colors: {}, spacing: {}, borderRadius: {}, shadows: {} };
    
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
    }

    return tokens;
  }

  private async extractFromTailwind(projectPath: string): Promise<Partial<DesignTokens>> {
    const tokens: Partial<DesignTokens> = { colors: {}, spacing: {}, borderRadius: {} };
    
    const tailwindConfigPath = path.join(projectPath, 'tailwind.config.js');
    const tailwindConfigTsPath = path.join(projectPath, 'tailwind.config.ts');
    
    let configPath = fs.existsSync(tailwindConfigPath) ? tailwindConfigPath 
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
    } catch (error) {
      // 忽略导入错误
    }

    return tokens;
  }

  private async extractFromThemeFiles(projectPath: string): Promise<Partial<DesignTokens>> {
    const tokens: Partial<DesignTokens> = {};
    
    // 常见的主题文件路径
    const themePaths = [
      'src/theme/index.ts',
      'src/theme/index.js',
      'src/styles/theme.ts',
      'src/styles/theme.js',
      'src/tokens/index.ts',
      'src/design-system/tokens.ts',
    ];
    
    for (const themePath of themePaths) {
      const fullPath = path.join(projectPath, themePath);
      if (fs.existsSync(fullPath)) {
        // 这里可以添加更复杂的主题文件解析逻辑
        // 目前简单返回空对象
        break;
      }
    }

    return tokens;
  }

  private async extractFromFigma(figmaToken: string): Promise<Partial<DesignTokens>> {
    // TODO: 实现 Figma API 调用
    // 需要调用 Figma API 获取设计令牌
    return {};
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
