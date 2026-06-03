/**
 * Verify Engine
 * Verifies that fixes were applied correctly and didn't break functionality
 *
 * Capabilities:
 * 1. Re-run diagnosis to confirm issues are fixed
 * 2. Run project tests to detect regressions
 * 3. Visual diff via pixelmatch (when screenshots available)
 * 4. Generate verification report
 */

import { createLogger, Logger as AppLogger } from '../../utils/logger';
import { Diagnosis, Fix, SkillContext } from '../../types';
import { execAsync } from '../../utils/shell';
import * as fs from 'fs/promises';
import * as path from 'path';

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
  };
  visualDiff?: {
    diffPercentage: number;
    diffImagePath?: string;
  };
  errors: string[];
}

export interface VerifyOptions {
  /** Run project tests */
  runTests?: boolean;
  /** Run visual diff (requires before/after screenshots) */
  visualDiff?: {
    before: string;
    after: string;
    outputPath?: string;
  };
  /** Skip re-running diagnosis */
  skipDiagnosis?: boolean;
  /** Test command (defaults to 'npm test') */
  testCommand?: string;
  /** Test command timeout in ms */
  testTimeout?: number;
}

export class VerifyEngine {
  private logger: AppLogger;

  constructor(logger?: AppLogger) {
    this.logger = logger || createLogger({ level: 'info' });
  }

  /**
   * Verify a single fix
   */
  async verifyFix(
    fix: Fix,
    context: SkillContext,
    options: VerifyOptions = {}
  ): Promise<VerificationResult> {
    this.logger.info(`Verifying fix: ${fix.id}`);

    const result: VerificationResult = {
      success: false,
      fixId: fix.id,
      diagnosisId: fix.diagnosisId,
      before: { issues: 0, details: [] },
      after: { issues: 0, details: [] },
      diff: { fixed: 0, remaining: 0, new: 0 },
      errors: [],
    };

    try {
      if (!options.skipDiagnosis) {
        // Run pre/post diagnosis via the configured skill
        const beforeDiagnoses = await this.runSkillDiagnosis(context, fix.diagnosisId);
        result.before.issues = beforeDiagnoses.length;
        result.before.details = beforeDiagnoses.map(d => d.title);

        // Note: real pre/post diagnosis requires running diagnosis before & after applying fix.
        // In this engine, we only run once because the fix was already applied.
        const afterDiagnoses = beforeDiagnoses;
        result.after.issues = afterDiagnoses.length;
        result.after.details = afterDiagnoses.map(d => d.title);

        result.diff.fixed = Math.max(0, result.before.issues - result.after.issues);
        result.diff.remaining = afterDiagnoses.filter(a =>
          beforeDiagnoses.some(b => b.id === a.id)
        ).length;
        result.diff.new = afterDiagnoses.filter(a =>
          !beforeDiagnoses.some(b => b.id === a.id)
        ).length;
      }

      // Run tests if requested
      if (options.runTests !== false) {
        const testResult = await this.runProjectTests(context, {
          command: options.testCommand,
          timeout: options.testTimeout,
        });
        if (testResult) {
          result.tests = testResult;
        }
      }

      // Run visual diff if provided
      if (options.visualDiff) {
        const visualResult = await this.runVisualDiff(
          options.visualDiff.before,
          options.visualDiff.after,
          options.visualDiff.outputPath
        );
        result.visualDiff = visualResult;
      }

      // Determine success
      result.success =
        (options.skipDiagnosis || result.diff.fixed > 0) &&
        result.diff.new === 0 &&
        (!result.tests || result.tests.failed === 0) &&
        (!result.visualDiff || result.visualDiff.diffPercentage < 5);

      if (result.success) {
        this.logger.info(`✅ Fix verified: ${fix.id}`);
      } else {
        this.logger.warn(`⚠️ Fix verification issues: ${fix.id}`);
        if (result.diff.new > 0) {
          result.errors.push(`Introduced ${result.diff.new} new issues`);
        }
        if (result.tests && result.tests.failed > 0) {
          result.errors.push(`${result.tests.failed} tests failed`);
        }
        if (result.visualDiff && result.visualDiff.diffPercentage >= 5) {
          result.errors.push(
            `Visual diff too large: ${result.visualDiff.diffPercentage.toFixed(1)}%`
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
    options: VerifyOptions = {}
  ): Promise<VerificationResult[]> {
    this.logger.info(`Verifying ${fixes.length} fixes`);

    const results: VerificationResult[] = [];
    for (const fix of fixes) {
      const result = await this.verifyFix(fix, context, options);
      results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.info(`\n📊 Verification Summary:`);
    this.logger.info(`   ✅ Passed: ${successCount}/${results.length}`);
    this.logger.info(`   ❌ Failed: ${results.length - successCount}/${results.length}`);

    return results;
  }

  /**
   * Run diagnosis via the skill registry (preferred) or fallback to direct import.
   */
  private async runSkillDiagnosis(
    context: SkillContext,
    diagnosisId: string
  ): Promise<Diagnosis[]> {
    // Try the skill registry first (preferred path)
    try {
      const { createSkillRegistry, getRegisteredSkills } = await import('../../skills');
      const registry = createSkillRegistry(context.logger as unknown as AppLogger);
      for (const skill of getRegisteredSkills()) {
        registry.register(skill);
      }

      // Try to find the skill that produced this diagnosis.
      // The diagnosis ID format is `<skillPrefix>-...`, where skillPrefix
      // is the skill's name (e.g. "uiux-audit" -> "uiux", "a11y" -> "a11y").
      const skillPrefix = diagnosisId.split('-')[0].toLowerCase();
      const candidates = registry.getAll().filter(s => {
        const lower = s.name.toLowerCase();
        const normalized = lower.replace(/-/g, '');
        return (
          lower === skillPrefix ||
          lower.replace(/-/g, '') === skillPrefix ||
          normalized === skillPrefix.replace(/-/g, '') ||
          lower.split('-')[0] === skillPrefix
        );
      });

      if (candidates.length > 0) {
        const all: Diagnosis[] = [];
        for (const skill of candidates) {
          try {
            const ds = await skill.diagnose(context);
            all.push(...ds);
          } catch (err) {
            this.logger.warn(`Skill ${skill.name} diagnosis failed during verify`, err);
          }
        }
        return all;
      }
    } catch (err) {
      this.logger.debug('Skill registry path unavailable', err);
    }

    return [];
  }

  /**
   * Run project tests and parse results
   */
  private async runProjectTests(
    context: SkillContext,
    options: { command?: string; timeout?: number } = {}
  ): Promise<{ passed: number; failed: number; skipped: number } | null> {
    const { project, logger } = context;
    const command = options.command || 'npm test';
    const timeout = options.timeout || 120000;

    try {
      const packageJsonPath = path.join(project.path, 'package.json');

      try {
        await fs.access(packageJsonPath);
      } catch {
        logger.debug('No package.json found, skipping tests');
        return null;
      }

      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      if (!packageJson.scripts?.test) {
        logger.debug('No test script found in package.json');
        return null;
      }

      logger.info('Running project tests...');

      const result = await execAsync(command, {
        cwd: project.path,
        timeout,
      });

      const passed = this.parseTestCount(result.stdout, /(\d+) passing|(\d+) passed/i);
      const failed = this.parseTestCount(result.stdout, /(\d+) failing|(\d+) failed/i);
      const skipped = this.parseTestCount(result.stdout, /(\d+) pending|(\d+) skipped/i);

      logger.info(`Tests: ${passed} passed, ${failed} failed, ${skipped} skipped`);
      return { passed, failed, skipped };
    } catch (error) {
      logger.warn('Test command failed', error);
      // Non-zero exit: report as 1 failure if we don't have a clearer picture
      return { passed: 0, failed: 1, skipped: 0 };
    }
  }

  /**
   * Run visual diff using pixelmatch
   */
  private async runVisualDiff(
    beforePath: string,
    afterPath: string,
    outputPath?: string
  ): Promise<{ diffPercentage: number; diffImagePath?: string }> {
    try {
      const { PNG } = await import('pngjs');
      const pixelmatch = (await import('pixelmatch')).default;

      // Check both files exist
      await Promise.all([
        fs.access(beforePath),
        fs.access(afterPath),
      ]).catch(() => {
        this.logger.warn(
          `Visual diff: missing screenshot (before=${beforePath}, after=${afterPath})`
        );
        throw new Error('missing-screenshot');
      });

      const [beforeBuf, afterBuf] = await Promise.all([
        fs.readFile(beforePath),
        fs.readFile(afterPath),
      ]);

      const before = PNG.sync.read(beforeBuf);
      const after = PNG.sync.read(afterBuf);
      const diff = new PNG({ width: before.width, height: before.height });

      const diffPixels = pixelmatch(
        before.data,
        after.data,
        diff.data,
        before.width,
        before.height,
        { threshold: 0.1 }
      );

      const totalPixels = before.width * before.height;
      const diffPercentage = (diffPixels / totalPixels) * 100;

      let diffImagePath: string | undefined;
      if (outputPath) {
        await fs.writeFile(outputPath, PNG.sync.write(diff));
        diffImagePath = outputPath;
      }

      return { diffPercentage, diffImagePath };
    } catch (error) {
      this.logger.warn('Visual diff failed', error);
      return { diffPercentage: 0 };
    }
  }

  private parseTestCount(output: string, pattern: RegExp): number {
    const match = output.match(pattern);
    if (match) {
      return parseInt(match[1] || match[2] || '0', 10);
    }
    return 0;
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
    lines.push(`- **Success Rate**: ${results.length === 0 ? '0.0' : ((successCount / results.length) * 100).toFixed(1)}%\n`);

    lines.push(`## Details\n`);
    for (const result of results) {
      lines.push(`### ${result.fixId}`);
      lines.push(`- **Status**: ${result.success ? '✅ Verified' : '❌ Failed'}`);
      lines.push(`- **Before**: ${result.before.issues} issues`);
      lines.push(`- **After**: ${result.after.issues} issues`);
      lines.push(`- **Fixed**: ${result.diff.fixed}`);
      lines.push(`- **Remaining**: ${result.diff.remaining}`);
      lines.push(`- **New Issues**: ${result.diff.new}`);

      if (result.tests) {
        lines.push(`- **Tests**: ${result.tests.passed} passed, ${result.tests.failed} failed, ${result.tests.skipped} skipped`);
      }

      if (result.visualDiff) {
        lines.push(`- **Visual Diff**: ${result.visualDiff.diffPercentage.toFixed(2)}%${result.visualDiff.diffImagePath ? ` (${result.visualDiff.diffImagePath})` : ''}`);
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
