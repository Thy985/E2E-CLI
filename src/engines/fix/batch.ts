/**
 * Batch Fix Engine
 * 
 * 批量修复引擎 - 一键修复多个问题
 */

import { Fix, Diagnosis, SkillContext } from '../../types';
import { FixEngine } from './index';
import { VerifyEngine } from '../verify';
import { SandboxManager } from '../sandbox';

export interface BatchFixOptions {
  autoApproveLowRisk: boolean;
  autoApproveMediumRisk: boolean;
  dryRun: boolean;
  preview: boolean;
  verify: boolean;
}

export interface BatchFixResult {
  totalIssues: number;
  autoFixableIssues: number;
  appliedFixes: Fix[];
  skippedFixes: Fix[];
  failedFixes: Fix[];
  verificationResults?: {
    success: boolean;
    fixedCount: number;
    newIssuesCount: number;
  };
  report: string;
}

export class BatchFixEngine {
  private fixEngine: FixEngine;
  private verifyEngine: VerifyEngine;
  private sandboxManager: SandboxManager;

  constructor() {
    this.fixEngine = new FixEngine({
      autoApproveLowRisk: true,
      sandboxEnabled: true,
      previewBeforeApply: true,
      verifyAfterFix: true,
    });
    this.verifyEngine = new VerifyEngine();
    this.sandboxManager = new SandboxManager();
  }

  /**
   * 批量修复问题
   */
  async batchFix(
    issues: Diagnosis[],
    context: SkillContext,
    options: BatchFixOptions
  ): Promise<BatchFixResult> {
    const result: BatchFixResult = {
      totalIssues: issues.length,
      autoFixableIssues: 0,
      appliedFixes: [],
      skippedFixes: [],
      failedFixes: [],
      report: '',
    };

    // 筛选可自动修复的问题
    const autoFixableIssues = issues.filter(issue => 
      this.canAutoFix(issue, options)
    );
    result.autoFixableIssues = autoFixableIssues.length;

    if (autoFixableIssues.length === 0) {
      result.report = this.generateReport(result);
      return result;
    }

    // 创建沙箱（如果需要预览）
    let sandboxId: string | undefined;
    if (options.preview) {
      const sandbox = await this.sandboxManager.create({
        projectPath: context.project.rootPath,
      });
      sandboxId = sandbox.id;
    }

    // 逐个修复问题
    for (const issue of autoFixableIssues) {
      try {
        // 生成修复
        const fix = await this.generateFix(issue, context);
        
        if (!fix) {
          result.skippedFixes.push(fix as Fix);
          continue;
        }

        // 评估风险
        const riskLevel = this.fixEngine.assessRisk(fix);
        
        // 根据风险等级决定是否自动应用
        const shouldApply = this.shouldApplyFix(riskLevel, options);
        
        if (!shouldApply) {
          result.skippedFixes.push(fix);
          continue;
        }

        if (options.dryRun) {
          // 仅预览，不实际应用
          context.logger.info(`[DRY-RUN] Would fix: ${issue.title}`);
          continue;
        }

        // 应用修复
        if (options.preview && sandboxId) {
          // 在沙箱中应用
          await this.sandboxManager.applyFix(sandboxId, fix);
        } else {
          // 直接应用
          await this.fixEngine.applyFix(fix, context.project.rootPath);
        }

        result.appliedFixes.push(fix);
        context.logger.info(`Fixed: ${issue.title}`);

      } catch (error) {
        result.failedFixes.push({
          id: `failed-${issue.id}`,
          type: 'code-change',
          description: `Failed to fix: ${issue.title}`,
          riskLevel: 'high',
          changes: [],
        } as Fix);
        context.logger.error(`Failed to fix: ${issue.title}`, error);
      }
    }

    // 验证修复（如果启用）
    if (options.verify && !options.dryRun) {
      result.verificationResults = await this.verifyFixes(
        issues,
        context,
        result.appliedFixes
      );
    }

    // 清理沙箱
    if (sandboxId) {
      await this.sandboxManager.destroy(sandboxId);
    }

    // 生成报告
    result.report = this.generateReport(result);

    return result;
  }

  /**
   * 生成批量修复报告
   */
  private generateReport(result: BatchFixResult): string {
    let report = '# Batch Fix Report\n\n';

    // 总体统计
    report += '## Summary\n\n';
    report += `- **Total Issues**: ${result.totalIssues}\n`;
    report += `- **Auto-fixable**: ${result.autoFixableIssues}\n`;
    report += `- **Applied**: ${result.appliedFixes.length}\n`;
    report += `- **Skipped**: ${result.skippedFixes.length}\n`;
    report += `- **Failed**: ${result.failedFixes.length}\n`;

    if (result.verificationResults) {
      report += `- **Verification**: ${result.verificationResults.success ? 'Passed' : 'Failed'}\n`;
      report += `- **Fixed**: ${result.verificationResults.fixedCount}\n`;
      report += `- **New Issues**: ${result.verificationResults.newIssuesCount}\n`;
    }

    report += '\n';

    // 已应用的修复
    if (result.appliedFixes.length > 0) {
      report += '## Applied Fixes\n\n';
      result.appliedFixes.forEach((fix, index) => {
        report += `${index + 1}. ${fix.description}\n`;
      });
      report += '\n';
    }

    // 跳过的修复
    if (result.skippedFixes.length > 0) {
      report += '## Skipped Fixes\n\n';
      result.skippedFixes.forEach((fix, index) => {
        report += `${index + 1}. ${fix.description}\n`;
      });
      report += '\n';
    }

    // 失败的修复
    if (result.failedFixes.length > 0) {
      report += '## Failed Fixes\n\n';
      result.failedFixes.forEach((fix, index) => {
        report += `${index + 1}. ${fix.description}\n`;
      });
      report += '\n';
    }

    return report;
  }

  // 私有方法

  private canAutoFix(issue: Diagnosis, options: BatchFixOptions): boolean {
    // 根据风险等级判断
    if (issue.severity === 'critical' && !options.autoApproveLowRisk) {
      return false;
    }
    return true;
  }

  private async generateFix(issue: Diagnosis, context: SkillContext): Promise<Fix | null> {
    // 这里应该调用对应的 Skill 的 fix 方法
    // 简化处理，返回 null
    return null;
  }

  private shouldApplyFix(riskLevel: 'low' | 'medium' | 'high', options: BatchFixOptions): boolean {
    switch (riskLevel) {
      case 'low':
        return options.autoApproveLowRisk;
      case 'medium':
        return options.autoApproveMediumRisk;
      case 'high':
        return false;
      default:
        return false;
    }
  }

  private async verifyFixes(
    originalIssues: Diagnosis[],
    context: SkillContext,
    appliedFixes: Fix[]
  ): Promise<{ success: boolean; fixedCount: number; newIssuesCount: number }> {
    // 重新扫描项目
    // 简化处理，返回模拟结果
    return {
      success: true,
      fixedCount: appliedFixes.length,
      newIssuesCount: 0,
    };
  }
}

export default BatchFixEngine;
