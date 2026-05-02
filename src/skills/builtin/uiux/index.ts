/**
 * UI/UX Audit Skill
 * 
 * 核心功能：
 * 1. 设计令牌提取（从CSS/SCSS/Tailwind/Figma）
 * 2. 视觉规范检查（颜色、字体、间距、圆角、阴影）
 * 3. 布局对齐检查（对齐、网格、响应式）
 * 4. 交互状态检查（hover/active/focus/loading）
 * 5. 智能修复生成
 */

import { BaseSkill } from '../../base-skill';
import {
  SkillContext,
  Diagnosis,
  DiagnosisType,
  Severity,
  Fix,
  FixType,
  SkillTrigger,
  SkillCapability,
} from '../../../types';
import { DesignTokenExtractor } from './design-token-extractor';
import { VisualChecker } from './checkers/visual-checker';
import { LayoutChecker } from './checkers/layout-checker';
import { InteractionChecker } from './checkers/interaction-checker';
import { CSSFixGenerator } from './fixers/css-fix-generator';

export class UIUXSkill extends BaseSkill {
  name = 'uiux-audit';
  version = '1.0.0';
  description = 'UI/UX视觉规范审查与修复';
  
  triggers: SkillTrigger[] = [
    { type: 'command', pattern: 'ux-audit', priority: 100 },
    { type: 'keyword', pattern: /ui|ux|视觉|设计|样式|css|style/i, priority: 80 },
    { type: 'file', pattern: /\.(css|scss|less|tsx|jsx|vue|html)$/i, priority: 60 },
  ];
  
  capabilities: SkillCapability[] = [
    { name: 'design-token-extract', description: '提取设计令牌', autoFixable: false, riskLevel: 'low' },
    { name: 'visual-check', description: '视觉规范检查', autoFixable: true, riskLevel: 'low' },
    { name: 'layout-check', description: '布局对齐检查', autoFixable: false, riskLevel: 'medium' },
    { name: 'interaction-check', description: '交互状态检查', autoFixable: true, riskLevel: 'low' },
  ];

  private designTokenExtractor: DesignTokenExtractor;
  private visualChecker: VisualChecker;
  private layoutChecker: LayoutChecker;
  private interactionChecker: InteractionChecker;
  private cssFixGenerator: CSSFixGenerator;

  constructor() {
    super();
    this.designTokenExtractor = new DesignTokenExtractor();
    this.visualChecker = new VisualChecker();
    this.layoutChecker = new LayoutChecker();
    this.interactionChecker = new InteractionChecker();
    this.cssFixGenerator = new CSSFixGenerator();
  }

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];
    const { project, config } = context;

    // Phase 1: 提取设计令牌
    context.logger.info('🔍 正在提取设计令牌...');
    const designTokens = await this.designTokenExtractor.extract(project.rootPath, config);
    context.logger.info(`✓ 提取到 ${Object.keys(designTokens.colors || {}).length} 个颜色令牌`);

    // Phase 2: 视觉规范检查
    context.logger.info('🔍 正在检查视觉规范...');
    const visualIssues = await this.visualChecker.check(project.rootPath, designTokens, config);
    issues.push(...visualIssues);

    // Phase 3: 布局对齐检查
    context.logger.info('🔍 正在检查布局对齐...');
    const layoutIssues = await this.layoutChecker.check(project.rootPath, designTokens, config);
    issues.push(...layoutIssues);

    // Phase 4: 交互状态检查
    context.logger.info('🔍 正在检查交互状态...');
    const interactionIssues = await this.interactionChecker.check(project.rootPath, config);
    issues.push(...interactionIssues);

    return issues;
  }

  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    const { project, config } = context;

    // 根据问题类型选择修复策略
    switch (diagnosis.metadata?.category) {
      case 'visual':
        return await this.cssFixGenerator.generateVisualFix(diagnosis, project.rootPath);
      
      case 'interaction':
        return await this.cssFixGenerator.generateInteractionFix(diagnosis, project.rootPath);
      
      default:
        throw new Error(`不支持自动修复的问题类型: ${diagnosis.metadata?.category}`);
    }
  }

  canAutoFix(diagnosis: Diagnosis): boolean {
    // 低风险问题自动修复
    if (diagnosis.severity === 'info') return true;
    
    // 视觉规范问题自动修复
    if (diagnosis.metadata?.category === 'visual') {
      const autoFixableTypes = ['color-mismatch', 'spacing-inconsistent', 'border-radius-mismatch'];
      return autoFixableTypes.includes(diagnosis.metadata?.type);
    }
    
    // 交互状态问题自动修复
    if (diagnosis.metadata?.category === 'interaction') {
      return diagnosis.metadata?.type === 'missing-hover-state';
    }
    
    return false;
  }
}

export default UIUXSkill;
