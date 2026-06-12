/**
 * AI Fix Engine
 *
 * 使用 LLM 生成智能修复代码
 * 突破规则引擎的66%限制
 */

import { Diagnosis, Fix, SkillContext, ModelClient, ModelMessage } from '../../types';
import { createModelClient, createMockModelClient } from '../../models';
import type { ModelConfig } from '../../models';

export interface AIFixOptions {
  modelConfig?: Partial<ModelConfig>;
  modelClient?: ModelClient;
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
}

/**
 * 从 LLM 响应中鲁棒地提取 JSON。
 * 处理以下情况：
 * - Markdown 代码块 (```json ... ```)
 * - 嵌套大括号
 * - 回退到贪婪匹配
 */
function extractJSON(response: string): string | null {
  // 1) 优先匹配 markdown code block
  const codeBlockRegex = /```(?:json)?\s*\n([\s\S]*?)\n\s*```/;
  const codeBlockMatch = response.match(codeBlockRegex);
  if (codeBlockMatch) {
    const inner = codeBlockMatch[1].trim();
    // 验证是合法 JSON
    try {
      JSON.parse(inner);
      return inner;
    } catch {
      // code block 内容不是 JSON，继续尝试其他方式
    }
  }

  // 2) 平衡括号匹配：找到最外层 { ... } 配对
  const firstBrace = response.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = firstBrace; i < response.length; i++) {
      const ch = response[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (ch === '\\' && inString) {
        escapeNext = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (ch === '{') depth++;
      if (ch === '}') depth--;

      if (depth === 0) {
        const candidate = response.slice(firstBrace, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          // 不是合法 JSON，继续
        }
        // 找到配对但解析失败，跳出（避免无限循环）
        break;
      }
    }
  }

  // 3) 兜底：旧版贪婪正则（保留向后兼容）
  const greedyMatch = response.match(/\{[\s\S]*\}/);
  if (greedyMatch) {
    try {
      JSON.parse(greedyMatch[0]);
      return greedyMatch[0];
    } catch {
      // not valid JSON
    }
  }

  return null;
}

export class AIFixEngine {
  private modelClient: ModelClient;
  private maxRetries: number;

  constructor(options?: AIFixOptions) {
    this.modelClient =
      options?.modelClient ||
      createModelClient(options?.modelConfig) ||
      createMockModelClient();
    this.maxRetries = options?.maxRetries ?? 3;
  }

  /**
   * 使用 AI 生成修复
   */
  async generateFix(
    diagnosis: Diagnosis,
    context: SkillContext
  ): Promise<Fix | null> {
    try {
      // 构建 prompt
      const prompt = await this.buildPrompt(diagnosis, context);

      // 调用 LLM（带重试）
      const response = await this.callLLMWithRetry(prompt);

      // 解析响应
      const fix = this.parseResponse(response, diagnosis);

      return fix;
    } catch (error) {
      context.logger.error('AI Fix Engine failed:', error);
      return null;
    }
  }

  /**
   * 批量生成修复
   */
  async generateBatchFixes(
    diagnoses: Diagnosis[],
    context: SkillContext
  ): Promise<Map<string, Fix>> {
    const fixes = new Map<string, Fix>();

    for (const diagnosis of diagnoses) {
      const fix = await this.generateFix(diagnosis, context);
      if (fix) {
        fixes.set(diagnosis.id, fix);
      }
    }

    return fixes;
  }

  /**
   * 验证修复质量
   */
  async validateFix(
    fix: Fix,
    originalIssue: Diagnosis,
    _context: SkillContext
  ): Promise<{ valid: boolean; confidence: number; issues: string[] }> {
    const prompt = this.buildValidationPrompt(fix, originalIssue);
    const response = await this.callLLMWithRetry(prompt);

    return this.parseValidationResponse(response);
  }

  // 私有方法

  /**
   * 构建 prompt，当 evidence 缺失时回退到读取实际文件内容
   */
  private async buildPrompt(
    diagnosis: Diagnosis,
    context: SkillContext
  ): Promise<string> {
    let codeContext = 'N/A';

    if (diagnosis.evidence?.type === 'code' && diagnosis.evidence.content) {
      codeContext = diagnosis.evidence.content;
    } else {
      // 回退：尝试从文件系统读取实际文件内容
      try {
        const filePath = diagnosis.location.file;
        if (filePath && context.tools?.fs) {
          const fileContent = await context.tools.fs.readFile(filePath);
          if (fileContent) {
            // 如果有行号信息，只取相关行附近的上下文
            const targetLine = diagnosis.location.line;
            if (targetLine) {
              const lines = fileContent.split('\n');
              const start = Math.max(0, targetLine - 10);
              const end = Math.min(lines.length, targetLine + 10);
              codeContext = lines.slice(start, end).join('\n');
              codeContext = `[Lines ${start + 1}-${end} of ${filePath}]\n${codeContext}`;
            } else {
              codeContext = `[Full content of ${filePath}]\n${fileContent}`;
            }
          }
        }
      } catch (readError) {
        context.logger.debug(
          `Failed to read file ${diagnosis.location.file}: ${readError}`
        );
      }
    }

    return `
You are an expert frontend developer. Fix the following issue:

Issue: ${diagnosis.title}
Description: ${diagnosis.description}
File: ${diagnosis.location.file}
Line: ${diagnosis.location.line}

Code Context:
${codeContext}

Generate a fix in the following JSON format:
{
  "type": "code-change",
  "description": "Brief description of the fix",
  "riskLevel": "low|medium|high",
  "changes": [
    {
      "file": "path/to/file",
      "type": "replace|insert|delete",
      "search": "text to search (for replace)",
      "replace": "replacement text (for replace)",
      "content": "content to insert (for insert)",
      "line": line_number
    }
  ]
}

Important:
1. Only output valid JSON
2. Ensure the fix is syntactically correct
3. Consider edge cases
4. Maintain code style consistency
`;
  }

  private buildValidationPrompt(fix: Fix, originalIssue: Diagnosis): string {
    return `
Validate the following code fix:

Original Issue: ${originalIssue.title}
Fix Description: ${fix.description}

Changes:
${JSON.stringify(fix.changes, null, 2)}

Evaluate:
1. Does the fix correctly address the issue?
2. Is the code syntactically correct?
3. Are there any potential side effects?
4. Is the risk level appropriate?

Output in JSON format:
{
  "valid": true|false,
  "confidence": 0-100,
  "issues": ["list of concerns if any"]
}
`;
  }

  /**
   * 带指数退避重试的 LLM 调用
   */
  private async callLLMWithRetry(prompt: string): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.callLLM(prompt);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries) {
          const delayMs = Math.min(1000 * 2 ** (attempt - 1), 5000);
          // exponential backoff, capped at 5s
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError || new Error('LLM call failed after retries');
  }

  private async callLLM(prompt: string): Promise<string> {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'You are a code fixing assistant.' },
      { role: 'user', content: prompt },
    ];

    const response = await this.modelClient.chat(messages);
    return response.content;
  }

  private parseResponse(response: string, diagnosis: Diagnosis): Fix | null {
    try {
      const jsonStr = extractJSON(response);
      if (!jsonStr) {
        return null;
      }

      const parsed = JSON.parse(jsonStr);

      return {
        id: `ai-fix-${diagnosis.id}`,
        diagnosisId: diagnosis.id,
        description: parsed.description,
        riskLevel: parsed.riskLevel || 'medium',
        autoApplicable: true,
        changes: (parsed.changes || []).map((change: any) => ({
          file: change.file,
          type: change.type,
          position: { line: change.line },
          content: change.content || change.replace,
          oldContent: change.search,
        })),
      };
    } catch {
      return null;
    }
  }

  private parseValidationResponse(
    response: string
  ): { valid: boolean; confidence: number; issues: string[] } {
    try {
      const jsonStr = extractJSON(response);
      if (!jsonStr) {
        return { valid: false, confidence: 0, issues: ['Failed to parse validation response'] };
      }

      const parsed = JSON.parse(jsonStr);
      return {
        valid: parsed.valid,
        confidence: parsed.confidence,
        issues: parsed.issues || [],
      };
    } catch {
      return { valid: false, confidence: 0, issues: ['Parse error'] };
    }
  }
}

export default AIFixEngine;
