/**
 * Tools Module
 * Provides file system, git, and shell tools for the CLI pipeline.
 */

import { ToolRegistry, FileSystemTool, GitTool, ShellTool } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob as globFn } from 'glob';
import { exec } from 'child_process';
import { promisify } from 'util';
import { validateShellCommand } from '../utils/shell';

const execAsync = promisify(exec);

/**
 * Maximum allowed command length (4KB)
 */
const MAX_COMMAND_LENGTH = 4 * 1024;

/**
 * Blacklisted command prefixes/patterns that are never allowed
 */
const DANGEROUS_COMMAND_PATTERNS = [
  /^(rm\s+-rf|rm\s+--no-preserve)/i,           // destructive deletion
  /^(dd\s|mkfs|fdisk|parted)/i,                  // disk operations
  /^(curl|wget)\s+\S+\s*\|\s*(sh|bash)/i,        // pipe download to shell
  /^(chmod\s+[0-7]*[7][0-7]*\s)/i,              // overly permissive chmod
  /^(:\s*\{\s*|:\s*'\{\s*)/,                     // fork bombs
  /^(>\/dev\/tcp|\/dev\/udp)/i,                  // network redirects
  /^(nc\s+|ncat\s+|netcat\s+)/i,                 // netcat usage
  /^(python|perl|ruby|node)\s+-c/i,             // code execution via interpreters
  /^(sudo|su\s)/i,                               // privilege escalation
  /^(crontab\s+-|at\s)/i,                        // scheduling persistence
];

/**
 * Validate command against dangerous patterns.
 * Returns the command if safe, throws otherwise.
 */
function validateCommand(command: string): string {
  // First use the shared validation (dangerous chars, max length)
  validateShellCommand(command, MAX_COMMAND_LENGTH);

  // Check against dangerous command patterns
  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(command.trim())) {
      throw new Error(
        `Command matches a blocked security pattern: ${pattern.source}`
      );
    }
  }

  return command;
}

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
        // Validate command before execution
        validateCommand(command);

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
    git: createGitTool(basePath),
    shell: createShellTool(basePath),
  };
}
