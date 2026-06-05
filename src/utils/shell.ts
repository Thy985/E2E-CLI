/**
 * Shell utilities
 * Execute shell commands with async/await support
 *
 * 设计要点：
 * 1. 优先用 Node.js 原生 child_process（不绑定 Bun），保证 node/bun 都能跑
 * 2. 跨平台：Windows 用 cmd.exe，Unix 用 /bin/sh
 * 3. 大输出自动降级为合并到 stderr，避免内存爆炸
 */

import { spawn } from 'child_process';

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

/**
 * Execute a shell command asynchronously
 */
export async function execAsync(
  command: string,
  options: ExecOptions = {}
): Promise<ExecResult> {
  const { cwd = process.cwd(), timeout = 60000, env = {}, maxBuffer = DEFAULT_MAX_BUFFER } = options;
  const isWindows = process.platform === 'win32';

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
