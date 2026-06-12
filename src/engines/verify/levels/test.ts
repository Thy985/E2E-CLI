/**
 * Level 2: Test validation
 *
 * 自动检测项目测试运行器（vitest/jest/bun/mocha/ava），执行测试命令，
 * 解析 stdout 提取 pass/fail/skip 计数与失败用例名。
 *
 * 支持多 runner 输出解析（详见 parseXxxOutput 系列）。
 */

import { Logger } from '../../../utils/logger';
import { SkillContext } from '../../../types';
import { NormalizedVerifyOptions, TestRunResult } from './types';

export interface TestValidationResult {
  result: TestRunResult | null;
  /** 是否满足 allowedTestFailures + retries 后的最终结果 */
  passed: boolean;
  skipped: boolean;
  output?: string;
}

export interface RunTestsOptions {
  label?: string;
  retries?: number;
}

/** Level 2: 运行项目测试 + 解析输出 */
export async function runTestValidation(
  context: SkillContext,
  options: NormalizedVerifyOptions,
  logger: Logger,
): Promise<TestValidationResult> {
  const res = await runTests(context, options, logger);
  if (!res) {
    return { result: null, passed: true, skipped: true };
  }
  return {
    result: res,
    passed: res.failed <= options.allowedTestFailures,
    skipped: false,
    output: res.output,
  };
}

/**
 * 公开方法：执行项目测试并解析结果
 * 这是 VerifyEngine.runTests 的纯函数化版本，保留原 public API 行为。
 */
export async function runTests(
  context: SkillContext,
  options: NormalizedVerifyOptions,
  logger: Logger,
  runOptions: RunTestsOptions = {},
): Promise<TestRunResult | null> {
  const { project } = context;
  const label = runOptions.label || 'test';
  const retries = runOptions.retries ?? 1;

  try {
    const fs = await import('fs');
    const path = await import('path');
    const packageJsonPath = path.join(project.path, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      logger.debug(`[${label}] No package.json found, skipping tests`);
      return null;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const scripts = packageJson.scripts || {};
    const devDeps = { ...packageJson.devDependencies, ...packageJson.dependencies };

    // Auto-detect test runner and command
    const testCommand = options.testCommand || detectTestCommand(scripts, devDeps);
    if (!testCommand) {
      logger.debug(`[${label}] No test script or runner detected`);
      return null;
    }

    // Detect runner type for output parsing
    const runner = detectTestRunner(devDeps, scripts);

    logger.info(`[${label}] Running tests with: ${testCommand} (${runner})`);

    // Execute with retries
    let lastResult: TestRunResult | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      lastResult = await executeTestCommand(testCommand, project.path, runner, options.testTimeout);

      if (lastResult.success || attempt === retries) {
        break;
      }

      logger.warn(
        `[${label}] Test run ${attempt + 1}/${retries + 1} failed, retrying...`,
      );
      // Brief delay before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (lastResult) {
      logger.info(
        `[${label}] Tests completed: ${lastResult.passed} passed, ${lastResult.failed} failed, ${lastResult.skipped} skipped`,
      );
    }

    return lastResult;
  } catch (error) {
    logger.warn(`[${label}] Failed to run tests: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/** 从 package.json 推断测试命令 */
export function detectTestCommand(
  scripts: Record<string, string>,
  deps: Record<string, string>,
): string | null {
  if (scripts.test && scripts.test !== 'echo "Error: no test specified" && exit 1') {
    return scripts.test;
  }

  if (deps.vitest) return 'npx vitest run';
  if (deps.jest) return 'npx jest';
  if (deps.mocha) return 'npx mocha';

  return null;
}

/** 检测测试运行器类型（用于输出解析） */
export function detectTestRunner(
  deps: Record<string, string>,
  scripts: Record<string, string>,
): string {
  const testScript = scripts.test || '';
  const allText = JSON.stringify(deps) + ' ' + testScript;

  if (allText.includes('vitest')) return 'vitest';
  if (allText.includes('jest')) return 'jest';
  if (allText.includes('mocha')) return 'mocha';
  if (allText.includes('bun:test') || allText.includes('bun test')) return 'bun';
  if (allText.includes('ava')) return 'ava';

  return 'unknown';
}

/** 执行测试命令并解析结果（spawn 异步） */
export async function executeTestCommand(
  command: string,
  cwd: string,
  runner: string,
  testTimeout: number,
): Promise<TestRunResult> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { spawn } = require('child_process');

    const testProcess = spawn(command, [], {
      cwd,
      shell: true,
      env: { ...process.env, CI: 'true', FORCE_COLOR: '0' },
      timeout: testTimeout,
    });

    let stdout = '';
    let stderr = '';

    testProcess.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    testProcess.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    testProcess.on('close', (code: number | null) => {
      const output = stdout + stderr;
      const parsed = parseTestOutput(output, runner);

      resolve({
        success: code === 0 && parsed.failed === 0,
        ...parsed,
        output,
        runner,
      });
    });

    testProcess.on('error', (error: Error) => {
      resolve({
        success: false,
        passed: 0,
        failed: 0,
        skipped: 0,
        total: 0,
        output: error.message,
        runner,
      });
    });
  });
}

/** 测试输出解析分发 */
export function parseTestOutput(
  output: string,
  runner: string,
): {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  failedTests?: string[];
} {
  const failedTests: string[] = [];

  switch (runner) {
    case 'jest':
      return parseJestOutput(output, failedTests);
    case 'vitest':
      return parseVitestOutput(output, failedTests);
    case 'bun':
      return parseBunTestOutput(output, failedTests);
    case 'mocha':
      return parseMochaOutput(output, failedTests);
    case 'ava':
      return parseAvaOutput(output, failedTests);
    default:
      return parseGenericOutput(output, failedTests);
  }
}

function parseIntFromOutput(output: string, pattern: RegExp): number | null {
  const match = output.match(pattern);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

function parseJestOutput(output: string, failedTests: string[]) {
  const passed = parseIntFromOutput(output, /(\d+)\s+passed/) || 0;
  const failed = parseIntFromOutput(output, /(\d+)\s+failed/) || 0;
  const skipped = parseIntFromOutput(output, /(\d+)\s+(?:skipped|todo|pending)/) || 0;

  // Line-by-line extraction of failed test names from ✕ markers
  // (更鲁棒：避免 lookahead 在混合 ✓/✕ 输出中提前停 match)
  const lines = output.split('\n');
  for (const line of lines) {
    const m = line.match(/[✕✗]\s+(.+)/);
    if (m) {
      const name = m[1].trim();
      if (name && !name.startsWith('✓')) {
        failedTests.push(name);
      }
    }
  }

  return {
    passed,
    failed,
    skipped,
    total: passed + failed + skipped,
    failedTests,
  };
}

function parseIntMaxFromOutput(output: string, pattern: RegExp): number {
  // 取所有匹配的最大值（vitest "Test Files 3 passed\nTests 12 passed" 取 12）
  const matches = [...output.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))];
  if (matches.length === 0) return 0;
  return Math.max(...matches.map((m) => parseInt(m[1], 10)));
}

function parseVitestOutput(output: string, failedTests: string[]) {
  // Vitest 多种输出格式：
  //   "Test Files  3 passed (3)\n     Tests  12 passed (12)" — 优先取 Tests 行的 passed
  //   "Tests  2 failed | 10 passed (12)"
  //   " ✓ test-name" / " ✗ test-name" 行级 marker
  // 用 matchAll + max 避免 first-match 取到 "Test Files 3 passed" 的 3
  const passed = parseIntMaxFromOutput(output, /(\d+)\s+passed\b/);
  const failed = parseIntMaxFromOutput(output, /(\d+)\s+failed\b/);
  const skipped = parseIntFromOutput(output, /(\d+)\s+skipped/) || 0;

  return {
    passed,
    failed,
    skipped,
    total: passed + failed + skipped,
    failedTests,
  };
}

function parseBunTestOutput(output: string, failedTests: string[]) {
  const passed = parseIntFromOutput(output, /(\d+)\s+pass/) || 0;
  const failed = parseIntFromOutput(output, /(\d+)\s+fail/) || 0;
  const skipped = parseIntFromOutput(output, /(\d+)\s+(?:skip|todo)/) || 0;
  const total = parseIntFromOutput(output, /(\d+)\s+total/) || passed + failed + skipped;

  const failLines = output.match(/^(\s+)?✗\s+(.+?)$/gm);
  if (failLines) {
    for (const line of failLines) {
      const name = line.trim().replace(/^✗\s+/, '');
      if (name) failedTests.push(name);
    }
  }

  return {
    passed,
    failed,
    skipped,
    total,
    failedTests,
  };
}

function parseMochaOutput(output: string, failedTests: string[]) {
  const passing = parseIntFromOutput(output, /(\d+)\s+passing/) || 0;
  const failing = parseIntFromOutput(output, /(\d+)\s+failing/) || 0;
  const pending = parseIntFromOutput(output, /(\d+)\s+pending/) || 0;

  return {
    passed: passing,
    failed: failing,
    skipped: pending,
    total: passing + failing + pending,
    failedTests,
  };
}

function parseAvaOutput(output: string, failedTests: string[]) {
  // Ava 输出："  3 tests passed" / "  1 test failed" / "  1 test skipped"
  // 用 (?:tests?\s+)? 前缀兼容 "3 tests passed" 和 "3 passed" 两种风格
  const passed = parseIntFromOutput(output, /(\d+)\s+(?:tests?\s+)?passed/) || 0;
  const failed = parseIntFromOutput(output, /(\d+)\s+(?:tests?\s+)?failed/) || 0;
  const skipped = parseIntFromOutput(output, /(\d+)\s+(?:tests?\s+)?skipped/) || 0;

  return {
    passed,
    failed,
    skipped,
    total: passed + failed + skipped,
    failedTests,
  };
}

function parseGenericOutput(output: string, failedTests: string[]) {
  const passed =
    parseIntFromOutput(output, /(\d+)\s+pass(?:ing|ed)?/) ||
    parseIntFromOutput(output, /(\d+)\s+ok/) ||
    0;

  const failed =
    parseIntFromOutput(output, /(\d+)\s+fail(?:ing|ed)?/) ||
    parseIntFromOutput(output, /(\d+)\s+not ok/) ||
    0;

  const skipped =
    parseIntFromOutput(output, /(\d+)\s+(?:skip(?:ped)?|todo|pending)/) ||
    0;

  return {
    passed,
    failed,
    skipped,
    total: passed + failed + skipped,
    failedTests,
  };
}

/** 对比 before/after 测试结果，识别修复引入的新失败用例 */
export function detectNewTestFailures(
  before: TestRunResult | undefined,
  after: TestRunResult | undefined,
): string[] {
  if (!before || !after) return [];

  const beforeFailed = new Set(before.failedTests || []);
  const afterFailed = new Set(after.failedTests || []);

  const newFailures: string[] = [];
  for (const test of afterFailed) {
    if (!beforeFailed.has(test)) {
      newFailures.push(test);
    }
  }

  return newFailures;
}
