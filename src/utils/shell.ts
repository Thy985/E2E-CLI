/**
 * Shell utilities
 * Execute shell commands with async/await support
 *
 * Works on both Bun and Node.js runtimes.
 */

interface ExecOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Check if running in Bun
 */
function isBun(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';
}

/**
 * Detect Windows platform
 */
function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Execute a shell command asynchronously
 *
 * @param command - The command to execute
 * @param options - Execution options (cwd, timeout, env)
 * @returns Promise resolving to stdout, stderr, and exitCode
 */
export async function execAsync(
  command: string,
  options: ExecOptions = {}
): Promise<ExecResult> {
  const { cwd = process.cwd(), timeout = 60000, env = {} } = options;
  const mergedEnv = { ...process.env, ...env };

  if (isBun()) {
    return execWithBun(command, { cwd, timeout, env: mergedEnv });
  }
  return execWithNode(command, { cwd, timeout, env: mergedEnv });
}

/**
 * Execute using Bun.spawn
 */
async function execWithBun(
  command: string,
  options: { cwd: string; timeout: number; env: Record<string, string | undefined> }
): Promise<ExecResult> {
  const { cwd, timeout, env } = options;
  const Bun = (globalThis as { Bun: typeof import('bun') }).Bun;

  return new Promise((resolve, reject) => {
    const child = isWindows()
      ? Bun.spawn(['cmd.exe', '/c', command], {
          cwd,
          env: env as Record<string, string>,
          stdout: 'pipe',
          stderr: 'pipe',
        })
      : Bun.spawn(['/bin/sh', '-c', command], {
          cwd,
          env: env as Record<string, string>,
          stdout: 'pipe',
          stderr: 'pipe',
        });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      try { child.kill(); } catch { /* ignore */ }
      reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
    }, timeout);

    const decoder = new TextDecoder();

    const stdoutStream = child.stdout as ReadableStream<Uint8Array>;
    const stderrStream = child.stderr as ReadableStream<Uint8Array>;

    stdoutStream
      .pipeTo(
        new WritableStream({
          write(chunk: Uint8Array) {
            stdout += decoder.decode(chunk);
          },
        })
      )
      .catch(() => { /* ignore */ });

    stderrStream
      .pipeTo(
        new WritableStream({
          write(chunk: Uint8Array) {
            stderr += decoder.decode(chunk);
          },
        })
      )
      .catch(() => { /* ignore */ });

    child.exited
      .then((code) => {
        clearTimeout(timer);
        if (killed) return;
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code,
        });
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Execute using Node.js child_process
 */
async function execWithNode(
  command: string,
  options: { cwd: string; timeout: number; env: Record<string, string | undefined> }
): Promise<ExecResult> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: options.cwd,
      env: options.env as Record<string, string>,
      timeout: options.timeout,
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      stdout: stdout?.trim() ?? '',
      stderr: stderr?.trim() ?? '',
      exitCode: 0,
    };
  } catch (error: unknown) {
    const err = error as {
      stdout?: string;
      stderr?: string;
      code?: number;
      message?: string;
    };
    return {
      stdout: err.stdout?.trim() ?? '',
      stderr: err.stderr?.trim() ?? err.message ?? '',
      exitCode: err.code ?? 1,
    };
  }
}

/**
 * Execute a command and throw if it fails
 *
 * @param command - The command to execute
 * @param options - Execution options
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
