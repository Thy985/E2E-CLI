/**
 * Audit Engine
 * Comprehensive project health auditing
 */

import {
  AuditReport,
  AuditSummary,
  AuditCategory,
  AuditCheck,
  AuditRecommendation,
  AuditOptions,
  ProjectInfo,
  ComplianceResult,
  TrendAnalysis,
} from '../../types';
import { Logger } from '../../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

// Import checkers
import { CodeQualityChecker } from './checkers/code-quality';
import { DependencyChecker } from './checkers/dependency';
import { ConfigChecker } from './checkers/config';
import { DocumentationChecker } from './checkers/documentation';
import { TestChecker } from './checkers/test';
import { SecurityChecker } from './checkers/security';

export interface AuditChecker {
  name: string;
  displayName: string;
  weight: number;
  check(projectPath: string, logger: Logger): Promise<AuditCategory>;
}

export class AuditEngine {
  private checkers: AuditChecker[] = [];
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    
    // Register default checkers
    this.registerChecker(new CodeQualityChecker());
    this.registerChecker(new DependencyChecker());
    this.registerChecker(new ConfigChecker());
    this.registerChecker(new DocumentationChecker());
    this.registerChecker(new TestChecker());
    this.registerChecker(new SecurityChecker());
  }

  registerChecker(checker: AuditChecker): void {
    this.checkers.push(checker);
  }

  async audit(projectPath: string, options: AuditOptions = {}): Promise<AuditReport> {
    const startTime = Date.now();
    
    this.logger.info(`开始项目健康度审计: ${projectPath}`);

    // Get project info
    const projectInfo = await this.getProjectInfo(projectPath);

    // Run all checkers
    const categories: AuditCategory[] = [];
    const allChecks: AuditCheck[] = [];

    for (const checker of this.checkers) {
      this.logger.debug(`运行检查器: ${checker.name}`);
      try {
        const category = await checker.check(projectPath, this.logger);
        categories.push(category);
        allChecks.push(...category.checks);
      } catch (error) {
        this.logger.warn(`检查器 ${checker.name} 执行失败:`, error);
        categories.push({
          name: checker.name,
          displayName: checker.displayName,
          score: 0,
          weight: checker.weight,
          status: 'fail',
          checks: [],
          description: `检查失败: ${error}`,
        });
      }
    }

    // Calculate summary
    const summary = this.calculateSummary(categories);

    // Generate recommendations
    const recommendations = this.generateRecommendations(categories);

    // Compliance check if requested
    let compliance: ComplianceResult | undefined;
    if (options.compliance && options.compliance.length > 0) {
      compliance = await this.checkCompliance(projectPath, options.compliance);
    }

    // Trend analysis
    let trends: TrendAnalysis | undefined;
    if (options.compareWith) {
      trends = await this.analyzeTrends(projectPath, summary.overallScore);
    }

    const duration = Date.now() - startTime;

    this.logger.info(`审计完成，总体得分: ${summary.overallScore}/100`);

    return {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      project: projectInfo,
      summary,
      categories,
      compliance,
      trends,
      recommendations,
      duration,
    };
  }

  private async getProjectInfo(projectPath: string): Promise<ProjectInfo> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    let name = path.basename(projectPath);
    let type: ProjectInfo['type'] = 'webapp';
    let framework: string | undefined;
    let packageManager: ProjectInfo['packageManager'] = 'npm';

    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      name = packageJson.name || name;

      // Detect framework
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      if (deps.react) framework = 'react';
      else if (deps.vue) framework = 'vue';
      else if (deps.angular) framework = 'angular';
      else if (deps.svelte) framework = 'svelte';
      else if (deps.next) framework = 'next';
      else if (deps.nuxt) framework = 'nuxt';

      // Detect type
      if (deps.express || deps.fastify || deps.koa) type = 'api';
      else if (packageJson.bin) type = 'cli';
      else if (deps.typescript && !deps.react && !deps.vue) type = 'library';

      // Detect package manager
      const lockFiles = await fs.readdir(projectPath).catch(() => [] as string[]);
      if (lockFiles.includes('pnpm-lock.yaml')) packageManager = 'pnpm';
      else if (lockFiles.includes('yarn.lock')) packageManager = 'yarn';

    } catch {
      // package.json not found
    }

    return { name, path: projectPath, type, framework, packageManager };
  }

  private calculateSummary(categories: AuditCategory[]): AuditSummary {
    // Calculate weighted score
    let totalWeight = 0;
    let weightedScore = 0;
    let totalIssues = 0;
    let criticalIssues = 0;

    const categoryScores: Record<string, number> = {};

    for (const category of categories) {
      totalWeight += category.weight;
      weightedScore += category.score * category.weight;
      categoryScores[category.name] = category.score;

      for (const check of category.checks) {
        if (check.status === 'fail' || check.status === 'warning') {
          totalIssues++;
          if (check.severity === 'critical') {
            criticalIssues++;
          }
        }
      }
    }

    const overallScore = Math.round(weightedScore / totalWeight);
    const overallGrade = this.calculateGrade(overallScore);
    const healthStatus = this.determineHealthStatus(overallScore, criticalIssues);

    return {
      overallScore,
      overallGrade,
      healthStatus,
      categoryScores,
      totalIssues,
      criticalIssues,
    };
  }

  private calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private determineHealthStatus(
    score: number,
    criticalIssues: number
  ): 'healthy' | 'warning' | 'critical' {
    if (criticalIssues > 0 || score < 60) return 'critical';
    if (score < 80) return 'warning';
    return 'healthy';
  }

  private generateRecommendations(categories: AuditCategory[]): AuditRecommendation[] {
    const recommendations: AuditRecommendation[] = [];

    for (const category of categories) {
      for (const check of category.checks) {
        if (check.status === 'fail' && check.fixSuggestion) {
          recommendations.push({
            priority: check.severity === 'critical' ? 'high' : 'medium',
            category: category.displayName,
            title: check.name,
            description: check.description,
            impact: `提升 ${category.displayName} 得分`,
            effort: 'medium',
            autoFixable: false,
          });
        }
      }
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations.slice(0, 10); // Top 10 recommendations
  }

  private async checkCompliance(
    projectPath: string,
    standards: string[]
  ): Promise<ComplianceResult | undefined> {
    // Compliance checks require dedicated tooling (e.g. axe-core for WCAG).
    // The previous version fabricated hard-coded scores/requirements, which
    // misled users into thinking an audit was actually performed. Return
    // undefined and surface a warning so the CLI can render it honestly.
    void projectPath;
    const supported = new Set(['WCAG2.2', 'ADA', 'GDPR']);
    const unsupported = standards.filter(s => !supported.has(s));
    const skipped = standards.filter(s => supported.has(s));

    if (unsupported.length > 0) {
      this.logger.warn(
        `[compliance] 暂不支持的合规标准: ${unsupported.join(', ')}`
      );
    }

    if (skipped.length === 0) {
      return undefined;
    }

    this.logger.warn(
      `[compliance] 合规检查需要专门的工具（如 axe-core），当前未实装。` +
        `已跳过: ${skipped.join(', ')}。请使用 a11y skill 做可访问性诊断。`
    );
    return undefined;
  }

  private async analyzeTrends(
    projectPath: string,
    currentScore: number
  ): Promise<TrendAnalysis | undefined> {
    // Look for historical reports
    const historyDir = path.join(projectPath, '.qa-agent', 'reports');

    try {
      const files = await fs.readdir(historyDir);
      const jsonReports = files
        .filter(f => f.startsWith('diagnose-') && f.endsWith('.json'))
        .sort();

      if (jsonReports.length === 0) {
        return undefined;
      }

      // 解析历史报告，顺便按时间窗口过滤
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const history: TrendAnalysis['history'] = [];

      for (const file of jsonReports) {
        try {
          const content = await fs.readFile(path.join(historyDir, file), 'utf-8');
          const report = JSON.parse(content);
          const ts = Date.parse(report.timestamp);
          if (!Number.isFinite(ts) || ts < cutoff) continue;
          history.push({
            date: report.timestamp,
            score: report.summary?.score ?? 0,
            issues: report.summary?.totalIssues ?? 0,
          });
        } catch {
          // Skip invalid reports
        }
      }

      if (history.length < 1) {
        return undefined;
      }

      // 上一次得分 = 最近一次历史报告
      const previousScore = history[history.length - 1].score;
      const change = currentScore - previousScore;

      let trend: 'improving' | 'stable' | 'declining';
      if (change > 5) trend = 'improving';
      else if (change < -5) trend = 'declining';
      else trend = 'stable';

      return {
        period: '30 days',
        previousScore,
        currentScore,
        change,
        trend,
        history,
      };
    } catch {
      return undefined;
    }
  }
}

export function createAuditEngine(logger: Logger): AuditEngine {
  return new AuditEngine(logger);
}
