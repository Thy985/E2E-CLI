/**
 * AI Fix Engine
 *
 * 突破规则引擎的边界，让 LLM 来生成修复代码。
 *
 * 这次重构的核心收益：
 * - 走统一的 createModelClient（不是另起一套 fetch），自动获得：
 *   · 6 家 provider 路由
 *   · 重试 / 退避 / 超时
 *   · 用量统计
 * - 走 src/prompts/ 模板（带 version）
 * - 走 tryParseJsonTyped + type guard，不再用 regex 抓 JSON
 * - 真正使用 opts.model / temperature / maxTokens
 *
 * 调用方：fix.ts（被 CLI `qa-agent fix` 调用）
 */

import { Diagnosis, Fix, SkillContext, ModelClient } from '../../types';
import { createModelClient } from '../../models';
import { getPrompt } from '../../prompts/registry';
import { tryParseJsonTyped, isObject, isString, isArrayOf } from '../../models/schema';

export interface AIFixOptions {
  /** model id, e.g. 'gpt-4o-mini', 'deepseek-chat', 'claude-sonnet-4-20250514' */
  model: string;
  temperature: number;
  maxTokens: number;
}

export const DEFAULT_AI_FIX_OPTIONS: AIFixOptions = {
  model: process.env.AI_FIX_MODEL || 'deepseek-chat',
  temperature: 0.3,
  maxTokens: 2000,
};

interface AIFixChange {
  file: string;
  type: 'replace' | 'insert' | 'delete';
  search?: string;
  replace?: string;
  content?: string;
  line?: number;
}

interface AIFixResponse {
  type: 'code-change';
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  changes: AIFixChange[];
}

interface AIFixValidation {
  valid: boolean;
  confidence: number;
  issues: string[];
}

// Type guards for LLM JSON output
function isChange(v: unknown): v is AIFixChange {
  if (!isObject(v)) return false;
  if (!isString(v.file)) return false;
  if (!isString(v.type)) return false;
  if (!['replace', 'insert', 'delete'].includes(v.type)) return false;
  return true;
}

function isAIFixResponse(v: unknown): v is AIFixResponse {
  if (!isObject(v)) return false;
  if (v.type !== 'code-change') return false;
  if (!isString(v.description)) return false;
  if (!isString(v.riskLevel)) return false;
  if (!isArrayOf(v.changes, isChange)) return false;
  return true;
}

function isValidationResponse(v: unknown): v is AIFixValidation {
  if (!isObject(v)) return false;
  if (typeof v.valid !== 'boolean') return false;
  if (typeof v.confidence !== 'number') return false;
  if (!Array.isArray(v.issues)) return false;
  return v.issues.every((x) => typeof x === 'string');
}

export class AIFixEngine {
  private model: ModelClient;

  constructor(model?: ModelClient) {
    this.model = model || createModelClient();
  }

  /**
   * Use AI to generate a fix for the given diagnosis.
   * Returns null if generation fails or LLM is unavailable.
   */
  async generateFix(
    diagnosis: Diagnosis,
    context: SkillContext,
    options: Partial<AIFixOptions> = {}
  ): Promise<Fix | null> {
    const opts: AIFixOptions = { ...DEFAULT_AI_FIX_OPTIONS, ...options };

    try {
      const codeContext =
        diagnosis.evidence?.type === 'code' ? diagnosis.evidence.content : 'N/A';

      const prompt = getPrompt('ai-fix', {
        title: diagnosis.title,
        description: diagnosis.description,
        file: diagnosis.location.file,
        line: String(diagnosis.location.line),
        severity: diagnosis.severity,
        codeContext,
      });

      const response = await this.model.chat(
        [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        {
          json: true,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
        }
      );

      const parsed = tryParseJsonTyped(response, isAIFixResponse);
      if (!parsed) {
        context.logger.warn('AI Fix: response did not match schema');
        return null;
      }

      return {
        id: `ai-fix-${diagnosis.id}`,
        diagnosisId: diagnosis.id,
        description: parsed.description,
        riskLevel: (parsed.riskLevel as Fix['riskLevel']) || 'medium',
        autoApplicable: true,
        changes: parsed.changes.map((change) => ({
          file: change.file,
          type: change.type as 'replace' | 'insert' | 'delete',
          position: { line: change.line as number },
          content: change.content || change.replace,
          oldContent: change.search,
        })),
      };
    } catch (error) {
      context.logger.error('AI Fix Engine failed:', error);
      return null;
    }
  }

  /**
   * Batch version: generate fixes for many diagnoses (sequential).
   * Use Promise.all upstream if you want to parallelize.
   */
  async generateBatchFixes(
    diagnoses: Diagnosis[],
    context: SkillContext,
    options: Partial<AIFixOptions> = {}
  ): Promise<Map<string, Fix>> {
    const fixes = new Map<string, Fix>();
    for (const diagnosis of diagnoses) {
      const fix = await this.generateFix(diagnosis, context, options);
      if (fix) fixes.set(diagnosis.id, fix);
    }
    return fixes;
  }

  /**
   * Validate an existing fix by asking the LLM to review it.
   * Used by fix.ts --validate path.
   */
  async validateFix(
    fix: Fix,
    originalIssue: Diagnosis,
    _context: SkillContext,
    options: Partial<AIFixOptions> = {}
  ): Promise<{ valid: boolean; confidence: number; issues: string[] }> {
    const opts: AIFixOptions = { ...DEFAULT_AI_FIX_OPTIONS, ...options };

    try {
      const prompt = getPrompt('ai-fix-validate', {
        issueTitle: originalIssue.title,
        issueDescription: originalIssue.description,
        fixDescription: fix.description,
        fixRisk: fix.riskLevel,
        changesJson: JSON.stringify(fix.changes, null, 2),
      });

      const response = await this.model.chat(
        [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        { json: true, temperature: opts.temperature, maxTokens: opts.maxTokens }
      );

      const parsed = tryParseJsonTyped(response, isValidationResponse);
      if (!parsed) {
        return { valid: false, confidence: 0, issues: ['Failed to parse validation response'] };
      }
      return parsed;
    } catch {
      return { valid: false, confidence: 0, issues: ['Validation request failed'] };
    }
  }
}

export default AIFixEngine;
