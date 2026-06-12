/**
 * Level 1: Compile verification
 *
 * 通过 spawn `tsc --noEmit` 验证修复后代码能否通过 TypeScript 编译。
 *
 * 行为：
 * - 项目无 tsconfig.json → 跳过验证 (passed=true, skipped=true)
 * - 项目有 tsconfig.json → 跑 `tsc --noEmit`，0 errors → passed
 * - 编译失败 → passed=false + 错误输出 + 错误计数
 * - 超时（默认 60s） → passed=false + timeout 错误
 * - 进程异常 → passed=false + 进程错误信息
 *
 * 注意：tcs 在 monorepo 下会读最近的 tsconfig.json；多 package 项目
 * 可以通过 verify 时传 compileCommand 自定义命令。
 */

import { Logger } from '../../../utils/logger';
import { SkillContext } from '../../../types';
import { NormalizedVerifyOptions } from './types';

export interface CompileVerificationResult {
  passed: boolean;
  output?: string;
  errorCount?: number;
  /** 标识是否因无 tsconfig / 用户跳过而未实际跑编译 */
  skipped?: boolean;
  message?: string;
}

interface SpawnResult {
  success: boolean;
  output: string;
  errorCount: number;
  /** 进程退出码 (null = 未启动/异常) */
  exitCode: number | null;
  /** 进程错误（启动失败、超时等） */
  processError?: string;
}

const DEFAULT_COMPILE_TIMEOUT = 60000;
const TSC_ERROR_LINE = /^(.+)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s*(.+)$/;

export async function runCompileVerification(
  context: SkillContext,
  opts: NormalizedVerifyOptions,
  logger: Logger,
): Promise<CompileVerificationResult> {
  const projectPath = context.project.path;
  const fs = await import('fs');
  const path = await import('path');

  // 1. 检测 tsconfig.json
  const tsconfigPath = path.join(projectPath, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    return {
      passed: true,
      skipped: true,
      message: 'No tsconfig.json found — compile verification skipped',
    };
  }

  // 2. 检测 tsc 是否可用（devDep）
  const tscBin = await resolveTscBin(projectPath);
  if (!tscBin) {
    return {
      passed: true,
      skipped: true,
      message: 'tsc not found in node_modules/.bin — compile verification skipped',
    };
  }

  // 3. spawn tsc --noEmit
  const timeout = opts.compileTimeout ?? DEFAULT_COMPILE_TIMEOUT;
  logger.info(`[compile] Running tsc --noEmit (timeout: ${timeout}ms)`);

  const result = await runTscNoEmit(tscBin, projectPath, timeout);

  if (result.processError) {
    return {
      passed: false,
      output: result.output,
      errorCount: 0,
      message: `Compile process error: ${result.processError}`,
    };
  }

  if (result.success) {
    return {
      passed: true,
      output: result.output,
      errorCount: 0,
    };
  }

  return {
    passed: false,
    output: result.output,
    errorCount: result.errorCount,
    message: `TypeScript compile failed with ${result.errorCount} error(s) (exit code ${result.exitCode})`,
  };
}

/** 查找项目内的 tsc 可执行文件（devDep） */
async function resolveTscBin(projectPath: string): Promise<string | null> {
  const fs = await import('fs');
  const path = await import('path');

  // 优先看 node_modules/.bin/tsc
  const localBin = path.join(projectPath, 'node_modules', '.bin', 'tsc');
  if (fs.existsSync(localBin)) {
    return localBin;
  }

  // 退而求其次：使用 npx tsc
  return 'npx tsc';
}

/** 异步执行 tsc --noEmit 并解析结果 */
async function runTscNoEmit(
  tscCommand: string,
  cwd: string,
  timeout: number,
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { spawn } = require('child_process');

    const args = tscCommand === 'npx tsc' ? ['tsc', '--noEmit'] : ['--noEmit'];

    const proc = spawn(tscCommand, args, {
      cwd,
      shell: true,
      env: { ...process.env, CI: 'true', FORCE_COLOR: '0' },
      timeout,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, timeout);

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number | null) => {
      clearTimeout(timer);
      const output = stdout + stderr;

      if (timedOut) {
        resolve({
          success: false,
          output,
          errorCount: 0,
          exitCode: null,
          processError: `Compile timed out after ${timeout}ms`,
        });
        return;
      }

      const errorCount = countTscErrors(output);
      resolve({
        success: code === 0 && errorCount === 0,
        output,
        errorCount,
        exitCode: code,
      });
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timer);
      resolve({
        success: false,
        output: err.message,
        errorCount: 0,
        exitCode: null,
        processError: err.message,
      });
    });
  });
}

/** 解析 tsc 输出中的 error 数量（导出便于单测） */
export function countTscErrors(output: string): number {
  if (!output) return 0;
  const lines = output.split('\n');
  let count = 0;
  for (const line of lines) {
    if (TSC_ERROR_LINE.test(line)) {
      count++;
    }
  }
  return count;
}
