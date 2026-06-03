/**
 * Tools Module
 * Provides file system, browser, git, and shell tools.
 *
 * Browser tool: backed by Playwright when available, otherwise throws with a
 * clear message. Callers that need to detect availability should use
 * `isBrowserToolAvailable()`.
 */

import { ToolRegistry, FileSystemTool, BrowserTool, Browser, GitTool, ShellTool } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob as globFn } from 'glob';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Detect whether the Playwright-backed browser tool can run in this environment.
 */
export async function isBrowserToolAvailable(): Promise<boolean> {
  try {
    await import('playwright');
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a file system tool rooted at `basePath`.
 */
function createFileSystemTool(basePath: string = process.cwd()): FileSystemTool {
  function resolve(p: string): string {
    return path.isAbsolute(p) ? p : path.join(basePath, p);
  }

  return {
    async readFile(filePath: string): Promise<string> {
      return fs.readFile(resolve(filePath), 'utf-8');
    },

    async writeFile(filePath: string, content: string): Promise<void> {
      const absolute = resolve(filePath);
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, content, 'utf-8');
    },

    async exists(filePath: string): Promise<boolean> {
      try {
        await fs.access(resolve(filePath));
        return true;
      } catch {
        return false;
      }
    },

    async glob(pattern: string): Promise<string[]> {
      const files = await globFn(pattern, {
        cwd: basePath,
        nodir: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
      });
      return files;
    },

    async mkdir(dirPath: string): Promise<void> {
      await fs.mkdir(resolve(dirPath), { recursive: true });
    },

    async remove(filePath: string): Promise<void> {
      await fs.rm(resolve(filePath), { recursive: true, force: true });
    },

    async stat(filePath: string): Promise<{ size: number; isFile: boolean; isDirectory: boolean }> {
      const stats = await fs.stat(resolve(filePath));
      return {
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
      };
    },
  };
}

/**
 * Create a real Playwright-backed browser tool.
 *
 * `launch()` is the only entry point that touches the browser; everything else
 * is a thin wrapper around the resulting Browser instance.
 */
function createBrowserTool(): BrowserTool {
  let playwright: typeof import('playwright') | null = null;
  let activeBrowser: import('playwright').Browser | null = null;

  async function getPlaywright(): Promise<typeof import('playwright')> {
    if (playwright) return playwright;
    try {
      playwright = await import('playwright');
      return playwright;
    } catch (err) {
      throw new Error(
        'Playwright is not installed. Run `bun add playwright` and `bunx playwright install chromium` to enable the browser tool.'
      );
    }
  }

  /**
   * Adapt a Playwright browser to the project's Browser contract.
   * We don't expose newPage() here because the project's Browser only
   * needs to give the caller access to the underlying playwright browser
   * via a custom PageWrapper returned from newPage().
   */
  function adaptBrowser(browser: import('playwright').Browser): Browser {
    return {
      newPage: async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        return wrapPage(page, context, browser);
      },
      close: async () => browser.close(),
    };
  }

  return {
    async launch(options = {}) {
      const pw = await getPlaywright();
      const browserType = options.browser || 'chromium';
      const launchOpts: import('playwright').LaunchOptions = {
        headless: options.headless ?? true,
      };
      const launcher = pw[browserType] as typeof pw.chromium;
      activeBrowser = await launcher.launch(launchOpts);
      return adaptBrowser(activeBrowser);
    },

    async newPage() {
      if (!activeBrowser) {
        throw new Error('Browser not launched. Call launch() first.');
      }
      const context = await activeBrowser.newContext();
      const page = await context.newPage();
      return wrapPage(page, context, activeBrowser);
    },

    async close() {
      if (activeBrowser) {
        await activeBrowser.close();
        activeBrowser = null;
      }
    },
  };
}

interface PageWrapper {
  goto(url: string): Promise<void>;
  screenshot(options?: { fullPage?: boolean; path?: string }): Promise<Buffer>;
  content(): Promise<string>;
  evaluate<T>(fn: () => T): Promise<T>;
  close(): Promise<void>;
}

function wrapPage(
  page: import('playwright').Page,
  context: import('playwright').BrowserContext,
  browser: import('playwright').Browser
): PageWrapper {
  return {
    async goto(url: string) {
      await page.goto(url);
    },
    async screenshot(options = {}) {
      return page.screenshot({ fullPage: options.fullPage, path: options.path });
    },
    async content() {
      return page.content();
    },
    async evaluate<T>(fn: () => T) {
      return page.evaluate(fn);
    },
    async close() {
      await page.close();
      await context.close();
      // Browser lifetime is owned by launch()/close() in the tool.
      void browser;
    },
  };
}

/**
 * Create a git tool.
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
 * Create a shell tool.
 */
function createShellTool(basePath: string = process.cwd()): ShellTool {
  return {
    async execute(command, options = {}) {
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: options.cwd || basePath,
          env: { ...process.env, ...(options.env || {}) },
          timeout: options.timeout || 60000,
          maxBuffer: 10 * 1024 * 1024,
        });
        return { stdout, stderr, exitCode: 0 };
      } catch (error: unknown) {
        const err = error as { stdout?: string; stderr?: string; code?: number; message?: string };
        return {
          stdout: err.stdout || '',
          stderr: err.stderr || err.message || '',
          exitCode: err.code ?? 1,
        };
      }
    },
  };
}

/**
 * Create the standard tool registry.
 */
export function createTools(basePath: string = process.cwd()): ToolRegistry {
  return {
    fs: createFileSystemTool(basePath),
    browser: createBrowserTool(),
    git: createGitTool(basePath),
    shell: createShellTool(basePath),
  };
}

export default createTools;
