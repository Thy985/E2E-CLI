/**
 * Verify Engine
 *
 * 编排 4 个验证层级，输出统一的 VerificationResult：
 * - Level 0: 格式验证（JSON 语法 / 括号配对）
 * - Level 1: 编译验证（⚠️ 当前是 no-op stub，见 levels/compile.ts）
 * - Level 2: 测试验证（vitest/jest/bun/mocha/ava）
 * - Level 3: AST diff 验证（修复前后 AST 对比）
 *
 * 实际实现已拆到 levels/*.ts，本文件只做编排 + 公共类型 re-export。
 */

import { createLogger, Logger } from '../../utils/logger';
import { Diagnosis, Fix, SkillContext } from '../../types';
import { runFormatVerification } from './levels/format';
import { runCompileVerification } from './levels/compile';
import { runTests, detectNewTestFailures } from './levels/test';
import { runAstDiffVerification } from './levels/ast';
import type { NormalizedVerifyOptions } from './levels/types';

// 公共类型重新声明（保留原 `import { ... } from '../verify'` 行为）
// 必须用 `export interface` 顶层声明，因为：
// 1) 外部可能 `import { VerifyOptions } from 'qa-agent/engines/verify'`（value-style import）
// 2) `export type` 会让 Bun ESM 报 SyntaxError
// 3) `export { ... } from` 因 interface 无运行期 binding 也会报
// interface 字段从 ./levels/types 引用类型别名 / 从原 verify 兼容。
export interface VerificationResult {
  success: boolean;
  fixId: string;
  diagnosisId: string;
  before: { issues: number; details: string[] };
  after: { issues: number; details: string[] };
  diff: { fixed: number; remaining: number; new: number };
  tests?: {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    beforeResult?: TestRunResult;
    afterResult?: TestRunResult;
    newFailures?: string[];
  };
  levels: {
    format: { passed: boolean; error?: string };
    compile: { passed: boolean; output?: string; errorCount?: number; skipped?: boolean };
    testValidation: { passed: boolean; output?: string; skipped: boolean };
    astDiff: { passed: boolean; skipped: boolean; result?: AstDiffResult };
  };
  errors: string[];
}

export interface VerifyOptions {
  level?: number;
  testCommand?: string;
  testTimeout?: number;
  compileTimeout?: number;
  allowedTestFailures?: number;
  runBeforeTests?: boolean;
  testRetries?: number;
  ignoreTestFailures?: boolean;
  maxAstNodeChanges?: number;
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

export interface AstDiffResult {
  passed: boolean;
  parsed: boolean;
  error?: string;
  beforeNodes?: number;
  afterNodes?: number;
  addedNodes: number;
  removedNodes: number;
  modifiedNodes: number;
  totalChanges: number;
  summary: string[];
}

export class VerifyEngine {
  private logger: Logger;
  private options: NormalizedVerifyOptions;

  constructor(
    options?: VerifyOptions,
    logger?: Logger,
  ) {
    this.logger = logger || createLogger({ level: 'info' });
    this.options = {
      level: options?.level ?? 3,
      testCommand: options?.testCommand,
      testTimeout: options?.testTimeout ?? 120000,
      compileTimeout: options?.compileTimeout ?? 60000,
      allowedTestFailures: options?.allowedTestFailures ?? 0,
      runBeforeTests: options?.runBeforeTests ?? true,
      testRetries: options?.testRetries ?? 1,
      ignoreTestFailures: options?.ignoreTestFailures ?? false,
      maxAstNodeChanges: options?.maxAstNodeChanges ?? 50,
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

    const opts: NormalizedVerifyOptions = { ...this.options, ...(options || {}) };

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
        astDiff: { passed: false, skipped: true },
      },
      errors: [],
    };

    try {
      // Level 0: Format verification (basic syntax check)
      result.levels.format = runFormatVerification(fix);
      if (!result.levels.format.passed) {
        result.errors.push(`Format validation failed: ${result.levels.format.error}`);
        return result;
      }

      // Level 1: Compile verification (tsc --noEmit)
      const compileRes = await runCompileVerification(context, opts, this.logger);
      result.levels.compile = {
        passed: compileRes.passed,
        output: compileRes.output ?? compileRes.message,
        errorCount: compileRes.errorCount,
        skipped: compileRes.skipped,
      };

      // Run pre-verification diagnosis
      const beforeDiagnoses = await this.runDiagnosis(context, fix.diagnosisId);
      result.before.issues = beforeDiagnoses.length;
      result.before.details = beforeDiagnoses.map((d: Diagnosis) => d.title);

      // Run tests BEFORE fix (baseline)
      let beforeTestResult: TestRunResult | undefined;
      if (opts.runBeforeTests && opts.level >= 2) {
        const runResult = await runTests(context, opts, this.logger, {
          label: 'before-fix',
        });
        if (runResult) {
          beforeTestResult = runResult;
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
        const res = await runTests(context, opts, this.logger, {
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
        const newFailures = detectNewTestFailures(beforeTestResult, afterTestResult);

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

      // Level 3: AST diff validation (if enabled)
      if (opts.level >= 3) {
        result.levels.astDiff = runAstDiffVerification(fix, opts);
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
        if (!result.levels.astDiff.skipped && !result.levels.astDiff.passed) {
          const astResult = result.levels.astDiff.result;
          if (astResult?.error) {
            result.errors.push(`AST validation failed: ${astResult.error}`);
          }
          if (astResult && astResult.totalChanges > opts.maxAstNodeChanges) {
            result.errors.push(
              `AST changes (${astResult.totalChanges}) exceed threshold (${opts.maxAstNodeChanges})`,
            );
          }
        }
        if (!result.levels.compile.skipped && !result.levels.compile.passed) {
          const compileErrorCount = result.levels.compile.errorCount ?? 0;
          result.errors.push(
            `TypeScript compile failed (${compileErrorCount} error(s)). Run 'tsc --noEmit' for details.`,
          );
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
   * Public: 执行项目测试并解析结果
   * 保留原 public API 行为（VerifyEngine.runTests 仍可被外部调用）。
   */
  async runTests(
    context: SkillContext,
    options: { label?: string; retries?: number } = {},
  ): Promise<TestRunResult | null> {
    return runTests(context, this.options, this.logger, options);
  }

  /**
   * Determine overall verification success
   */
  private determineSuccess(
    result: VerificationResult,
    opts: NormalizedVerifyOptions,
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

    // AST diff validation
    let astOk = true;
    if (opts.level >= 3 && !result.levels.astDiff.skipped) {
      astOk = result.levels.astDiff.passed;
    }

    // Compile validation: skip-aware (无 tsconfig / 无 tsc 视为 ok)
    let compileOk = true;
    if (!result.levels.compile.skipped && !result.levels.compile.passed) {
      compileOk = false;
    }

    return diagnosisOk && testOk && astOk && compileOk;
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
      lines.push(
        `  - Level 3 (AST diff): ${result.levels.astDiff.skipped ? '⏭️ Skipped' : result.levels.astDiff.passed ? '✅' : '❌'}`,
      );

      // AST diff details
      if (!result.levels.astDiff.skipped && result.levels.astDiff.result) {
        const ast = result.levels.astDiff.result;
        lines.push(`  - **AST Changes**: +${ast.addedNodes} -${ast.removedNodes} ~${ast.modifiedNodes} (${ast.totalChanges} total)`);
        if (ast.summary.length > 0) {
          for (const s of ast.summary) {
            lines.push(`    - ${s}`);
          }
        }
      }

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
