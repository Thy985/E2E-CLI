/**
 * Verify Engine
 * Verifies that fixes were applied correctly and didn't break functionality
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
  };
  errors: string[];
}

export class VerifyEngine {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || createLogger({ level: 'info' });
  }

  /**
   * Verify a single fix
   */
  async verifyFix(
    fix: Fix,
    context: SkillContext
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
      // Run pre-verification diagnosis
      const beforeDiagnoses = await this.runDiagnosis(context, fix.diagnosisId);
      result.before.issues = beforeDiagnoses.length;
      result.before.details = beforeDiagnoses.map((d: Diagnosis) => d.title);

      // Run tests if available
      const testResult = await this.runTests(context);
      if (testResult) {
        result.tests = testResult;
      }

      // Run post-verification diagnosis
      const afterDiagnoses = await this.runDiagnosis(context, fix.diagnosisId);
      result.after.issues = afterDiagnoses.length;
      result.after.details = afterDiagnoses.map((d: Diagnosis) => d.title);

      // Calculate diff
      result.diff.fixed = Math.max(0, result.before.issues - result.after.issues);
      result.diff.remaining = afterDiagnoses.filter(
        (a: Diagnosis) => beforeDiagnoses.some((b: Diagnosis) => b.id === a.id)
      ).length;
      result.diff.new = afterDiagnoses.filter(
        (a: Diagnosis) => !beforeDiagnoses.some((b: Diagnosis) => b.id === a.id)
      ).length;

      // Determine success
      result.success = result.diff.fixed > 0 && 
                      result.diff.new === 0 &&
                      (!testResult || testResult.failed === 0);

      if (result.success) {
        this.logger.info(`✅ Fix verified: ${fix.id}`);
      } else {
        this.logger.warn(`⚠️ Fix verification issues: ${fix.id}`);
        if (result.diff.new > 0) {
          result.errors.push(`Introduced ${result.diff.new} new issues`);
        }
        if (testResult && testResult.failed > 0) {
          result.errors.push(`${testResult.failed} tests failed`);
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
    context: SkillContext
  ): Promise<VerificationResult[]> {
    this.logger.info(`Verifying ${fixes.length} fixes`);

    const results: VerificationResult[] = [];
    for (const fix of fixes) {
      const result = await this.verifyFix(fix, context);
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
   * Run diagnosis for a specific issue
   */
  private async runDiagnosis(
    context: SkillContext,
    diagnosisId: string
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
        return diagnoses.filter((d: Diagnosis) => d.id === diagnosisId || d.skill === skillName);
      }
    } catch (error) {
      this.logger.warn(`Failed to run diagnosis for ${skillName}`, error);
    }

    return [];
  }

  /**
   * Run project tests
   */
  private async runTests(context: SkillContext): Promise<{
    passed: number;
    failed: number;
    skipped: number;
  } | null> {
    const { project, logger } = context;

    try {
      // Check if test command exists in package.json
      const fs = await import('fs');
      const path = await import('path');
      const packageJsonPath = path.join(project.path, 'package.json');

      if (!fs.existsSync(packageJsonPath)) {
        return null;
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      
      if (!packageJson.scripts || !packageJson.scripts.test) {
        logger.debug('No test script found in package.json');
        return null;
      }

      // Run tests
      logger.info('Running project tests...');
      
      const { execSync } = await import('child_process');
      
      try {
        const output = execSync('npm test', {
          cwd: project.path,
          encoding: 'utf-8',
          timeout: 120000, // 2 minute timeout
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Parse test results (format varies by test runner)
        const passed = this.parseTestCount(output, /(\d+) passing|(\d+) passed/i);
        const failed = this.parseTestCount(output, /(\d+) failing|(\d+) failed/i);
        const skipped = this.parseTestCount(output, /(\d+) pending|(\d+) skipped/i);

        logger.info(`Tests completed: ${passed} passed, ${failed} failed, ${skipped} skipped`);

        return { passed, failed, skipped };
      } catch (error) {
        // Test command failed
        logger.warn('Test command failed', error);
        return { passed: 0, failed: 1, skipped: 0 };
      }

    } catch (error) {
      logger.warn('Failed to run tests', error);
      return null;
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
    lines.push(`- **Success Rate**: ${((successCount / results.length) * 100).toFixed(1)}%\n`);
    
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
