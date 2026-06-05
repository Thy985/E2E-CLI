/**
 * Design Token Extractor
 *
 * Sources:
 * 1. CSS / SCSS / Less variable files
 * 2. Tailwind config
 * 3. Figma API (optional, requires config.uiux.figmaToken)
 */

import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { QAConfig } from '../../../config';
import { FigmaClient } from '../../../integrations/figma/client';

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

const DEFAULT_FILE_PATTERNS = ['**/*.css', '**/*.scss', '**/*.less'];
const MAX_CSS_FILES = 20;
const SCAN_DEPTH = 3;
const IGNORE_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build']);

/** Convert a list of minimatch glob patterns to a list of file extensions
 *  (used for fast `endsWith` filtering before minimatch verification). */
function globToExtensions(patterns: string[]): string[] {
  const exts = new Set<string>();
  for (const p of patterns) {
    const m = p.match(/\*\.([a-zA-Z0-9]+)$/);
    if (m) exts.add(`.${m[1].toLowerCase()}`);
  }
  return [...exts];
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

    // 1. From CSS variables
    const cssTokens = await this.extractFromCSS(projectPath);
    this.mergeTokens(tokens, cssTokens);

    // 2. From Tailwind config
    const tailwindTokens = await this.extractFromTailwind(projectPath);
    this.mergeTokens(tokens, tailwindTokens);

    // 3. From Figma (if configured)
    const figmaToken = config.uiux?.figmaToken;
    const figmaFileKey = config.uiux?.figmaFileKey;
    if (figmaToken && figmaFileKey) {
      const figmaTokens = await this.extractFromFigma(figmaToken, figmaFileKey);
      this.mergeTokens(tokens, figmaTokens);
    }

    return tokens;
  }

  private async extractFromCSS(projectPath: string): Promise<Partial<DesignTokens>> {
    const tokens: Partial<DesignTokens> = { colors: {}, spacing: {}, borderRadius: {}, shadows: {} };

    const cssFiles = await this.findFiles(projectPath, DEFAULT_FILE_PATTERNS);

    for (const file of cssFiles.slice(0, MAX_CSS_FILES)) {
      const content = await fs.promises.readFile(file, 'utf-8');

      const cssVarRegex = /--([\w-]+):\s*([^;]+);/g;
      let match;
      while ((match = cssVarRegex.exec(content)) !== null) {
        const [, name, value] = match;

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

    let configPath: string | null = null;
    if (fs.existsSync(tailwindConfigPath)) configPath = tailwindConfigPath;
    else if (fs.existsSync(tailwindConfigTsPath)) configPath = tailwindConfigTsPath;

    if (!configPath) return tokens;

    try {
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
    } catch {
      // Tailwind not installed or config has syntax error - skip
    }

    return tokens;
  }

  /** Extract from Figma via real client. Failures degrade to empty, never
   *  throw, so other token sources still take effect. */
  private async extractFromFigma(
    figmaToken: string,
    figmaFileKey: string
  ): Promise<Partial<DesignTokens>> {
    try {
      const client = new FigmaClient(figmaToken);
      const tokens = await client.extractDesignTokens(figmaFileKey);
      const { colors, typography, spacing, borderRadius, shadows } = tokens;
      return { colors, typography, spacing, borderRadius, shadows };
    } catch {
      return {};
    }
  }

  /** Find files matching glob patterns. Old version used `endsWith('.css')`
   *  on a stripped wildcard-css pattern which silently broke for nested
   *  path patterns. */
  private async findFiles(projectPath: string, patterns: string[]): Promise<string[]> {
    const extensions = globToExtensions(patterns);
    const candidates: string[] = [];

    const scanDir = (dir: string, depth: number): void => {
      if (depth > SCAN_DEPTH) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') || IGNORE_DIRS.has(entry.name)) continue;
          scanDir(path.join(dir, entry.name), depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            candidates.push(path.join(dir, entry.name));
          }
        }
      }
    };

    scanDir(projectPath, 0);

    return candidates.filter((f) =>
      patterns.some((p) => minimatch(f.replace(/\\/g, '/'), p, { dot: true }))
    );
  }

  private isColor(name: string, value: string): boolean {
    const colorKeywords = ['color', 'bg', 'background', 'border', 'text', 'fill', 'stroke'];
    const isColorValue = /^#([0-9A-Fa-f]{3,8})|rgb|rgba|hsl|hsla|var\(--color/.test(value);
    return colorKeywords.some((kw) => name.toLowerCase().includes(kw)) || isColorValue;
  }

  private isSpacing(name: string): boolean {
    const spacingKeywords = ['spacing', 'padding', 'margin', 'gap', 'space'];
    return spacingKeywords.some((kw) => name.toLowerCase().includes(kw));
  }

  private isBorderRadius(name: string): boolean {
    const radiusKeywords = ['radius', 'rounded'];
    return radiusKeywords.some((kw) => name.toLowerCase().includes(kw));
  }

  private isShadow(name: string): boolean {
    const shadowKeywords = ['shadow', 'box-shadow'];
    return shadowKeywords.some((kw) => name.toLowerCase().includes(kw));
  }

  private mergeTokens(target: DesignTokens, source: Partial<DesignTokens>): void {
    Object.assign(target.colors, source.colors);
    Object.assign(target.typography, source.typography);
    Object.assign(target.spacing, source.spacing);
    Object.assign(target.borderRadius, source.borderRadius);
    Object.assign(target.shadows, source.shadows);
    Object.assign(target.breakpoints, source.breakpoints);
  }
}
