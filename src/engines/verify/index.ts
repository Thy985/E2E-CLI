/**
 * Verify Engine
 * 
 * 修复验证引擎 - 验证修复是否成功
 */

import * as fs from 'fs';
import { Fix, Diagnosis } from '../../types';

export interface VerifyResult {
  success: boolean;
  fix: Fix;
  beforeIssues: Diagnosis[];
  afterIssues: Diagnosis[];
  fixedIssues: Diagnosis[];
  newIssues: Diagnosis[];
  remainingIssues: Diagnosis[];
  error?: string;
}

export interface VerifyOptions {
  runTests?: boolean;
  visualRegression?: boolean;
  performanceBenchmark?: boolean;
}

export class VerifyEngine {
  /**
   * 验证修复是否成功
   */
  async verifyFix(
    fix: Fix,
    beforeIssues: Diagnosis[],
    afterIssues: Diagnosis[],
    options: VerifyOptions = {}
  ): Promise<VerifyResult> {
    try {
      // 对比修复前后的 issues
      const fixedIssues = this.findFixedIssues(beforeIssues, afterIssues);
      const newIssues = this.findNewIssues(beforeIssues, afterIssues);
      const remainingIssues = this.findRemainingIssues(beforeIssues, afterIssues);

      // 检查修复是否引入了新的问题
      const hasNewCriticalIssues = newIssues.some(i => i.severity === 'critical');
      
      // 验证修复是否成功
      const success = fixedIssues.length > 0 && !hasNewCriticalIssues;

      return {
        success,
        fix,
        beforeIssues,
        afterIssues,
        fixedIssues,
        newIssues,
        remainingIssues,
      };

    } catch (error) {
      return {
        success: false,
        fix,
        beforeIssues,
        afterIssues: [],
        fixedIssues: [],
        newIssues: [],
        remainingIssues: beforeIssues,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 验证批量修复
   */
  async verifyBatchFixes(
    fixes: Fix[],
    beforeIssues: Diagnosis[],
    afterIssues: Diagnosis[]
  ): Promise<{
    totalFixes: number;
    successfulFixes: number;
    failedFixes: number;
    fixedIssues: Diagnosis[];
    newIssues: Diagnosis[];
    remainingIssues: Diagnosis[];
  }> {
    const fixedIssues = this.findFixedIssues(beforeIssues, afterIssues);
    const newIssues = this.findNewIssues(beforeIssues, afterIssues);
    const remainingIssues = this.findRemainingIssues(beforeIssues, afterIssues);

    return {
      totalFixes: fixes.length,
      successfulFixes: fixedIssues.length,
      failedFixes: fixes.length - fixedIssues.length,
      fixedIssues,
      newIssues,
      remainingIssues,
    };
  }

  /**
   * 生成验证报告
   */
  generateReport(result: VerifyResult): string {
    let report = '# Fix Verification Report\n\n';

    // 总体结果
    report += `## Summary\n\n`;
    report += `- **Status**: ${result.success ? '✅ Success' : '❌ Failed'}\n`;
    report += `- **Fixed Issues**: ${result.fixedIssues.length}\n`;
    report += `- **New Issues**: ${result.newIssues.length}\n`;
    report += `- **Remaining Issues**: ${result.remainingIssues.length}\n\n`;

    // 已修复的问题
    if (result.fixedIssues.length > 0) {
      report += `## Fixed Issues ✅\n\n`;
      result.fixedIssues.forEach(issue => {
        report += `- ${issue.title}\n`;
      });
      report += '\n';
    }

    // 新出现的问题
    if (result.newIssues.length > 0) {
      report += `## New Issues ⚠️\n\n`;
      result.newIssues.forEach(issue => {
        report += `- **${issue.severity}**: ${issue.title}\n`;
      });
      report += '\n';
    }

    // 未修复的问题
    if (result.remainingIssues.length > 0) {
      report += `## Remaining Issues 📝\n\n`;
      result.remainingIssues.forEach(issue => {
        report += `- ${issue.title}\n`;
      });
      report += '\n';
    }

    // 错误信息
    if (result.error) {
      report += `## Error ❌\n\n`;
      report += `${result.error}\n\n`;
    }

    return report;
  }

  // 私有方法

  /**
   * 找出已修复的问题
   */
  private findFixedIssues(before: Diagnosis[], after: Diagnosis[]): Diagnosis[] {
    return before.filter(beforeIssue => {
      // 检查 after 中是否不存在相同的问题
      return !after.some(afterIssue => 
        afterIssue.id === beforeIssue.id ||
        (afterIssue.title === beforeIssue.title && 
         afterIssue.location.file === beforeIssue.location.file)
      );
    });
  }

  /**
   * 找出新出现的问题
   */
  private findNewIssues(before: Diagnosis[], after: Diagnosis[]): Diagnosis[] {
    return after.filter(afterIssue => {
      // 检查 before 中是否不存在相同的问题
      return !before.some(beforeIssue =>
        beforeIssue.id === afterIssue.id ||
        (beforeIssue.title === afterIssue.title &&
         beforeIssue.location.file === afterIssue.location.file)
      );
    });
  }

  /**
   * 找出未修复的问题
   */
  private findRemainingIssues(before: Diagnosis[], after: Diagnosis[]): Diagnosis[] {
    return before.filter(beforeIssue => {
      // 检查 after 中是否仍然存在相同的问题
      return after.some(afterIssue =>
        afterIssue.id === beforeIssue.id ||
        (afterIssue.title === beforeIssue.title &&
         afterIssue.location.file === beforeIssue.location.file)
      );
    });
  }
}

export default VerifyEngine;
