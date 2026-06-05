/**
 * Performance Checker
 *
 * 检查性能优化问题
 */

import * as fsp from 'fs/promises';
import * as path from 'path';
import { Diagnosis, Severity } from '../../../../types';

const MAX_DIR_DEPTH = 4;
const MAX_FILES_PER_KIND = 50;

interface HeavyLibrary {
  name: string;
  alternative: string;
  // 预编译正则，避免在 lines.forEach 里 hot-path 重新构造
  importRegex: RegExp;
}

const HEAVY_LIBRARIES: readonly HeavyLibrary[] = [
  { name: 'moment', alternative: 'date-fns or dayjs', importRegex: /import.*['"]moment['"]|require\(['"]moment['"]\)/ },
  { name: 'lodash', alternative: 'lodash-es (tree-shakeable)', importRegex: /import.*['"]lodash['"]|require\(['"]lodash['"]\)/ },
  { name: 'jquery', alternative: 'native DOM APIs', importRegex: /import.*['"]jquery['"]|require\(['"]jquery['"]\)/ },
];

const HTML_EXTENSIONS = ['.html', '.htm'];
const JS_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];

const SEVERITY_WARNING: Severity = 'warning';
const SEVERITY_INFO: Severity = 'info';

export class PerformanceChecker {
  async check(projectPath: string): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];

    // 检查 HTML 文件
    const htmlFiles = await this.findFilesByExt(projectPath, HTML_EXTENSIONS);
    for (const file of htmlFiles) {
      const content = await fsp.readFile(file, 'utf-8');
      const relativePath = path.relative(projectPath, file);

      issues.push(...this.checkRenderBlocking(content, relativePath));
      issues.push(...this.checkInlineStyles(content, relativePath));
    }

    // 检查 JavaScript 文件
    const jsFiles = await this.findFilesByExt(projectPath, JS_EXTENSIONS);
    for (const file of jsFiles) {
      const content = await fsp.readFile(file, 'utf-8');
      const relativePath = path.relative(projectPath, file);

      issues.push(...this.checkLargeDependencies(content, relativePath));
      issues.push(...this.checkUnoptimizedLoops(content, relativePath));
      issues.push(...this.checkMemoryLeaks(content, relativePath));
    }

    // 检查包大小
    issues.push(...(await this.checkBundleSize(projectPath)));

    return issues;
  }

  private checkRenderBlocking(content: string, file: string): Diagnosis[] {
    return this.forEachLine(content, (line, lineNo) => {
      const issues: Diagnosis[] = [];

      if (
        /<script[^>]*src[^>]*>/.test(line) &&
        !/async|defer/.test(line) &&
        !/<script[^>]*type\s*=\s*["']module["']/.test(line)
      ) {
        issues.push(this.buildDiagnosis({
          id: `perf-blocking-script-${file}-${lineNo}`,
          title: 'Render-blocking script',
          description: 'Script without async/defer blocks HTML parsing',
          line: lineNo,
          file,
          evidence: line.trim(),
          type: 'render-blocking',
          suggestion: 'Add async or defer attribute: <script src="..." defer></script>',
          severity: SEVERITY_WARNING,
        }));
      }

      if (/<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/.test(line)) {
        const bodyIndex = content.substring(0, content.indexOf(line)).lastIndexOf('<body');
        if (bodyIndex !== -1) {
          issues.push(this.buildDiagnosis({
            id: `perf-css-in-body-${file}-${lineNo}`,
            title: 'Stylesheet in body',
            description: 'Stylesheets should be in <head> to avoid render blocking',
            line: lineNo,
            file,
            evidence: line.trim(),
            type: 'css-in-body',
            suggestion: 'Move <link> tags to <head>',
            severity: SEVERITY_WARNING,
          }));
        }
      }

      return issues;
    });
  }

  private checkInlineStyles(content: string, file: string): Diagnosis[] {
    const inlineStyleRegex = /style\s*=\s*["'][^"']{100,}["']/g;
    return this.forEachLine(content, (line, lineNo) => {
      if (!inlineStyleRegex.test(line)) return [];
      return [this.buildDiagnosis({
        id: `perf-inline-style-${file}-${lineNo}`,
        title: 'Large inline style',
        description: 'Large inline styles increase HTML size and prevent caching',
        line: lineNo,
        file,
        evidence: line.trim().substring(0, 100) + '...',
        type: 'inline-style',
        suggestion: 'Move styles to external CSS file',
        severity: SEVERITY_INFO,
      })];
    });
  }

  private checkLargeDependencies(content: string, file: string): Diagnosis[] {
    return this.forEachLine(content, (line, lineNo) => {
      const issues: Diagnosis[] = [];
      for (const lib of HEAVY_LIBRARIES) {
        if (lib.importRegex.test(line)) {
          issues.push(this.buildDiagnosis({
            id: `perf-heavy-dep-${file}-${lineNo}`,
            title: `Heavy dependency: ${lib.name}`,
            description: `${lib.name} is a large library that may impact bundle size`,
            line: lineNo,
            file,
            evidence: line.trim(),
            type: 'heavy-dependency',
            suggestion: `Consider using ${lib.alternative}`,
            severity: SEVERITY_INFO,
          }));
        }
      }
      return issues;
    });
  }

  private checkUnoptimizedLoops(content: string, file: string): Diagnosis[] {
    return this.forEachLine(content, (line, lineNo, lines) => {
      const issues: Diagnosis[] = [];
      if (!/for\s*\(|while\s*\(|forEach\s*\(/.test(line)) return issues;

      const nextLines = lines.slice(lineNo, Math.min(lineNo + 10, lines.length)).join('\n');

      if (/document\.|querySelector|getElementById|getElementsBy/.test(nextLines)) {
        issues.push(this.buildDiagnosis({
          id: `perf-dom-in-loop-${file}-${lineNo}`,
          title: 'DOM manipulation in loop',
          description: 'DOM operations in loops can cause performance issues',
          line: lineNo,
          file,
          evidence: line.trim(),
          type: 'dom-in-loop',
          suggestion: 'Cache DOM references outside the loop or use DocumentFragment',
          severity: SEVERITY_WARNING,
        }));
      }

      if (/for\s*\(|while\s*\(/.test(line) && /function\s*\(|=>\s*{/.test(nextLines)) {
        issues.push(this.buildDiagnosis({
          id: `perf-func-in-loop-${file}-${lineNo}`,
          title: 'Function creation in loop',
          description: 'Creating functions in loops can impact performance',
          line: lineNo,
          file,
          evidence: line.trim(),
          type: 'function-in-loop',
          suggestion: 'Define functions outside the loop',
          severity: SEVERITY_INFO,
        }));
      }

      return issues;
    });
  }

  private checkMemoryLeaks(content: string, file: string): Diagnosis[] {
    return this.forEachLine(content, (line, lineNo) => {
      const issues: Diagnosis[] = [];

      if (/addEventListener/.test(line) && !content.includes('removeEventListener')) {
        issues.push(this.buildDiagnosis({
          id: `perf-event-leak-${file}-${lineNo}`,
          title: 'Potential memory leak: event listener not removed',
          description: 'Event listeners should be removed to prevent memory leaks',
          line: lineNo,
          file,
          evidence: line.trim(),
          type: 'memory-leak',
          suggestion: 'Add removeEventListener in cleanup/unmount',
          severity: SEVERITY_WARNING,
        }));
      }

      if (
        /setInterval|setTimeout/.test(line) &&
        !content.includes('clearInterval') &&
        !content.includes('clearTimeout')
      ) {
        issues.push(this.buildDiagnosis({
          id: `perf-timer-leak-${file}-${lineNo}`,
          title: 'Potential memory leak: timer not cleared',
          description: 'Timers should be cleared to prevent memory leaks',
          line: lineNo,
          file,
          evidence: line.trim(),
          type: 'memory-leak',
          suggestion: 'Add clearInterval/clearTimeout in cleanup',
          severity: SEVERITY_WARNING,
        }));
      }

      return issues;
    });
  }

  private async checkBundleSize(projectPath: string): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];

    const nodeModulesPath = path.join(projectPath, 'node_modules');
    try {
      await fsp.access(nodeModulesPath);
      const size = await getDirectorySize(nodeModulesPath);
      const sizeMB = size / (1024 * 1024);

      if (sizeMB > 500) {
        issues.push(this.buildDiagnosis({
          id: 'perf-large-node-modules',
          title: 'Large node_modules directory',
          description: `node_modules is ${sizeMB.toFixed(0)}MB. Consider reviewing dependencies`,
          line: 1,
          file: 'package.json',
          evidence: undefined,
          type: 'bundle-size',
          suggestion: 'Run "npm ls --depth=0" to review dependencies',
          severity: SEVERITY_WARNING,
        }));
      }
    } catch {
      // node_modules 不存在时静默跳过
    }

    const distPaths = ['dist', 'build', '.next', 'out'];
    for (const distDir of distPaths) {
      const distPath = path.join(projectPath, distDir);
      try {
        await fsp.access(distPath);
        const size = await getDirectorySize(distPath);
        const sizeMB = size / (1024 * 1024);

        if (sizeMB > 10) {
          issues.push(this.buildDiagnosis({
            id: `perf-large-bundle-${distDir}`,
            title: `Large build output: ${distDir}`,
            description: `Build output is ${sizeMB.toFixed(1)}MB. Consider code splitting`,
            line: 1,
            file: distDir,
            evidence: undefined,
            type: 'bundle-size',
            suggestion: 'Enable code splitting and tree shaking',
            severity: SEVERITY_INFO,
          }));
        }
      } catch {
        // 目录不存在或无权限 —— 静默跳过
      }
    }

    return issues;
  }

  /**
   * 5 个 `check*` 方法的共性：split('\n') + forEach line + 推 Diagnosis。
   * 抽到一处迭代器，把诊断构造和行扫描解耦。
   */
  private forEachLine(
    content: string,
    visit: (line: string, lineNo: number, lines: string[]) => Diagnosis[]
  ): Diagnosis[] {
    const lines = content.split('\n');
    const issues: Diagnosis[] = [];
    for (let i = 0; i < lines.length; i++) {
      issues.push(...visit(lines[i], i, lines));
    }
    return issues;
  }

  private buildDiagnosis(spec: {
    id: string;
    title: string;
    description: string;
    line: number;
    file: string;
    evidence: string | undefined;
    type: string;
    suggestion: string;
    severity: Severity;
  }): Diagnosis {
    return {
      id: spec.id,
      skill: 'best-practices',
      type: 'best-practice',
      severity: spec.severity,
      title: spec.title,
      description: spec.description,
      location: { file: spec.file, line: spec.line, column: 1 },
      evidence: spec.evidence !== undefined ? { type: 'code', content: spec.evidence } : undefined,
      metadata: {
        category: 'performance',
        type: spec.type,
        suggestion: spec.suggestion,
      },
    };
  }

  private async findFilesByExt(projectPath: string, extensions: readonly string[]): Promise<string[]> {
    const files: string[] = [];
    const lowerExts = extensions.map((e) => e.toLowerCase());

    const scanDir = async (dir: string, depth: number): Promise<void> => {
      if (depth > MAX_DIR_DEPTH) return;
      let entries: import('fs').Dirent[];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          await scanDir(path.join(dir, entry.name), depth + 1);
        } else if (entry.isFile() && lowerExts.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
          files.push(path.join(dir, entry.name));
        }
      }
    };

    await scanDir(projectPath, 0);
    return files.slice(0, MAX_FILES_PER_KIND);
  }
}

/**
 * 异步递归统计目录大小。把 node_modules 这类大目录交还给事件循环，
 * 不像旧的同步版本会阻塞 UI / 命令行。
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  let entries: import('fs').Dirent[];
  try {
    entries = await fsp.readdir(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }

  let size = 0;
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      size += await getDirectorySize(fullPath);
    } else if (entry.isFile()) {
      try {
        const stats = await fsp.stat(fullPath);
        size += stats.size;
      } catch {
        // 跳过不可读文件
      }
    }
  }
  return size;
}
