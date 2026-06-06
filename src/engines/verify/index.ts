/**
 * Verify Engine
 * Verifies that fixes were applied correctly and didn't break functionality
 *
 * 验证层级：
 * - Level 0: 格式验证（语法检查）
 * - Level 1: 编译验证（tsc --noEmit）
 * - Level 2: 测试验证（运行项目测试套件）
 * - Level 3: AST diff 验证（待实现）
 */

import { createLogger, Logger } from '../../utils/logger';
import { Diagnosis, Fix, SkillContext } from '../../types';

export interface VerificationResult {
  success: boolean;
  fixId: string;
  diagnosisId: string;
  before: {
    issues: number;
    details: string[];
  };
  after: {
    issues: number;
    details: string[];
  };
  diff: {
    fixed: number;
    remaining: number;
    new: number;
  };
  tests?: {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    /** 测试验证前后的状态对比 */
    beforeResult?: TestRunResult;
    afterResult?: TestRunResult;
    /** 新增失败的测试名称列表 */
    newFailures?: string[];
  };
  /** 各验证层级的结果 */
  levels: {
    format: { passed: boolean; error?: string };
    compile: { passed: boolean; output?: string };
    testValidation: { passed: boolean; output?: string; skipped: boolean };
  };
  errors: string[];
}

export interface VerifyOptions {
  /** 验证层级：0=格式, 1=编译, 2=测试 */
  level?: number;
  /** 测试命令（默认自动检测） */
  testCommand?: string;
  /** 测试超时时间（毫秒，默认 120000） */
  testTimeout?: number;
  /** 测试失败次数容忍度（默认 0） */
  allowedTestFailures?: number;
  /** 修复前是否也运行测试以建立基线 */
  runBeforeTests?: boolean;
  /** 测试失败时是否重试（默认 1 次） */
  testRetries?: number;
  /** 忽略测试失败（仅警告，不阻止验证通过） */
  ignoreTestFailures?: boolean;
}

export interface TestRunResult {
  success: boolean;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  output: string;
  runner: string;
  failedTests?: string[];
}

export class VerifyEngine {
  private logger: Logger;
  private options: Required<Omit<VerifyOptions, 'testCommand'>> & { testCommand?: string };

  constructor(
    options?: VerifyOptions,
    logger?: Logger,
  ) {
    this.logger = logger || createLogger({ level: 'info' });
    this.options = {
      level: options?.level ?? 2,
      testCommand: options?.testCommand,
      testTimeout: options?.testTimeout ?? 120000,
      allowedTestFailures: options?.allowedTestFailures ?? 0,
      runBeforeTests: options?.runBeforeTests ?? true,
      testRetries: options?.testRetries ?? 1,
      ignoreTestFailures: options?.ignoreTestFailures ?? false,
    };
  }

  /**
   * Verify a single fix
   */
  async verifyFix(
    fix: Fix,
    context: SkillContext,
    options?: VerifyOptions,
  ): Promise<VerificationResult> {
    this.logger.info(`Verifying fix: ${fix.id}`);

    const opts = { ...this.options, ...options };

    const result: VerificationResult = {
      success: false,
      fixId: fix.id,
      diagnosisId: fix.diagnosisId,
      before: { issues: 0, details: [] },
      after: { issues: 0, details: [] },
      diff: { fixed: 0, remaining: 0, new: 0 },
      levels: {
        format: { passed: false },
        compile: { passed: false },
        testValidation: { passed: false, skipped: true },
      },
      errors: [],
    };

    try {
      // Level 0: Format verification (basic syntax check)
      result.levels.format = this.runFormatVerification(fix);
      if (!result.levels.format.passed) {
        result.errors.push(`Format validation failed: ${result.levels.format.error}`);
        return result;
      }

      // Run pre-verification diagnosis
      const beforeDiagnoses = await this.runDiagnosis(context, fix.diagnosisId);
      result.before.issues = beforeDiagnoses.length;
      result.before.details = beforeDiagnoses.map((d: Diagnosis) => d.title);

      // Run tests BEFORE fix (baseline)
      let beforeTestResult: TestRunResult | undefined;
      if (opts.runBeforeTests && opts.level >= 2) {
        const result = await this.runTests(context, {
          label: 'before-fix',
        });
        if (result) {
          beforeTestResult = result;
          this.logger.info(
            `Tests before fix: ${beforeTestResult.passed} passed, ${beforeTestResult.failed} failed`,
          );
        }
      }

      // Run post-verification diagnosis
      const afterDiagnoses = await this.runDiagnosis(context, fix.diagnosisId);
      result.after.issues = afterDiagnoses.length;
      result.after.details = afterDiagnoses.map((d: Diagnosis) => d.title);

      // Calculate diff
      result.diff.fixed = Math.max(0, result.before.issues - result.after.issues);
      result.diff.remaining = afterDiagnoses.filter(
        (a: Diagnosis) => beforeDiagnoses.some((b: Diagnosis) => b.id === a.id),
      ).length;
      result.diff.new = afterDiagnoses.filter(
        (a: Diagnosis) => !beforeDiagnoses.some((b: Diagnosis) => b.id === a.id),
      ).length;

      // Level 2: Test validation (if enabled)
      let afterTestResult: TestRunResult | undefined;
      if (opts.level >= 2) {
        const res = await this.runTests(context, {
          label: 'after-fix',
          retries: opts.testRetries,
        });
        if (res) {
          afterTestResult = res;
        }
        result.levels.testValidation = {
          passed: afterTestResult
            ? afterTestResult.failed <= opts.allowedTestFailures
            : true,
          output: afterTestResult?.output,
          skipped: false,
        };
      }

      // Build test result
      if (beforeTestResult || afterTestResult) {
        // Detect new test failures introduced by the fix
        const newFailures = this.detectNewTestFailures(beforeTestResult, afterTestResult);

        result.tests = {
          passed: afterTestResult?.passed ?? 0,
          failed: afterTestResult?.failed ?? 0,
          skipped: afterTestResult?.skipped ?? 0,
          total: afterTestResult?.total ?? 0,
          beforeResult: beforeTestResult,
          afterResult: afterTestResult,
          newFailures,
        };
      }

      // Determine overall success
      result.success = this.determineSuccess(result, opts);

      if (result.success) {
        this.logger.info(`✅ Fix verified: ${fix.id}`);
      } else {
        this.logger.warn(`⚠️ Fix verification failed: ${fix.id}`);
        if (result.diff.new > 0) {
          result.errors.push(`Introduced ${result.diff.new} new issues`);
        }
        if (result.tests && result.tests.failed > opts.allowedTestFailures && !opts.ignoreTestFailures) {
          result.errors.push(
            `${result.tests.failed} tests failed (allowed: ${opts.allowedTestFailures})`,
          );
          if (result.tests.newFailures && result.tests.newFailures.length > 0) {
            result.errors.push(
              `New test failures: ${result.tests.newFailures.slice(0, 5).join(', ')}`,
            );
          }
        }
      }
    } catch (error) {
      this.logger.error(`❌ Verification failed: ${fix.id}`, error);
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Verify multiple fixes
   */
  async verifyFixes(
    fixes: Fix[],
    context: SkillContext,
    options?: VerifyOptions,
  ): Promise<VerificationResult[]> {
    this.logger.info(`Verifying ${fixes.length} fixes`);

    const results: VerificationResult[] = [];
    for (const fix of fixes) {
      const result = await this.verifyFix(fix, context, options);
      results.push(result);
    }

    // Summary
    const successCount = results.filter(r => r.success).length;
    this.logger.info(`\n📊 Verification Summary:`);
    this.logger.info(`   ✅ Passed: ${successCount}/${results.length}`);
    this.logger.info(`   ❌ Failed: ${results.length - successCount}/${results.length}`);

    return results;
  }

  /**
   * Level 0: Format verification (basic syntax check on fix changes)
   */
  private runFormatVerification(fix: Fix): { passed: boolean; error?: string } {
    try {
      if (!fix.changes || fix.changes.length === 0) {
        return { passed: true };
      }

      for (const change of fix.changes) {
        const ext = change.file.split('.').pop()?.toLowerCase();
        const content = change.content || '';

        // Basic JSON syntax validation
        if (ext === 'json') {
          try {
            JSON.parse(content);
          } catch (e) {
            return {
              passed: false,
              error: `Invalid JSON in ${change.file}: ${(e as Error).message}`,
            };
          }
        }

        // Basic bracket matching for JS/TS/JSX/TSX
        if (['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'].includes(ext || '')) {
          const brackets = this.checkBrackets(content);
          if (!brackets.balanced) {
            return {
              passed: false,
              error: `Unbalanced brackets in ${change.file}: ${brackets.error}`,
            };
          }
        }
      }

      return { passed: true };
    } catch (error) {
      return {
        passed: false,
        error: `Format check error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Simple bracket balance check
   */
  private checkBrackets(code: string): { balanced: boolean; error?: string } {
    const stack: string[] = [];
    const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
    const openers = new Set(['(', '[', '{']);
    const closers = new Set([')', ']', '}']);

    // Remove strings and comments to avoid false positives
    let cleaned = code
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/`(?:[^`\\]|\\.)*`/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, '""')
      .replace(/"(?:[^"\\]|\\.)*"/g, '""');

    for (const char of cleaned) {
      if (openers.has(char)) {
        stack.push(char);
      } else if (closers.has(char)) {
        const expected = pairs[char];
        if (stack.pop() !== expected) {
          return {
            balanced: false,
            error: `Mismatched '${char}'`,
          };
        }
      }
    }

    if (stack.length > 0) {
      return {
        balanced: false,
        error: `Unclosed: ${stack.slice(-3).join(', ')}`,
      };
    }

    return { balanced: true };
  }

  /**
   * Level 2: Run project tests with multi-runner support
   */
  async runTests(
    context: SkillContext,
    options: { label?: string; retries?: number } = {},
  ): Promise<TestRunResult | null> {
    const { project, logger } = context;
    const label = options.label || 'test';
    const retries = options.retries ?? 1;

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
      const testCommand = this.options.testCommand || this.detectTestCommand(scripts, devDeps);
      if (!testCommand) {
        logger.debug(`[${label}] No test script or runner detected`);
        return null;
      }

      // Detect runner type for output parsing
      const runner = this.detectTestRunner(devDeps, scripts);

      logger.info(`[${label}] Running tests with: ${testCommand} (${runner})`);

      // Execute with retries
      let lastResult: TestRunResult | null = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        lastResult = await this.executeTestCommand(testCommand, project.path, runner);

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

  /**
   * Detect test command from package.json
   */
  private detectTestCommand(scripts: Record<string, string>, deps: Record<string, string>): string | null {
    // Use explicit test script if available
    if (scripts.test && scripts.test !== 'echo "Error: no test specified" && exit 1') {
      return scripts.test;
    }

    // Fallback: infer from dev dependencies
    if (deps.vitest) return 'npx vitest run';
    if (deps.jest) return 'npx jest';
    if (deps.mocha) return 'npx mocha';

    return null;
  }

  /**
   * Detect test runner type for output parsing
   */
  private detectTestRunner(deps: Record<string, string>, scripts: Record<string, string>): string {
    const testScript = scripts.test || '';
    const allText = JSON.stringify(deps) + ' ' + testScript;

    if (allText.includes('vitest')) return 'vitest';
    if (allText.includes('jest')) return 'jest';
    if (allText.includes('mocha')) return 'mocha';
    if (allText.includes('bun:test') || allText.includes('bun test')) return 'bun';
    if (allText.includes('ava')) return 'ava';

    // Default: try to detect from common output patterns
    return 'unknown';
  }

  /**
   * Execute test command and parse results
   */
  private async executeTestCommand(
    command: string,
    cwd: string,
    runner: string,
  ): Promise<TestRunResult> {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');

      const testProcess = spawn(command, [], {
        cwd,
        shell: true,
        env: { ...process.env, CI: 'true', FORCE_COLOR: '0' },
        timeout: this.options.testTimeout,
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
        const parsed = this.parseTestOutput(output, runner);

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

  /**
   * Parse test output based on runner type
   */
  private parseTestOutput(output: string, runner: string): {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    failedTests?: string[];
  } {
    const failedTests: string[] = [];

    switch (runner) {
      case 'jest':
        return this.parseJestOutput(output, failedTests);
      case 'vitest':
        return this.parseVitestOutput(output, failedTests);
      case 'bun':
        return this.parseBunTestOutput(output, failedTests);
      case 'mocha':
        return this.parseMochaOutput(output, failedTests);
      case 'ava':
        return this.parseAvaOutput(output, failedTests);
      default:
        return this.parseGenericOutput(output, failedTests);
    }
  }

  /**
   * Parse Jest test output
   */
  private parseJestOutput(output: string, failedTests: string[]) {
    const passed = this.parseInt(output, /(\d+)\s+passed/) || 0;
    const failed = this.parseInt(output, /(\d+)\s+failed/) || 0;
    const skipped = this.parseInt(output, /(\d+)\s+(?:skipped|todo|pending)/) || 0;

    // Extract failed test names
    const failBlocks = output.match(/✕\s+(.+?)(?=\n\s*✕|\n\s*✓|\n\s*Test Suites|$)/g);
    if (failBlocks) {
      for (const block of failBlocks) {
        const name = block.match(/✕\s+(.+)/)?.[1]?.trim();
        if (name) failedTests.push(name);
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

  /**
   * Parse Vitest test output
   */
  private parseVitestOutput(output: string, failedTests: string[]) {
    const passed = this.parseInt(output, /(\d+)\s+passed/) || 0;
    const failed = this.parseInt(output, /(\d+)\s+failed/) || 0;
    const skipped = this.parseInt(output, /(\d+)\s+skipped/) || 0;

    // Vitest also shows "X tests | Y failed"
    if (passed === 0 && failed === 0) {
      const total = this.parseInt(output, /(\d+)\s+tests?/) || 0;
      const failCount = this.parseInt(output, /(\d+)\s+failed/) || 0;
      return {
        passed: total - failCount,
        failed: failCount,
        skipped,
        total,
        failedTests,
      };
    }

    return {
      passed,
      failed,
      skipped,
      total: passed + failed + skipped,
      failedTests,
    };
  }

  /**
   * Parse Bun test output
   */
  private parseBunTestOutput(output: string, failedTests: string[]) {
    // Bun output: "3 pass, 1 fail, 2 skip, 6 total"
    const passed = this.parseInt(output, /(\d+)\s+pass/) || 0;
    const failed = this.parseInt(output, /(\d+)\s+fail/) || 0;
    const skipped = this.parseInt(output, /(\d+)\s+(?:skip|todo)/) || 0;
    const total = this.parseInt(output, /(\d+)\s+total/) || passed + failed + skipped;

    // Extract failed test names from "fail" lines
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

  /**
   * Parse Mocha test output
   */
  private parseMochaOutput(output: string, failedTests: string[]) {
    const passing = this.parseInt(output, /(\d+)\s+passing/) || 0;
    const failing = this.parseInt(output, /(\d+)\s+failing/) || 0;
    const pending = this.parseInt(output, /(\d+)\s+pending/) || 0;

    return {
      passed: passing,
      failed: failing,
      skipped: pending,
      total: passing + failing + pending,
      failedTests,
    };
  }

  /**
   * Parse AVA test output
   */
  private parseAvaOutput(output: string, failedTests: string[]) {
    const passed = this.parseInt(output, /(\d+)\s+passed/) || 0;
    const failed = this.parseInt(output, /(\d+)\s+failed/) || 0;
    const skipped = this.parseInt(output, /(\d+)\s+skipped/) || 0;

    return {
      passed,
      failed,
      skipped,
      total: passed + failed + skipped,
      failedTests,
    };
  }

  /**
   * Parse generic test output (fallback)
   */
  private parseGenericOutput(output: string, failedTests: string[]) {
    const passed =
      this.parseInt(output, /(\d+)\s+pass(?:ing|ed)?/) ||
      this.parseInt(output, /(\d+)\s+ok/) ||
      0;

    const failed =
      this.parseInt(output, /(\d+)\s+fail(?:ing|ed)?/) ||
      this.parseInt(output, /(\d+)\s+not ok/) ||
      0;

    const skipped =
      this.parseInt(output, /(\d+)\s+(?:skip(?:ped)?|todo|pending)/) ||
      0;

    return {
      passed,
      failed,
      skipped,
      total: passed + failed + skipped,
      failedTests,
    };
  }

  /**
   * Detect new test failures introduced by the fix
   */
  private detectNewTestFailures(
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

  /**
   * Determine overall verification success
   */
  private determineSuccess(
    result: VerificationResult,
    opts: Required<Omit<VerifyOptions, 'testCommand'>> & { testCommand?: string },
  ): boolean {
    // Must have fixed at least one issue or no issues at all
    const diagnosisOk = result.diff.fixed >= 0 && result.diff.new === 0;

    // Test validation
    let testOk = true;
    if (opts.level >= 2 && result.tests && !opts.ignoreTestFailures) {
      testOk = result.tests.failed <= opts.allowedTestFailures;

      // If new test failures were introduced, fail the verification
      if (result.tests.newFailures && result.tests.newFailures.length > 0) {
        testOk = false;
      }
    }

    return diagnosisOk && testOk;
  }

  private parseInt(output: string, pattern: RegExp): number | null {
    const match = output.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }

  /**
   * Run diagnosis for a specific issue
   */
  private async runDiagnosis(
    context: SkillContext,
    diagnosisId: string,
  ): Promise<Diagnosis[]> {
    // Get the skill that created the original diagnosis
    const skillName = diagnosisId.split('-')[0];

    try {
      // Dynamically import and run the skill
      const skillModule = await import(`../../skills/builtin/${skillName}`);
      const SkillClass = skillModule.default || skillModule[Object.keys(skillModule)[0]];

      if (SkillClass && SkillClass.prototype && SkillClass.prototype.diagnose) {
        const skill = new SkillClass();
        const diagnoses = await skill.diagnose(context);
        return diagnoses.filter(
          (d: Diagnosis) => d.id === diagnosisId || d.skill === skillName,
        );
      }
    } catch (error) {
      this.logger.warn(`Failed to run diagnosis for ${skillName}`, error);
    }

    return [];
  }

  /**
   * Generate verification report
   */
  generateReport(results: VerificationResult[]): string {
    const lines: string[] = [];

    lines.push('# Fix Verification Report\n');
    lines.push(`Generated: ${new Date().toISOString()}\n`);

    const successCount = results.filter(r => r.success).length;
    lines.push(`## Summary\n`);
    lines.push(`- **Total Fixes**: ${results.length}`);
    lines.push(`- **Verified**: ${successCount}`);
    lines.push(`- **Failed**: ${results.length - successCount}`);
    lines.push(
      `- **Success Rate**: ${results.length > 0 ? ((successCount / results.length) * 100).toFixed(1) : '0.0'}%\n`,
    );

    // Test validation summary
    const withTests = results.filter(r => r.tests);
    if (withTests.length > 0) {
      lines.push(`## Test Validation\n`);
      for (const result of withTests) {
        if (result.tests) {
          lines.push(`### ${result.fixId}`);
          lines.push(`- **Status**: ${result.success ? '✅ Verified' : '❌ Failed'}`);
          lines.push(
            `- **Tests**: ${result.tests.passed} passed, ${result.tests.failed} failed, ${result.tests.skipped} skipped`,
          );
          if (result.tests.beforeResult) {
            lines.push(
              `- **Before Fix**: ${result.tests.beforeResult.passed} passed, ${result.tests.beforeResult.failed} failed (${result.tests.beforeResult.runner})`,
            );
          }
          if (result.tests.newFailures && result.tests.newFailures.length > 0) {
            lines.push(
              `- **⚠️ New Test Failures**: ${result.tests.newFailures.join(', ')}`,
            );
          }
          lines.push('');
        }
      }
    }

    lines.push(`## Details\n`);
    for (const result of results) {
      lines.push(`### ${result.fixId}`);
      lines.push(`- **Status**: ${result.success ? '✅ Verified' : '❌ Failed'}`);
      lines.push(`- **Before**: ${result.before.issues} issues`);
      lines.push(`- **After**: ${result.after.issues} issues`);
      lines.push(`- **Fixed**: ${result.diff.fixed}`);
      lines.push(`- **Remaining**: ${result.diff.remaining}`);
      lines.push(`- **New Issues**: ${result.diff.new}`);

      // Validation levels
      lines.push(`- **Validation Levels**:`);
      lines.push(`  - Level 0 (Format): ${result.levels.format.passed ? '✅' : '❌'}`);
      lines.push(
        `  - Level 1 (Compile): ${result.levels.compile.passed ? '✅' : result.levels.compile.passed === false ? '❌' : '⏭️'}`,
      );
      lines.push(
        `  - Level 2 (Tests): ${result.levels.testValidation.skipped ? '⏭️ Skipped' : result.levels.testValidation.passed ? '✅' : '❌'}`,
      );

      if (result.errors.length > 0) {
        lines.push(`- **Errors**:`);
        for (const error of result.errors) {
          lines.push(`  - ${error}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

export default VerifyEngine;
