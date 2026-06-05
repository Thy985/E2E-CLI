/**
 * Batch Fix Engine
 * 对一组 Diagnosis 跑 fix，并汇总结果。
 *
 * 之前是 7 段 switch + 动态 import + (mod as any).XxxSkill 拼凑。
 * 现在用 skills/builtin/index.ts 的 BUILTIN_SKILLS 静态映射表，
 * 把 issue.skill 字符串解析成对应的 class。
 */

import { Diagnosis, Fix, SkillContext } from '../../types';
import { FixEngine } from './index';
import { createLogger, Logger } from '../../utils/logger';
import { BUILTIN_SKILLS, SkillCtor } from '../../skills/builtin';

export interface BatchFixOptions {
  autoApproveLowRisk: boolean;
  autoApproveMediumRisk?: boolean;
  autoApproveHighRisk?: boolean;
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
  report: string;
}

/**
 * 把 skill 字符串名 → SkillCtor 的映射。
 * 用一行实例化只是为了读 class.name —— 比硬编码字符串安全（拼错就拿不到）。
 */
const SKILL_MAP: Record<string, SkillCtor> = Object.fromEntries(
  BUILTIN_SKILLS.map((Ctor) => [(new Ctor()).name, Ctor])
);

export class BatchFixEngine {
  private fixEngine: FixEngine;
  private logger: Logger;

  constructor() {
    this.fixEngine = new FixEngine({
      autoApproveLowRisk: true,
      sandboxEnabled: false,
      previewBeforeApply: false,
      verifyAfterFix: false,
    });
    this.logger = createLogger({ level: 'info' });
  }

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

    context.logger.info(`Processing ${issues.length} issues...`);

    const autoFixableIssues = issues.filter((issue) => this.canAutoFix(issue, options));
    result.autoFixableIssues = autoFixableIssues.length;
    context.logger.info(`Found ${autoFixableIssues.length} auto-fixable issues`);

    if (autoFixableIssues.length === 0) {
      result.report = this.generateReport(result);
      return result;
    }

    for (let i = 0; i < autoFixableIssues.length; i++) {
      const issue = autoFixableIssues[i];
      context.logger.info(`[${i + 1}/${autoFixableIssues.length}] Processing: ${issue.id}`);

      try {
        const fix = await this.generateFix(issue, context);
        if (!fix) {
          context.logger.warn(`  No fix generated for ${issue.id}`);
          continue;
        }

        context.logger.info(`  Fix generated: ${fix.description}`);

        if (options.dryRun) {
          context.logger.info(`  [DRY-RUN] Would apply: ${fix.description}`);
          continue;
        }

        await this.fixEngine.applyFix(fix, context.project.path);
        result.appliedFixes.push(fix);
        context.logger.info(`  Applied: ${fix.description}`);
      } catch (error) {
        context.logger.error(`  Failed to fix ${issue.id}:`, error);
        result.failedFixes.push({
          id: `failed-${issue.id}`,
          diagnosisId: issue.id,
          description: `Failed: ${issue.title}`,
          riskLevel: 'high',
          autoApplicable: false,
          changes: [],
        });
      }
    }

    result.report = this.generateReport(result);
    return result;
  }

  private canAutoFix(issue: Diagnosis, options: BatchFixOptions): boolean {
    if (!issue.fixSuggestion) return false;
    if (!issue.fixSuggestion.autoApplicable) return false;
    if (issue.severity === 'critical' && !options.autoApproveHighRisk) return false;
    return true;
  }

  private async generateFix(issue: Diagnosis, context: SkillContext): Promise<Fix | null> {
    const Ctor = SKILL_MAP[issue.skill];
    if (!Ctor) {
      this.logger.warn(`No built-in skill registered for "${issue.skill}"`);
      return null;
    }
    try {
      const skill = new Ctor();
      if (typeof skill.fix !== 'function') return null;
      return await skill.fix(issue, context);
    } catch (error) {
      context.logger.error(`Error generating fix for ${issue.id}:`, error);
      return null;
    }
  }

  private generateReport(result: BatchFixResult): string {
    let report = '# Batch Fix Report\n\n';
    report += '## Summary\n\n';
    report += `- **Total Issues**: ${result.totalIssues}\n`;
    report += `- **Auto-fixable**: ${result.autoFixableIssues}\n`;
    report += `- **Applied**: ${result.appliedFixes.length}\n`;
    report += `- **Failed**: ${result.failedFixes.length}\n\n`;

    if (result.appliedFixes.length > 0) {
      report += '## Applied Fixes\n\n';
      result.appliedFixes.forEach((fix, i) => {
        report += `${i + 1}. ${fix.description}\n`;
      });
      report += '\n';
    }

    return report;
  }
}

export default BatchFixEngine;
