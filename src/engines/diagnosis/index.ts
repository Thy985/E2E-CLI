/**
 * Diagnosis Engine
 *
 * 核心职责：
 * 1. 收集多个 skill 的诊断结果
 * 2. 对问题进行分类、根因分析、影响评估
 * 3. 优先级排序、去重
 * 4. 输出统一的 DiagnosisReport
 *
 * 设计要点：
 * - 不重复执行 skill.diagnose（由调用者传入结果）
 * - 支持按严重度/类型/skill 过滤
 * - 自动按文件位置去重
 */

import { createLogger, Logger } from '../../utils/logger';
import {
  Diagnosis,
  DiagnosisReport,
  DiagnosisType,
  ReportSummary,
  Severity,
  ProjectInfo,
  Config,
} from '../../types';
import { calculateScore, getGrade, groupBy } from '../../utils';

export interface DiagnosisInput {
  /** All diagnoses from all skills, optionally with the skill name that produced them */
  diagnoses: Array<{ skill: string; diagnoses: Diagnosis[] }>;
  project: ProjectInfo;
  config: Config;
  duration: number;
}

export interface PrioritizedDiagnosis extends Diagnosis {
  /** Computed priority (lower = more urgent) */
  priority: number;
  /** Detected root cause */
  rootCause?: string;
  /** Impact score 0-100 */
  impactScore: number;
}

// Severity weights for priority scoring.
// Lower number = higher urgency (will sort earlier). Critical issues are
// the most urgent and thus get the smallest numbers; info is the least.
const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 0,
  warning: 100,
  info: 1000,
};

const TYPE_WEIGHTS: Partial<Record<DiagnosisType, number>> = {
  security: 0,
  accessibility: 50,
  functionality: 50,
  performance: 100,
  'code-quality': 200,
  'ui-ux': 200,
  seo: 300,
  'best-practice': 400,
  dependency: 100,
  complexity: 400,
  api: 200,
  e2e: 200,
};

export class DiagnosisEngine {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || createLogger({ level: 'info' });
  }

  /**
   * Build a unified DiagnosisReport from raw inputs.
   */
  buildReport(input: DiagnosisInput): DiagnosisReport {
    const all = input.diagnoses.flatMap(d => d.diagnoses);
    this.logger.info(`Building report from ${all.length} raw diagnoses`);

    // Step 1: deduplicate
    const deduped = this.deduplicate(all);

    // Step 2: classify + prioritize
    const prioritized = this.prioritize(deduped);

    // Step 3: build summary
    const summary = this.summarize(prioritized);

    // Step 4: group dimensions (per-skill scores)
    const dimensions = this.computeDimensions(prioritized, input.diagnoses);

    // Step 5: determine exit code
    const exitCode = this.computeExitCode(summary, input.config);

    return {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      project: input.project,
      summary,
      dimensions,
      issues: prioritized,
      duration: input.duration,
      exitCode,
    };
  }

  /**
   * Deduplicate diagnoses by file + line + title.
   */
  deduplicate(diagnoses: Diagnosis[]): Diagnosis[] {
    const seen = new Set<string>();
    const result: Diagnosis[] = [];
    for (const d of diagnoses) {
      const key = `${d.location.file}:${d.location.line ?? 0}:${d.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(d);
    }
    return result;
  }

  /**
   * Sort and enrich diagnoses with priority + impact.
   */
  prioritize(diagnoses: Diagnosis[]): PrioritizedDiagnosis[] {
    return diagnoses
      .map(d => this.enrich(d))
      .sort((a, b) => a.priority - b.priority);
  }

  private enrich(d: Diagnosis): PrioritizedDiagnosis {
    const severityWeight = SEVERITY_WEIGHTS[d.severity] ?? 10;
    const typeWeight = TYPE_WEIGHTS[d.type] ?? 20;
    const autoFixBonus = d.fixSuggestion?.autoApplicable ? -10 : 0;
    const priority = severityWeight + typeWeight + autoFixBonus;

    // impactScore: 0-100 where higher = more impactful.
    // Critical security/accessibility issues max out at 100; info-only
    // issues stay near 0.
    const impactScore = Math.min(
      100,
      100 - severityWeight / 10 + (100 - typeWeight) / 5
    );

    return {
      ...d,
      priority,
      impactScore: Math.max(0, Math.min(100, impactScore)),
      rootCause: this.inferRootCause(d),
    };
  }

  private inferRootCause(d: Diagnosis): string {
    // Simple heuristic - real implementation could use LLM
    if (d.type === 'accessibility' && d.title.includes('alt')) {
      return '缺少无障碍语义，屏幕阅读器无法识别元素';
    }
    if (d.type === 'security' && d.title.includes('XSS')) {
      return '未对用户输入进行转义或过滤';
    }
    if (d.type === 'performance' && d.title.includes('console')) {
      return '生产代码包含调试语句，影响运行时性能';
    }
    if (d.type === 'code-quality') {
      return '代码结构不够健壮，可读性或可维护性问题';
    }
    return '需要进一步分析';
  }

  private summarize(issues: PrioritizedDiagnosis[]): ReportSummary {
    const bySeverity = groupBy(issues, i => i.severity);
    const critical = bySeverity.critical?.length ?? 0;
    const warning = bySeverity.warning?.length ?? 0;
    const info = bySeverity.info?.length ?? 0;
    const totalIssues = issues.length;
    const autoFixable = issues.filter(i => i.fixSuggestion?.autoApplicable).length;
    const score = calculateScore(issues);

    return {
      score,
      grade: getGrade(score),
      totalIssues,
      critical,
      warning,
      info,
      autoFixable,
    };
  }

  private computeDimensions(
    issues: PrioritizedDiagnosis[],
    inputs: Array<{ skill: string; diagnoses: Diagnosis[] }>
  ): Record<string, number> {
    const dims: Record<string, number> = {};
    for (const { skill } of inputs) {
      const skillIssues = issues.filter(i => i.skill === skill);
      dims[skill] = calculateScore(skillIssues);
    }
    return dims;
  }

  private computeExitCode(summary: ReportSummary, config: Config): number {
    const failOn = config.failOn;
    if (failOn === 'critical' && summary.critical > 0) return 1;
    if (failOn === 'warning' && (summary.critical > 0 || summary.warning > 0)) return 1;
    // Default: fail on critical
    return summary.critical > 0 ? 1 : 0;
  }
}

export default DiagnosisEngine;
