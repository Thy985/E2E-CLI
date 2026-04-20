/**
 * Tools Module
 * Provides file system, browser, git, and shell tools
 */

import { ToolRegistry, FileSystemTool, BrowserTool, GitTool, ShellTool } from '../types';
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
 * Create browser tool (placeholder - requires Playwright)
 */
function createBrowserTool(): BrowserTool {
  return {
    async launch(options = {}) {
      // Placeholder - would use Playwright in production
      throw new Error('Browser tool not implemented in MVP');
    },

    async newPage() {
      throw new Error('Browser tool not implemented in MVP');
    },

    async close() {
      // No-op
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
