/**
 * Batch Fix Engine - Clean Implementation
 */

import { Diagnosis, Fix, Skill, SkillContext } from '../../types';
import { FixEngine } from './index';

/** Type for dynamically imported skill modules */
interface SkillModule {
  default: new () => Skill;
}

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

export class BatchFixEngine {
  private fixEngine: FixEngine;

  constructor() {
    this.fixEngine = new FixEngine({
      autoApproveLowRisk: true,
      sandboxEnabled: false,
      previewBeforeApply: false,
      verifyAfterFix: false,
    });
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

    // Filter auto-fixable issues
    const autoFixableIssues = issues.filter(issue => this.canAutoFix(issue, options));
    result.autoFixableIssues = autoFixableIssues.length;

    context.logger.info(`Found ${autoFixableIssues.length} auto-fixable issues`);

    if (autoFixableIssues.length === 0) {
      result.report = this.generateReport(result);
      return result;
    }

    // Process each issue
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

        // Apply the fix
        await this.fixEngine.applyFix(fix, context.project.path);
        result.appliedFixes.push(fix);
        context.logger.info(`  Applied: ${fix.description}`);

      } catch (error) {
        context.logger.error(`  Failed to fix ${issue.id}:`, error);
        const failedFix: Fix = {
          id: `failed-${issue.id}`,
          diagnosisId: issue.id,
          description: `Failed: ${issue.title}`,
          riskLevel: 'high',
          autoApplicable: false,
          changes: [],
        };
        result.failedFixes.push(failedFix);
      }
    }

    result.report = this.generateReport(result);
    return result;
  }

  private canAutoFix(issue: Diagnosis, options: BatchFixOptions): boolean {
    // Debug logging
    console.log(`  [canAutoFix] ${issue.id}: Checking...`);
    
    // 临时方案：如果没有 fixSuggestion，检查 metadata 来判断是否可修复
    if (!issue.fixSuggestion) {
      // 检查 metadata 中是否有 type 或 category 信息
      const type = issue.metadata?.type;
      
      // 定义可自动修复的类型列表
      const autoFixableTypes = [
        // HTML 相关问题
        'missing-lang',
        'missing-viewport',
        'missing-title',
        // SEO 相关问题
        'missing-canonical',
        'missing-robots',
        'missing-description',
        'missing-keywords',
        // CSS 相关问题
        'unused-css',
        'missing-prefix',
        // 依赖相关问题
        'outdated-dependency',
        'duplicate-dependency',
        // 性能相关问题
        'large-bundle',
        'unoptimized-image',
      ];
      
      if (type && autoFixableTypes.includes(type)) {
        console.log(`  [canAutoFix] ${issue.id}: Can auto fix (type: ${type})`);
        return true;
      }
      
      console.log(`  [canAutoFix] ${issue.id}: No fixSuggestion and type not in allowlist`);
      return false;
    }
    
    // 有 fixSuggestion 时的原有逻辑
    if (!issue.fixSuggestion.autoApplicable) {
      console.log(`  [canAutoFix] ${issue.id}: autoApplicable is false`);
      return false;
    }
    
    // Skip critical issues unless explicitly allowed
    if (issue.severity === 'critical' && !options.autoApproveHighRisk) {
      console.log(`  [canAutoFix] ${issue.id}: Critical issue, high risk not approved`);
      return false;
    }
    
    console.log(`  [canAutoFix] ${issue.id}: Can auto fix (with fixSuggestion)`);
    return true;
  }

  private async generateFix(issue: Diagnosis, context: SkillContext): Promise<Fix | null> {
    try {
      let SkillClass: (new () => Skill) | null = null;

      switch (issue.skill) {
        case 'best-practices': {
          const mod = await import('../../skills/builtin/best-practices') as SkillModule;
          SkillClass = mod.default;
          break;
        }
        case 'seo': {
          const mod = await import('../../skills/builtin/seo') as SkillModule;
          SkillClass = mod.default;
          break;
        }
        case 'dependency': {
          const mod = await import('../../skills/builtin/dependency') as SkillModule;
          SkillClass = mod.default;
          break;
        }
        case 'a11y': {
          const mod = await import('../../skills/builtin/a11y') as SkillModule;
          SkillClass = mod.default;
          break;
        }
        case 'performance': {
          const mod = await import('../../skills/builtin/performance') as SkillModule;
          SkillClass = mod.default;
          break;
        }
        case 'ui-ux': {
          const mod = await import('../../skills/builtin/ui-ux') as SkillModule;
          SkillClass = mod.default;
          break;
        }
        case 'e2e': {
          const mod = await import('../../skills/builtin/e2e') as SkillModule;
          SkillClass = mod.default;
          break;
        }
        default:
          return null;
      }

      if (!SkillClass) return null;

      const skill = new SkillClass();
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
