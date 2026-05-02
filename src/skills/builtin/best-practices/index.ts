/**
 * Best Practices Skill
 * 
 * 检查前端最佳实践问题：
 * 1. HTML 语义化
 * 2. CSS 最佳实践
 * 3. 图片优化
 * 4. 性能优化
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseSkill } from '../../base-skill';
import {
  SkillContext,
  Diagnosis,
  Severity,
  Fix,
} from '../../../types';
import { HTMLChecker } from './checkers/html-checker';
import { CSSChecker } from './checkers/css-checker';
import { ImageChecker } from './checkers/image-checker';
import { PerformanceChecker } from './checkers/performance-checker';
import { HTMLFixGenerator } from './fixers/html-fix-generator';
import { CSSFixGenerator } from './fixers/css-fix-generator';
import { ImageFixGenerator } from './fixers/image-fix-generator';
import { PerformanceFixGenerator } from './fixers/performance-fix-generator';
import { AIFixEngine } from '../../../engines/ai-fix';

export class BestPracticesSkill extends BaseSkill {
  name = 'best-practices';
  version = '1.0.0';
  description = 'Frontend best practices checker';

  triggers = [
    { type: 'command', pattern: 'best-practices', priority: 100 },
    { type: 'keyword', pattern: /best.?practice|semantic|optimize|performance/i, priority: 80 },
    { type: 'file', pattern: /\.(html|htm|css|scss|less|tsx|jsx|vue)$/i, priority: 60 },
  ];

  capabilities = [
    { name: 'html-semantic', description: 'HTML semantic check', autoFixable: true, riskLevel: 'low' },
    { name: 'css-best-practices', description: 'CSS best practices', autoFixable: true, riskLevel: 'low' },
    { name: 'image-optimization', description: 'Image optimization', autoFixable: true, riskLevel: 'low' },
    { name: 'performance', description: 'Performance optimization', autoFixable: true, riskLevel: 'medium' },
    { name: 'ai-assisted-fix', description: 'AI-assisted fix for complex issues', autoFixable: true, riskLevel: 'medium' },
  ];

  private htmlChecker: HTMLChecker;
  private cssChecker: CSSChecker;
  private imageChecker: ImageChecker;
  private performanceChecker: PerformanceChecker;
  private htmlFixGenerator: HTMLFixGenerator;
  private cssFixGenerator: CSSFixGenerator;
  private imageFixGenerator: ImageFixGenerator;
  private performanceFixGenerator: PerformanceFixGenerator;
  private aiFixEngine?: AIFixEngine;

  constructor() {
    super();
    this.htmlChecker = new HTMLChecker();
    this.cssChecker = new CSSChecker();
    this.imageChecker = new ImageChecker();
    this.performanceChecker = new PerformanceChecker();
    this.htmlFixGenerator = new HTMLFixGenerator();
    this.cssFixGenerator = new CSSFixGenerator();
    this.imageFixGenerator = new ImageFixGenerator();
    this.performanceFixGenerator = new PerformanceFixGenerator();
    
    // 初始化 AI 修复引擎
    this.aiFixEngine = new AIFixEngine();
  }

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];
    const { project, config } = context;

    // HTML 语义化检查
    context.logger.info('Checking HTML semantics...');
    const htmlIssues = await this.htmlChecker.check(project.rootPath);
    issues.push(...htmlIssues);

    // CSS 最佳实践检查
    context.logger.info('Checking CSS best practices...');
    const cssIssues = await this.cssChecker.check(project.rootPath);
    issues.push(...cssIssues);

    // 图片优化检查
    context.logger.info('Checking image optimization...');
    const imageIssues = await this.imageChecker.check(project.rootPath);
    issues.push(...imageIssues);

    // 性能优化检查
    context.logger.info('Checking performance...');
    const perfIssues = await this.performanceChecker.check(project.rootPath);
    issues.push(...perfIssues);

    return issues;
  }

  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    const { project } = context;

    // 首先尝试规则引擎修复
    switch (diagnosis.metadata?.category) {
      case 'html':
        return await this.htmlFixGenerator.generateFix(diagnosis, project.rootPath);
      
      case 'css':
        return await this.cssFixGenerator.generateFix(diagnosis, project.rootPath);
      
      case 'image':
        return await this.imageFixGenerator.generateFix(diagnosis, project.rootPath);
      
      case 'performance':
        return await this.performanceFixGenerator.generateFix(diagnosis, project.rootPath);
      
      default:
        // 规则引擎无法修复，尝试 AI 修复
        const aiFix = await this.aiFixEngine?.generateFix(diagnosis, context);
        if (aiFix) {
          return aiFix;
        }
        throw new Error(`Unsupported fix category: ${diagnosis.metadata?.category}`);
    }
  }

  canAutoFix(diagnosis: Diagnosis): boolean {
    // 规则引擎可修复的问题
    const ruleBasedTypes = [
      'missing-lang', 'missing-viewport', 'missing-title', 'missing-alt', 
      'missing-label', 'external-link-security', 'empty-rule', 'at-import',
      'missing-dimensions', 'missing-lazy-loading', 'legacy-format',
      'render-blocking', 'dom-in-loop', 'function-in-loop', 
      'event-listener-leak', 'timer-leak',
    ];
    
    if (ruleBasedTypes.includes(diagnosis.metadata?.type)) {
      return true;
    }
    
    // AI 引擎可尝试修复其他问题
    if (this.aiFixEngine && diagnosis.severity !== 'critical') {
      return true;
    }
    
    return false;
  }
}

export default BestPracticesSkill;
