/**
 * Shell utilities
 * Execute shell commands with async/await support
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

  return new Promise((resolve, reject) => {
    // Detect platform
    const isWindows = Bun.env.OS === 'Windows_NT' || process.platform === 'win32';
    
    // Spawn process based on platform
    const child = isWindows
      ? Bun.spawn(['cmd.exe', '/c', command], {
          cwd,
          env: { ...process.env, ...env },
          stdout: 'pipe',
          stderr: 'pipe',
        })
      : Bun.spawn(['/bin/sh', '-c', command], {
          cwd,
          env: { ...process.env, ...env },
          stdout: 'pipe',
          stderr: 'pipe',
        });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Set up timeout
    const timer = setTimeout(() => {
      killed = true;
      child.kill();
      reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
    }, timeout);

    // Collect stdout and stderr using TextEncoder/TextDecoder
    const decoder = new TextDecoder();
    
    // Handle stdout - Bun.spawn returns ReadableStream for 'pipe' mode
    const stdoutStream = child.stdout as ReadableStream<Uint8Array>;
    const stderrStream = child.stderr as ReadableStream<Uint8Array>;

    stdoutStream.pipeTo(
      new WritableStream({
        write(chunk: Uint8Array) {
          stdout += decoder.decode(chunk);
        }
      })
    );

    stderrStream.pipeTo(
      new WritableStream({
        write(chunk: Uint8Array) {
          stderr += decoder.decode(chunk);
        }
      })
    );

    // Wait for process to complete
    child.exited.then((code) => {
      clearTimeout(timer);
      
      if (killed) {
        return; // Already rejected with timeout error
      }

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code,
      });
    }).catch((error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
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