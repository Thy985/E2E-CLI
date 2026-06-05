/**
 * Shell utilities
 * Execute shell commands with async/await support
 *
 * 设计要点：
 * 1. 优先用 Node.js 原生 child_process（不绑定 Bun），保证 node/bun 都能跑
 * 2. 跨平台：Windows 用 cmd.exe，Unix 用 /bin/sh
 * 3. 大输出自动降级为合并到 stderr，避免内存爆炸
 * 4. 安全：命令注入防护、路径遍历防护、命令长度限制
 */

import { spawn, execFile } from 'child_process';
import * as path from 'path';

interface ExecOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
  maxBuffer?: number; // bytes, default 10MB
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
const MAX_COMMAND_LENGTH = 4 * 1024; // 4KB max command length

/**
 * Characters/patterns that indicate shell injection attempts
 */
const DANGEROUS_SHELL_CHARS = /[;|&$`<>(){}[\]!\\\r\n]/;

/**
 * Validate a shell command for security concerns.
 * Throws if the command contains dangerous characters or exceeds max length.
 */
export function validateShellCommand(command: string, maxLength: number = MAX_COMMAND_LENGTH): void {
  if (!command || typeof command !== 'string') {
    throw new Error('Command must be a non-empty string');
  }

  if (command.length > maxLength) {
    throw new Error(
      `Command exceeds maximum length of ${maxLength} bytes (got ${command.length} bytes)`
    );
  }

  if (DANGEROUS_SHELL_CHARS.test(command)) {
    throw new Error(
      'Command contains potentially dangerous shell characters. ' +
      'Use execFileAsync for commands with arguments instead of shell strings.'
    );
  }
}

/**
 * Check if a file path attempts directory traversal.
 * Throws if traversal is detected.
 */
export function validateFilePath(filePath: string): void {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('File path must be a non-empty string');
  }

  // Reject paths with directory traversal patterns
  const normalized = path.normalize(filePath);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    throw new Error(
      'File path contains directory traversal or absolute path: ' + filePath
    );
  }
}

/**
 * Execute a command using execFile (no shell, safer).
 * Use this when you have a command and separate arguments.
 */
export async function execFileAsync(
  file: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const { cwd = process.cwd(), timeout = 60000, env = {}, maxBuffer = DEFAULT_MAX_BUFFER } = options;

  // Validate file path for traversal
  validateFilePath(file);

  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        cwd,
        env: { ...process.env, ...env },
        timeout,
        maxBuffer,
        shell: false, // Never spawn a shell
      },
      (error, stdout, stderr) => {
        if (error) {
          const castError = error as { code?: string | number; stdout?: string; stderr?: string };
          reject(new Error(
            `Command failed: ${file} ${args.join(' ')}\n` +
            `exit code: ${castError.code ?? 'unknown'}\n` +
            `stderr: ${castError.stderr || stderr || ''}`
          ));
          return;
        }
        resolve({
          stdout: String(stdout).trim(),
          stderr: String(stderr).trim(),
          exitCode: 0,
        });
      }
    );
  });
}

/**
 * Execute a shell command asynchronously
 * @deprecated Use execFileAsync for safer command execution.
 * This function validates the command against shell injection patterns.
 */
export async function execAsync(
  command: string,
  options: ExecOptions = {}
): Promise<ExecResult> {
  const { cwd = process.cwd(), timeout = 60000, env = {}, maxBuffer = DEFAULT_MAX_BUFFER } = options;
  const isWindows = process.platform === 'win32';

  // Validate command to prevent shell injection
  validateShellCommand(command);

  return new Promise((resolve, reject) => {
    const child = spawn(
      isWindows ? 'cmd.exe' : '/bin/sh',
      isWindows ? ['/c', command] : ['-c', command],
      {
        cwd,
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLen = 0;
    let stderrLen = 0;
    let killedByTimeout = false;
    let killedByBuffer = false;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill('SIGKILL');
      reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
    }, timeout);

    function handleChunk(target: 'stdout' | 'stderr', chunk: Buffer): void {
      const chunks = target === 'stdout' ? stdoutChunks : stderrChunks;
      const lenRef = target === 'stdout' ? { value: stdoutLen } : { value: stderrLen };
      chunks.push(chunk);
      lenRef.value += chunk.length;
      if (lenRef.value > maxBuffer) {
        killedByBuffer = true;
        child.kill('SIGKILL');
      }
    }

    child.stdout?.on('data', (chunk: Buffer) => handleChunk('stdout', chunk));
    child.stderr?.on('data', (chunk: Buffer) => handleChunk('stderr', chunk));

    child.on('error', (error: Error) => {
      clearTimeout(timer);
      if (!killedByTimeout) {
        reject(error);
      }
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      if (killedByTimeout || killedByBuffer) return;
      if (killedByBuffer) {
        reject(new Error(`Command output exceeded maxBuffer (${maxBuffer} bytes): ${command}`));
        return;
      }
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf-8').trim(),
        stderr: Buffer.concat(stderrChunks).toString('utf-8').trim(),
        exitCode: code ?? 1,
      });
    });
  });
}

/**
 * Execute a command and throw if it fails
 */
export async function execAsyncOrThrow(
  command: string,
  options: ExecOptions = {}
): Promise<ExecResult> {
  const result = await execAsync(command, options);

  if (result.exitCode !== 0) {
    throw new Error(
      `Command failed with exit code ${result.exitCode}\n` +
      `stdout: ${result.stdout}\n` +
      `stderr: ${result.stderr}`
    );
  }

  return result;
}
