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
  ComplianceRequirement,
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
    const results: ComplianceResult[] = [];

    for (const standard of standards) {
      switch (standard.toUpperCase()) {
        case 'WCAG':
        case 'WCAG2.1':
        case 'WCAG2.2':
          results.push(await this.checkWCAG(projectPath));
          break;
        case 'GDPR':
          results.push(await this.checkGDPR(projectPath));
          break;
        case 'SOC2':
        case 'SOC 2':
          results.push(await this.checkSOC2(projectPath));
          break;
        case 'OWASP':
          results.push(await this.checkOWASP(projectPath));
          break;
        default:
          this.logger.warn(`[compliance] 不支持的合规标准: ${standard}`);
          break;
      }
    }

    if (results.length === 0) {
      return undefined;
    }

    // If only one standard was requested, return that result directly
    if (results.length === 1) {
      return results[0];
    }

    // Aggregate multiple results
    const totalScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const allRequirements = results.flatMap(r => r.requirements);
    const hasNonCompliant = results.some(r => r.status === 'non-compliant');
    const allCompliant = results.every(r => r.status === 'compliant');

    return {
      standard: '多标准合规',
      version: '1.0',
      score: Math.round(totalScore),
      status: hasNonCompliant ? 'non-compliant' : allCompliant ? 'compliant' : 'partial',
      requirements: allRequirements,
    };
  }

  private async checkWCAG(projectPath: string): Promise<ComplianceResult> {
    const requirements: ComplianceRequirement[] = [];
    const htmlFiles = await this.findFiles(projectPath, /\.(html|htm|jsx|tsx)$/);

    // WCAG 1.3.1 - lang attribute on html element
    const langCheck = await this.checkLangAttributes(htmlFiles);
    requirements.push(langCheck);

    // WCAG 1.1.1 - alt attributes on images
    const altCheck = await this.checkAltAttributes(htmlFiles);
    requirements.push(altCheck);

    // WCAG 1.3.1 - form labels
    const labelCheck = await this.checkFormLabels(htmlFiles);
    requirements.push(labelCheck);

    // WCAG 2.4.1 - skip links
    const skipLinkCheck = await this.checkSkipLinks(htmlFiles);
    requirements.push(skipLinkCheck);

    const passed = requirements.filter(r => r.status === 'pass').length;
    const total = requirements.filter(r => r.status !== 'na').length;
    const score = total > 0 ? Math.round((passed / total) * 100) : 0;

    return {
      standard: 'WCAG 2.1',
      version: 'Level A',
      score,
      status: score >= 80 ? 'compliant' : score >= 50 ? 'partial' : 'non-compliant',
      requirements,
    };
  }

  private async checkLangAttributes(htmlFiles: string[]): Promise<ComplianceRequirement> {
    if (htmlFiles.length === 0) {
      return {
        id: 'wcag-lang',
        name: 'HTML lang 属性',
        status: 'na',
        description: '所有 HTML 页面应包含 lang 属性',
        evidence: '未找到 HTML 文件',
      };
    }

    let missing = 0;
    const missingFiles: string[] = [];

    for (const file of htmlFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        // Check for <html lang="..."> or <html ... lang="...">
        if (!/<html[\s\S]*?\blang\s*=\s*["'][^"']+["']/i.test(content)) {
          missing++;
          missingFiles.push(path.basename(file));
        }
      } catch {
        // Skip unreadable files
      }
    }

    return {
      id: 'wcag-lang',
      name: 'HTML lang 属性',
      status: missing === 0 ? 'pass' : 'fail',
      description: '所有 HTML 页面的 <html> 元素应包含 lang 属性以声明页面语言',
      evidence: missing === 0
        ? `全部 ${htmlFiles.length} 个 HTML 文件均包含 lang 属性`
        : `${missing} 个文件缺少 lang 属性: ${missingFiles.slice(0, 5).join(', ')}`,
    };
  }

  private async checkAltAttributes(htmlFiles: string[]): Promise<ComplianceRequirement> {
    if (htmlFiles.length === 0) {
      return {
        id: 'wcag-alt',
        name: '图片 alt 属性',
        status: 'na',
        description: '所有 img 元素应包含 alt 属性',
        evidence: '未找到 HTML 文件',
      };
    }

    let totalImages = 0;
    let imagesWithoutAlt = 0;
    const offendingFiles: string[] = [];

    for (const file of htmlFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        // Find all <img ...> tags (not self-closing or not)
        const imgMatches = content.match(/<img\b[^>]*>/gi) || [];
        totalImages += imgMatches.length;

        for (const imgTag of imgMatches) {
          // alt attribute is missing
          if (!/\balt\s*=/i.test(imgTag)) {
            imagesWithoutAlt++;
            if (!offendingFiles.includes(path.basename(file))) {
              offendingFiles.push(path.basename(file));
            }
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return {
      id: 'wcag-alt',
      name: '图片 alt 属性',
      status: imagesWithoutAlt === 0 ? 'pass' : totalImages === 0 ? 'na' : 'fail',
      description: '所有 <img> 元素应包含 alt 属性以提供替代文本',
      evidence: totalImages === 0
        ? '未找到任何图片元素'
        : imagesWithoutAlt === 0
          ? `全部 ${totalImages} 个图片元素均包含 alt 属性`
          : `${imagesWithoutAlt}/${totalImages} 个图片缺少 alt 属性，涉及文件: ${offendingFiles.slice(0, 5).join(', ')}`,
    };
  }

  private async checkFormLabels(htmlFiles: string[]): Promise<ComplianceRequirement> {
    if (htmlFiles.length === 0) {
      return {
        id: 'wcag-form-labels',
        name: '表单标签',
        status: 'na',
        description: '所有表单输入元素应有关联的 label',
        evidence: '未找到 HTML 文件',
      };
    }

    let totalInputs = 0;
    let unlabeledInputs = 0;
    const offendingFiles: string[] = [];

    for (const file of htmlFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');

        // Find all <input>, <select>, <textarea> elements (excluding type="hidden", type="submit", type="button")
        const inputMatches = content.match(/<(input|select|textarea)\b[^>]*>/gi) || [];

        for (const tag of inputMatches) {
          // Skip hidden, submit, button inputs
          if (/\btype\s*=\s*["'](?:hidden|submit|button)["']/i.test(tag)) {
            continue;
          }

          totalInputs++;

          // Check if it has id AND a corresponding <label for="...">
          const idMatch = tag.match(/\bid\s*=\s*["']([^"']+)["']/i);
          const ariaLabel = /\b(?:aria-label|aria-labelledby)\s*=/i.test(tag);
          const placeholder = /\bplaceholder\s*=/i.test(tag);

          if (ariaLabel || placeholder) {
            // aria-label or placeholder provides accessible name
            continue;
          }

          if (idMatch) {
            const inputId = idMatch[1];
            // Check if there's a label for this id in the file
            const labelRegex = new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*["']${this.escapeRegex(inputId)}["']`, 'i');
            if (!labelRegex.test(content)) {
              unlabeledInputs++;
              if (!offendingFiles.includes(path.basename(file))) {
                offendingFiles.push(path.basename(file));
              }
            }
          } else {
            // No id, no aria-label — likely unlabeled
            unlabeledInputs++;
            if (!offendingFiles.includes(path.basename(file))) {
              offendingFiles.push(path.basename(file));
            }
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return {
      id: 'wcag-form-labels',
      name: '表单标签',
      status: unlabeledInputs === 0 ? 'pass' : totalInputs === 0 ? 'na' : 'fail',
      description: '所有表单输入元素应有关联的 <label> 元素或 aria-label 属性',
      evidence: totalInputs === 0
        ? '未找到表单输入元素'
        : unlabeledInputs === 0
          ? `全部 ${totalInputs} 个表单输入元素均有关联标签`
          : `${unlabeledInputs}/${totalInputs} 个表单输入元素缺少标签，涉及文件: ${offendingFiles.slice(0, 5).join(', ')}`,
    };
  }

  private async checkSkipLinks(htmlFiles: string[]): Promise<ComplianceRequirement> {
    if (htmlFiles.length === 0) {
      return {
        id: 'wcag-skip-links',
        name: '跳过导航链接',
        status: 'na',
        description: '页面应包含跳过导航链接',
        evidence: '未找到 HTML 文件',
      };
    }

    let hasSkipLink = false;
    const checkedFiles: string[] = [];

    for (const file of htmlFiles) {
      checkedFiles.push(path.basename(file));
      try {
        const content = await fs.readFile(file, 'utf-8');
        // Look for skip-to-content, skip-nav, skip link patterns
        const skipLinkPatterns = [
          /skip\s*(to|link)/i,
          /skip-?nav/i,
          /skip-?content/i,
          /jump-?to-?main/i,
          /<a[^>]*href\s*=\s*["']#main/i,
          /<a[^>]*href\s*=\s*["']#content/i,
        ];

        for (const pattern of skipLinkPatterns) {
          if (pattern.test(content)) {
            hasSkipLink = true;
            break;
          }
        }
        if (hasSkipLink) break;
      } catch {
        // Skip unreadable files
      }
    }

    return {
      id: 'wcag-skip-links',
      name: '跳过导航链接',
      status: hasSkipLink ? 'pass' : 'fail',
      description: '页面应提供跳过重复导航的链接（WCAG 2.4.1）',
      evidence: hasSkipLink
        ? '在以下文件中发现跳过导航链接: ' + checkedFiles.slice(0, 3).join(', ')
        : `未在任何 HTML 文件中找到跳过导航链接，已检查: ${checkedFiles.slice(0, 5).join(', ')}`,
    };
  }

  private async checkGDPR(projectPath: string): Promise<ComplianceResult> {
    const requirements: ComplianceRequirement[] = [];
    const allFiles = await this.findFiles(projectPath, /\.(html|htm|jsx|tsx|ts|js|vue|svelte)$/);
    const configFiles = await this.findFiles(projectPath, /\.(json|yaml|yml|toml|env)$/);
    const allTextFiles = [...allFiles, ...configFiles];

    // GDPR - Cookie consent
    const cookieConsentCheck = await this.checkCookieConsent(allTextFiles);
    requirements.push(cookieConsentCheck);

    // GDPR - Privacy policy link
    const privacyPolicyCheck = await this.checkPrivacyPolicyLink(allTextFiles, projectPath);
    requirements.push(privacyPolicyCheck);

    // GDPR - Data collection notice
    const dataCollectionCheck = await this.checkDataCollectionNotice(allTextFiles);
    requirements.push(dataCollectionCheck);

    // GDPR - Consent management
    const consentManagementCheck = await this.checkConsentManagement(allTextFiles);
    requirements.push(consentManagementCheck);

    const passed = requirements.filter(r => r.status === 'pass').length;
    const total = requirements.filter(r => r.status !== 'na').length;
    const score = total > 0 ? Math.round((passed / total) * 100) : 0;

    return {
      standard: 'GDPR',
      version: '2016/679',
      score,
      status: score >= 75 ? 'compliant' : score >= 50 ? 'partial' : 'non-compliant',
      requirements,
    };
  }

  private async checkCookieConsent(files: string[]): Promise<ComplianceRequirement> {
    let found = false;
    const foundFiles: string[] = [];
    const cookiePatterns = [
      /cookie\s*consent/i,
      /consent\s*manager/i,
      /cookie\s*banner/i,
      /accept\s*cookies/i,
      /cookie\s*policy/i,
      /consent\s*modal/i,
      /useCookie/i,
      /CookieConsent/i,
      /Osano/i,
      /OneTrust/i,
      /consent/i,
    ];

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        for (const pattern of cookiePatterns) {
          if (pattern.test(content)) {
            found = true;
            foundFiles.push(path.basename(file));
            break;
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return {
      id: 'gdpr-cookie-consent',
      name: 'Cookie 同意机制',
      status: found ? 'pass' : 'fail',
      description: '网站应提供 Cookie 同意弹窗或横幅，让用户在接受 Cookie 前给予明确同意',
      evidence: found
        ? `在以下文件中检测到 Cookie 同意相关代码: ${foundFiles.slice(0, 5).join(', ')}`
        : '未找到 Cookie 同意机制相关代码',
    };
  }

  private async checkPrivacyPolicyLink(files: string[], projectPath: string): Promise<ComplianceRequirement> {
    let found = false;
    const foundFiles: string[] = [];
    const privacyPatterns = [
      /privacy\s*policy/i,
      /privacy\s*notice/i,
      /data\s*protection/i,
      /\/privacy/i,
      /\/privacy-policy/i,
      /privacyPage/i,
      /PrivacyPolicy/i,
      /datenschutz/i,
    ];

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        for (const pattern of privacyPatterns) {
          if (pattern.test(content)) {
            found = true;
            foundFiles.push(path.basename(file));
            break;
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    // Also check for a dedicated privacy policy file
    if (!found) {
      const privacyFiles = await this.findFiles(projectPath, /privacy/i);
      if (privacyFiles.length > 0) {
        found = true;
        foundFiles.push(...privacyFiles.map(f => path.basename(f)));
      }
    }

    return {
      id: 'gdpr-privacy-policy',
      name: '隐私政策链接',
      status: found ? 'pass' : 'fail',
      description: '应提供隐私政策链接，告知用户数据收集和处理方式',
      evidence: found
        ? `在以下文件中检测到隐私政策引用: ${foundFiles.slice(0, 5).join(', ')}`
        : '未找到隐私政策链接或页面',
    };
  }

  private async checkDataCollectionNotice(files: string[]): Promise<ComplianceRequirement> {
    let found = false;
    const foundFiles: string[] = [];
    const dataCollectionPatterns = [
      /we\s*collect/i,
      /personal\s*data/i,
      /personnel.*information/i,
      /data\s*processing/i,
      /information\s*we\s*collect/i,
      /collect\s*your\s*data/i,
      /purpose\s*of\s*processing/i,
      /legal\s*basis/i,
      /GDPR/i,
      /data\s*subject/i,
      /right\s*to\s*access/i,
      /right\s*to\s*erasure/i,
      /right\s*to\s*be\s*forgotten/i,
    ];

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        for (const pattern of dataCollectionPatterns) {
          if (pattern.test(content)) {
            found = true;
            foundFiles.push(path.basename(file));
            break;
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return {
      id: 'gdpr-data-collection',
      name: '数据收集告知',
      status: found ? 'pass' : 'fail',
      description: '应告知用户哪些数据被收集以及收集目的（GDPR 第 13、14 条）',
      evidence: found
        ? `在以下文件中检测到数据收集相关说明: ${foundFiles.slice(0, 5).join(', ')}`
        : '未找到数据收集告知相关文本（建议添加隐私声明）',
    };
  }

  private async checkConsentManagement(files: string[]): Promise<ComplianceRequirement> {
    let found = false;
    const foundFiles: string[] = [];
    const consentPatterns = [
      /consent/i,
      /opt[-\s]*out/i,
      /opt[-\s]*in/i,
      /withdraw\s*consent/i,
      /revoke\s*consent/i,
      /manage\s*preferences/i,
      /cookie\s*preferences/i,
      /consentGiven/i,
      /userConsent/i,
      /hasConsent/i,
    ];

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        for (const pattern of consentPatterns) {
          if (pattern.test(content)) {
            found = true;
            foundFiles.push(path.basename(file));
            break;
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return {
      id: 'gdpr-consent-management',
      name: '用户同意管理',
      status: found ? 'pass' : 'fail',
      description: '应允许用户管理和撤回数据收集同意（GDPR 第 7 条）',
      evidence: found
        ? `在以下文件中检测到同意管理相关代码: ${foundFiles.slice(0, 5).join(', ')}`
        : '未找到用户同意管理相关代码（建议实现同意管理功能）',
    };
  }

  private async checkSOC2(projectPath: string): Promise<ComplianceResult> {
    const requirements: ComplianceRequirement[] = [];
    const sourceFiles = await this.findFiles(projectPath, /\.(ts|tsx|js|jsx|py|go|java)$/);
    const configFiles = await this.findFiles(projectPath, /\.(json|yaml|yml|toml|env|conf)$/);
    const allFiles = [...sourceFiles, ...configFiles];

    // SOC 2 - Error handling
    const errorHandlingCheck = await this.checkErrorHandling(sourceFiles);
    requirements.push(errorHandlingCheck);

    // SOC 2 - Logging
    const loggingCheck = await this.checkLogging(sourceFiles);
    requirements.push(loggingCheck);

    // SOC 2 - Access control
    const accessControlCheck = await this.checkAccessControl(allFiles);
    requirements.push(accessControlCheck);

    // SOC 2 - Audit trail
    const auditTrailCheck = await this.checkAuditTrail(sourceFiles);
    requirements.push(auditTrailCheck);

    const passed = requirements.filter(r => r.status === 'pass').length;
    const total = requirements.filter(r => r.status !== 'na').length;
    const score = total > 0 ? Math.round((passed / total) * 100) : 0;

    return {
      standard: 'SOC 2',
      version: 'Type II',
      score,
      status: score >= 75 ? 'compliant' : score >= 50 ? 'partial' : 'non-compliant',
      requirements,
    };
  }

  private async checkErrorHandling(files: string[]): Promise<ComplianceRequirement> {
    let hasErrorHandling = false;
    const foundFiles: string[] = [];
    const errorHandlingPatterns = [
      /try\s*\{/,
      /catch\s*\(/,
      /\.catch\s*\(/,
      /throw\s+new\s+Error/i,
      /ErrorBoundary/i,
      /onError/i,
      /handleError/i,
      /errorHandler/i,
      /middleware.*error/i,
      /app\.use.*error/i,
    ];

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        let matchCount = 0;
        for (const pattern of errorHandlingPatterns) {
          const matches = content.match(pattern);
          if (matches) matchCount += matches.length;
        }
        if (matchCount >= 2) {
          hasErrorHandling = true;
          foundFiles.push(path.basename(file));
          if (foundFiles.length >= 5) break;
        }
      } catch {
        // Skip unreadable files
      }
    }

    return {
      id: 'soc2-error-handling',
      name: '错误处理机制',
      status: hasErrorHandling ? 'pass' : 'fail',
      description: '应用应有完善的错误处理机制（try-catch、错误边界、全局错误处理器）',
      evidence: hasErrorHandling
        ? `在以下文件中发现错误处理模式: ${foundFiles.join(', ')}`
        : '未找到充分的错误处理模式',
    };
  }

  private async checkLogging(files: string[]): Promise<ComplianceRequirement> {
    let hasLogging = false;
    const foundFiles: string[] = [];
    const loggingPatterns = [
      /logger\./i,
      /console\.(log|error|warn|info|debug)\(/i,
      /winston/i,
      /bunyan/i,
      /pino/i,
      /log4j/i,
      /logging\./i,
      /\.log\(/i,
      /log4js/i,
      /morgan/i,
      /audit.*log/i,
      /activity.*log/i,
    ];

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        let matchCount = 0;
        for (const pattern of loggingPatterns) {
          const matches = content.match(pattern);
          if (matches) matchCount += matches.length;
        }
        if (matchCount >= 2) {
          hasLogging = true;
          foundFiles.push(path.basename(file));
          if (foundFiles.length >= 5) break;
        }
      } catch {
        // Skip unreadable files
      }
    }

    return {
      id: 'soc2-logging',
      name: '日志记录',
      status: hasLogging ? 'pass' : 'fail',
      description: '应用应记录关键操作日志以便审计和故障排查',
      evidence: hasLogging
        ? `在以下文件中发现日志记录: ${foundFiles.join(', ')}`
        : '未找到充分的日志记录模式',
    };
  }

  private async checkAccessControl(files: string[]): Promise<ComplianceRequirement> {
    let hasAccessControl = false;
    const foundFiles: string[] = [];
    const accessControlPatterns = [
      /auth/i,
      /middleware.*auth/i,
      /authorize/i,
      /isAuthenticated/i,
      /hasPermission/i,
      /role.*check/i,
      /requireAuth/i,
      /guard/i,
      /canAccess/i,
      /AccessControl/i,
      /RBAC/i,
      /ABAC/i,
      /permission.*middleware/i,
      /jwt.*verify/i,
      /session.*check/i,
      /csrf/i,
      /rateLimit/i,
      /rate.*limit/i,
    ];

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        let matchCount = 0;
        for (const pattern of accessControlPatterns) {
          const matches = content.match(pattern);
          if (matches) matchCount += matches.length;
        }
        if (matchCount >= 2) {
          hasAccessControl = true;
          foundFiles.push(path.basename(file));
          if (foundFiles.length >= 5) break;
        }
      } catch {
        // Skip unreadable files
      }
    }

    return {
      id: 'soc2-access-control',
      name: '访问控制',
      status: hasAccessControl ? 'pass' : 'fail',
      description: '应实施访问控制机制（认证中间件、权限检查、速率限制等）',
      evidence: hasAccessControl
        ? `在以下文件中发现访问控制模式: ${foundFiles.join(', ')}`
        : '未找到充分的访问控制模式',
    };
  }

  private async checkAuditTrail(files: string[]): Promise<ComplianceRequirement> {
    let hasAuditTrail = false;
    const foundFiles: string[] = [];
    const auditPatterns = [
      /audit/i,
      /audit.*log/i,
      /audit.*trail/i,
      /activity.*log/i,
      /event.*log/i,
      /change.*log/i,
      /track.*change/i,
      /log.*action/i,
      /record.*event/i,
      /history.*table/i,
    ];

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        for (const pattern of auditPatterns) {
          if (pattern.test(content)) {
            hasAuditTrail = true;
            foundFiles.push(path.basename(file));
            break;
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return {
      id: 'soc2-audit-trail',
      name: '审计追踪',
      status: hasAuditTrail ? 'pass' : 'fail',
      description: '应维护审计追踪记录关键操作和变更（SOC 2 CC7.2）',
      evidence: hasAuditTrail
        ? `在以下文件中发现审计追踪相关代码: ${foundFiles.slice(0, 5).join(', ')}`
        : '未找到审计追踪相关代码（建议实现操作日志记录）',
    };
  }

  private async checkOWASP(projectPath: string): Promise<ComplianceResult> {
    const requirements: ComplianceRequirement[] = [];
    const configFiles = await this.findFiles(projectPath, /\.(json|yaml|yml|toml|env|conf|nginx|htaccess|js|ts)$/);
    const allFiles = await this.findFiles(projectPath, /\.(html|htm|jsx|tsx|ts|js|vue|svelte|py|go|java|rb|php)$/);

    // OWASP - Content Security Policy
    const cspCheck = await this.checkSecurityHeader('CSP', configFiles, allFiles, [
      /content[-\s]*security[-\s]*policy/i,
      /Content-Security-Policy/i,
      /csp/i,
      /"csp"/i,
      /'csp'/i,
      /helmet.*csp/i,
      /csp.*header/i,
      /meta.*http-equiv.*Content-Security-Policy/i,
    ]);
    requirements.push(cspCheck);

    // OWASP - X-Frame-Options
    const xfoCheck = await this.checkSecurityHeader('X-Frame-Options', configFiles, allFiles, [
      /X-Frame-Options/i,
      /xframe/i,
      /SAMEORIGIN/i,
      /DENY.*frame/i,
      /frame-ancestors/i,
      /frameguard/i,
    ]);
    requirements.push(xfoCheck);

    // OWASP - X-Content-Type-Options
    const xctoCheck = await this.checkSecurityHeader('X-Content-Type-Options', configFiles, allFiles, [
      /X-Content-Type-Options/i,
      /xcontenttype/i,
      /nosniff/i,
    ]);
    requirements.push(xctoCheck);

    // OWASP - Strict-Transport-Security (HSTS)
    const hstsCheck = await this.checkSecurityHeader('HSTS', configFiles, allFiles, [
      /Strict-Transport-Security/i,
      /hsts/i,
      /max-age.*seconds/i,
      /https.*redirect/i,
      /forceHttps/i,
      /forceSSL/i,
      /sslRedirect/i,
    ]);
    requirements.push(hstsCheck);

    // OWASP - XSS Protection
    const xssCheck = await this.checkSecurityHeader('XSS Protection', configFiles, allFiles, [
      /X-XSS-Protection/i,
      /xxss/i,
      /xss.*protection/i,
      /sanitize/i,
      /DOMPurify/i,
      /escapeHtml/i,
      /escape.*html/i,
      /html.*escape/i,
    ]);
    requirements.push(xssCheck);

    // OWASP - Referrer Policy
    const referrerCheck = await this.checkSecurityHeader('Referrer Policy', configFiles, allFiles, [
      /Referrer-Policy/i,
      /referrer.*policy/i,
      /referrerPolicy/i,
    ]);
    requirements.push(referrerCheck);

    const passed = requirements.filter(r => r.status === 'pass').length;
    const total = requirements.filter(r => r.status !== 'na').length;
    const score = total > 0 ? Math.round((passed / total) * 100) : 0;

    return {
      standard: 'OWASP',
      version: '2021',
      score,
      status: score >= 70 ? 'compliant' : score >= 40 ? 'partial' : 'non-compliant',
      requirements,
    };
  }

  private async checkSecurityHeader(
    headerName: string,
    configFiles: string[],
    allFiles: string[],
    patterns: RegExp[]
  ): Promise<ComplianceRequirement> {
    let found = false;
    const foundFiles: string[] = [];
    const filesToCheck = configFiles.length > 0 ? configFiles : allFiles;

    for (const file of filesToCheck) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        for (const pattern of patterns) {
          if (pattern.test(content)) {
            found = true;
            foundFiles.push(path.basename(file));
            break;
          }
        }
        if (found && foundFiles.length >= 5) break;
      } catch {
        // Skip unreadable files
      }
    }

    return {
      id: `owasp-${headerName.toLowerCase().replace(/[\s-]/g, '-')}`,
      name: `${headerName} 安全头`,
      status: found ? 'pass' : 'fail',
      description: `应配置 ${headerName} 安全头以防范相关攻击`,
      evidence: found
        ? `在以下文件中发现 ${headerName} 相关配置: ${foundFiles.slice(0, 5).join(', ')}`
        : `未找到 ${headerName} 安全头配置`,
    };
  }

  private async findFiles(projectPath: string, pattern: RegExp | string): Promise<string[]> {
    const results: string[] = [];
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    const walk = async (dir: string) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.isFile() && regex.test(entry.name)) {
            results.push(fullPath);
          }
        }
      } catch {
        // Skip unreadable directories
      }
    };

    await walk(projectPath);
    return results;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
