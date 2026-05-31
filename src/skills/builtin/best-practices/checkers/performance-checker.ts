/**
 * Performance Checker
 * 
 * 检查性能优化问题
 */

import * as fs from 'fs';
import * as path from 'path';
import { Diagnosis, Severity } from '../../../../types';

export class PerformanceChecker {
  async check(projectPath: string): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];

    // 检查 HTML 文件
    const htmlFiles = await this.findHTMLFiles(projectPath);
    for (const file of htmlFiles) {
      const content = await fs.promises.readFile(file, 'utf-8');
      const relativePath = path.relative(projectPath, file);

      // 检查阻塞渲染的资源
      const blockingIssues = this.checkRenderBlocking(content, relativePath);
      issues.push(...blockingIssues);

      // 检查内联样式
      const inlineStyleIssues = this.checkInlineStyles(content, relativePath);
      issues.push(...inlineStyleIssues);
    }

    // 检查 JavaScript 文件
    const jsFiles = await this.findJSFiles(projectPath);
    for (const file of jsFiles) {
      const content = await fs.promises.readFile(file, 'utf-8');
      const relativePath = path.relative(projectPath, file);

      // 检查大型依赖
      const dependencyIssues = this.checkLargeDependencies(content, relativePath);
      issues.push(...dependencyIssues);

      // 检查未优化的循环
      const loopIssues = this.checkUnoptimizedLoops(content, relativePath);
      issues.push(...loopIssues);

      // 检查内存泄漏风险
      const memoryIssues = this.checkMemoryLeaks(content, relativePath);
      issues.push(...memoryIssues);
    }

    // 检查包大小
    const bundleIssues = await this.checkBundleSize(projectPath);
    issues.push(...bundleIssues);

    return issues;
  }

  private checkRenderBlocking(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // 检查同步 script 标签
      if (/<script[^>]*src[^>]*>/.test(line) && 
          !/async|defer/.test(line) &&
          !/<script[^>]*type\s*=\s*["\']module["\']/.test(line)) {
        issues.push({
          id: `perf-blocking-script-${file}-${index}`,
          skill: 'best-practices',
          type: 'best-practice',
          severity: 'warning',
          title: 'Render-blocking script',
          description: 'Script without async/defer blocks HTML parsing',
          location: { file, line: index + 1, column: 1 },
          evidence: { type: 'code', content: line.trim()  },
          metadata: {
            category: 'performance',
            type: 'render-blocking',
            suggestion: 'Add async or defer attribute: <script src="..." defer></script>',
          },
        });
      }

      // 检查 CSS 在 body 中
      if (/<link[^>]*rel\s*=\s*["\']stylesheet["\'][^>]*>/.test(line)) {
        const bodyIndex = content.substring(0, content.indexOf(line)).lastIndexOf('<body');
        if (bodyIndex !== -1) {
          issues.push({
            id: `perf-css-in-body-${file}-${index}`,
            skill: 'best-practices',
            type: 'best-practice',
            severity: 'warning',
            title: 'Stylesheet in body',
            description: 'Stylesheets should be in <head> to avoid render blocking',
            location: { file, line: index + 1, column: 1 },
            evidence: { type: 'code', content: line.trim()  },
            metadata: {
              category: 'performance',
              type: 'css-in-body',
              suggestion: 'Move <link> tags to <head>',
            },
          });
        }
      }
    });

    return issues;
  }

  private checkInlineStyles(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const inlineStyleRegex = /style\s*=\s*["'][^"']{100,}["']/g;
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      if (inlineStyleRegex.test(line)) {
        issues.push({
          id: `perf-inline-style-${file}-${index}`,
          skill: 'best-practices',
          type: 'best-practice',
          severity: 'info',
          title: 'Large inline style',
          description: 'Large inline styles increase HTML size and prevent caching',
          location: { file, line: index + 1, column: 1 },
          evidence: { type: 'code', content: line.trim().substring(0, 100) + '...'  },
          metadata: {
            category: 'performance',
            type: 'inline-style',
            suggestion: 'Move styles to external CSS file',
          },
        });
      }
    });

    return issues;
  }

  private checkLargeDependencies(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const heavyLibraries = [
      { name: 'moment', alternative: 'date-fns or dayjs' },
      { name: 'lodash', alternative: 'lodash-es (tree-shakeable)' },
      { name: 'jquery', alternative: 'native DOM APIs' },
    ];

    const lines = content.split('\n');
    lines.forEach((line, index) => {
      for (const lib of heavyLibraries) {
        if (new RegExp(`import.*['"]${lib.name}['"]|require\\(['"]${lib.name}['"]\\)`).test(line)) {
          issues.push({
            id: `perf-heavy-dep-${file}-${index}`,
            skill: 'best-practices',
            type: 'best-practice',
            severity: 'info',
            title: `Heavy dependency: ${lib.name}`,
            description: `${lib.name} is a large library that may impact bundle size`,
            location: { file, line: index + 1, column: 1 },
            evidence: { type: 'code', content: line.trim()  },
            metadata: {
              category: 'performance',
              type: 'heavy-dependency',
              suggestion: `Consider using ${lib.alternative}`,
            },
          });
        }
      }
    });

    return issues;
  }

  private checkUnoptimizedLoops(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // 检查在循环中进行 DOM 操作
      if (/for\s*\(|while\s*\(|forEach\s*\(/.test(line)) {
        const nextLines = lines.slice(index, Math.min(index + 10, lines.length)).join('\n');
        
        if (/document\.|querySelector|getElementById|getElementsBy/.test(nextLines)) {
          issues.push({
            id: `perf-dom-in-loop-${file}-${index}`,
            skill: 'best-practices',
            type: 'best-practice',
            severity: 'warning',
            title: 'DOM manipulation in loop',
            description: 'DOM operations in loops can cause performance issues',
            location: { file, line: index + 1, column: 1 },
            evidence: { type: 'code', content: line.trim()  },
            metadata: {
              category: 'performance',
              type: 'dom-in-loop',
              suggestion: 'Cache DOM references outside the loop or use DocumentFragment',
            },
          });
        }
      }

      // 检查在循环中创建函数
      if (/for\s*\(|while\s*\(/.test(line)) {
        const nextLines = lines.slice(index, Math.min(index + 10, lines.length)).join('\n');
        
        if (/function\s*\(|=>\s*{/.test(nextLines)) {
          issues.push({
            id: `perf-func-in-loop-${file}-${index}`,
            skill: 'best-practices',
            type: 'best-practice',
            severity: 'info',
            title: 'Function creation in loop',
            description: 'Creating functions in loops can impact performance',
            location: { file, line: index + 1, column: 1 },
            evidence: { type: 'code', content: line.trim()  },
            metadata: {
              category: 'performance',
              type: 'function-in-loop',
              suggestion: 'Define functions outside the loop',
            },
          });
        }
      }
    });

    return issues;
  }

  private checkMemoryLeaks(content: string, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // 检查未清理的事件监听器
      if (/addEventListener/.test(line)) {
        const hasRemove = content.includes('removeEventListener');
        if (!hasRemove) {
          issues.push({
            id: `perf-event-leak-${file}-${index}`,
            skill: 'best-practices',
            type: 'best-practice',
            severity: 'warning',
            title: 'Potential memory leak: event listener not removed',
            description: 'Event listeners should be removed to prevent memory leaks',
            location: { file, line: index + 1, column: 1 },
            evidence: { type: 'code', content: line.trim()  },
            metadata: {
              category: 'performance',
              type: 'memory-leak',
              suggestion: 'Add removeEventListener in cleanup/unmount',
            },
          });
        }
      }

      // 检查未清理的定时器
      if (/setInterval|setTimeout/.test(line)) {
        const hasClear = content.includes('clearInterval') || content.includes('clearTimeout');
        if (!hasClear) {
          issues.push({
            id: `perf-timer-leak-${file}-${index}`,
            skill: 'best-practices',
            type: 'best-practice',
            severity: 'warning',
            title: 'Potential memory leak: timer not cleared',
            description: 'Timers should be cleared to prevent memory leaks',
            location: { file, line: index + 1, column: 1 },
            evidence: { type: 'code', content: line.trim()  },
            metadata: {
              category: 'performance',
              type: 'memory-leak',
              suggestion: 'Add clearInterval/clearTimeout in cleanup',
            },
          });
        }
      }
    });

    return issues;
  }

  private async checkBundleSize(projectPath: string): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];

    // 检查 node_modules 大小
    const nodeModulesPath = path.join(projectPath, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
      try {
        const size = await this.getDirectorySize(nodeModulesPath);
        const sizeMB = size / (1024 * 1024);

        if (sizeMB > 500) {
          issues.push({
            id: `perf-large-node-modules`,
            skill: 'best-practices',
            type: 'best-practice',
            severity: 'warning',
            title: 'Large node_modules directory',
            description: `node_modules is ${sizeMB.toFixed(0)}MB. Consider reviewing dependencies`,
            location: { file: 'package.json', line: 1, column: 1 },
            metadata: {
              category: 'performance',
              type: 'bundle-size',
              suggestion: 'Run "npm ls --depth=0" to review dependencies',
            },
          });
        }
      } catch (error) {
        // 忽略错误
      }
    }

    // 检查 dist/build 大小
    const distPaths = ['dist', 'build', '.next', 'out'];
    for (const distDir of distPaths) {
      const distPath = path.join(projectPath, distDir);
      if (fs.existsSync(distPath)) {
        try {
          const size = await this.getDirectorySize(distPath);
          const sizeMB = size / (1024 * 1024);

          if (sizeMB > 10) {
            issues.push({
              id: `perf-large-bundle-${distDir}`,
              skill: 'best-practices',
              type: 'best-practice',
              severity: 'info',
              title: `Large build output: ${distDir}`,
              description: `Build output is ${sizeMB.toFixed(1)}MB. Consider code splitting`,
              location: { file: distDir, line: 1, column: 1 },
              metadata: {
                category: 'performance',
                type: 'bundle-size',
                suggestion: 'Enable code splitting and tree shaking',
              },
            });
          }
        } catch (error) {
          // 忽略错误
        }
      }
    }

    return issues;
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        size += await this.getDirectorySize(fullPath);
      } else if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        size += stats.size;
      }
    }

    return size;
  }

  private async findHTMLFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.html', '.htm'];

    const scanDir = (dir: string, depth: number = 0) => {
      if (depth > 4) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scanDir(fullPath, depth + 1);
          } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // 忽略权限错误
      }
    };

    scanDir(projectPath);
    return files.slice(0, 50);
  }

  private async findJSFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.js', '.jsx', '.ts', '.tsx'];

    const scanDir = (dir: string, depth: number = 0) => {
      if (depth > 4) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scanDir(fullPath, depth + 1);
          } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // 忽略权限错误
      }
    };

    scanDir(projectPath);
    return files.slice(0, 50);
  }
}
