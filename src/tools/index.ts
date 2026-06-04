/**
 * Tools Module
 * Provides file system, browser, git, and shell tools
 */

import { ToolRegistry, FileSystemTool, BrowserTool, GitTool, ShellTool, Browser, Page } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob as globFn } from 'glob';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Create file system tool
 */
function createFileSystemTool(basePath: string = process.cwd()): FileSystemTool {
  return {
    async readFile(filePath: string): Promise<string> {
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);
      return fs.readFile(absolutePath, 'utf-8');
    },

    async writeFile(filePath: string, content: string): Promise<void> {
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, content, 'utf-8');
    },

    async exists(filePath: string): Promise<boolean> {
      try {
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);
        await fs.access(absolutePath);
        return true;
      } catch {
        return false;
      }
    },

    async glob(pattern: string): Promise<string[]> {
      const files = await globFn(pattern, {
        cwd: basePath,
        nodir: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      });
      return files;
    },

    async mkdir(dirPath: string): Promise<void> {
      const absolutePath = path.isAbsolute(dirPath) ? dirPath : path.join(basePath, dirPath);
      await fs.mkdir(absolutePath, { recursive: true });
    },

    async remove(filePath: string): Promise<void> {
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);
      await fs.rm(absolutePath, { recursive: true, force: true });
    },

    async stat(filePath: string): Promise<{ size: number; isFile: boolean; isDirectory: boolean }> {
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);
      const stats = await fs.stat(absolutePath);
      return {
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
      };
    },
  };
}

/**
 * Create browser tool backed by the GUI BrowserController (Playwright).
 *
 * The GUI agent owns a long-lived Playwright subprocess. We reuse it so that
 * skills which call `tools.browser` participate in the same browser session.
 * If the GUI module is not loaded, we fall back to a clear error.
 */
function createBrowserTool(): BrowserTool {
  return {
    async launch(options = {}) {
      const { BrowserController } = await import('../gui/browser');
      const controller = new BrowserController({
        browser: options.browser,
        headless: options.headless,
        viewport: options.viewport,
      });
      await controller.launch();
      return createBrowserAdapter(controller);
    },

    async newPage() {
      throw new Error(
        'BrowserTool.newPage() must be called on a Browser returned by launch(); ' +
          'use the GUI agent entrypoint for E2E flows.'
      );
    },

    async close() {
      // No persistent browser owned at this level; close happens on the Browser handle.
    },
  };
}

function createBrowserAdapter(controller: import('../gui/browser').BrowserController): Browser {
  return {
    async newPage(): Promise<Page> {
      // No URL: leave the page on about:blank; the caller drives navigation.
      const pageId = await controller.newPage('about:blank');
      return createPageAdapter(controller, pageId);
    },
    async close(): Promise<void> {
      await controller.close();
    },
  };
}

function createPageAdapter(
  controller: import('../gui/browser').BrowserController,
  _pageId: string
): Page {
  return {
    async goto(url: string): Promise<void> {
      await controller.goto(url);
    },
    async screenshot(options: { fullPage?: boolean; path?: string } = {}): Promise<Buffer> {
      const buf = await controller.screenshot({ fullPage: options.fullPage });
      if (options.path) {
        await fs.writeFile(options.path, buf);
      }
      return buf;
    },
    async content(): Promise<string> {
      return await controller.getContent();
    },
    async evaluate<T>(fn: () => T): Promise<T> {
      return await controller.evaluate(fn);
    },
    async close(): Promise<void> {
      // BrowserController manages page lifecycle; no per-page close.
    },
  };
}

/**
 * Create git tool
 */
function createGitTool(basePath: string = process.cwd()): GitTool {
  return {
    async getChangedFiles(baseRef = 'HEAD~1'): Promise<string[]> {
      try {
        const { stdout } = await execAsync(`git diff --name-only ${baseRef}`, { cwd: basePath });
        return stdout.trim().split('\n').filter(Boolean);
      } catch {
        return [];
      }
    },

    async getCurrentBranch(): Promise<string> {
      try {
        const { stdout } = await execAsync('git branch --show-current', { cwd: basePath });
        return stdout.trim();
      } catch {
        return 'main';
      }
    },

    async getCommitHash(): Promise<string> {
      try {
        const { stdout } = await execAsync('git rev-parse HEAD', { cwd: basePath });
        return stdout.trim().slice(0, 7);
      } catch {
        return 'unknown';
      }
    },
  };
}

/**
 * Create shell tool
 */
function createShellTool(basePath: string = process.cwd()): ShellTool {
  return {
    async execute(command, options = {}) {
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: options.cwd || basePath,
          env: { ...process.env, ...options.env },
          timeout: options.timeout || 60000,
        });
        return { stdout, stderr, exitCode: 0 };
      } catch (error: any) {
        return {
          stdout: error.stdout || '',
          stderr: error.stderr || error.message,
          exitCode: error.code || 1,
        };
      }
    },
  };
}

/**
 * Create tool registry
 */
export function createTools(basePath: string = process.cwd()): ToolRegistry {
  return {
    fs: createFileSystemTool(basePath),
    browser: createBrowserTool(),
    git: createGitTool(basePath),
    shell: createShellTool(basePath),
  };
}
