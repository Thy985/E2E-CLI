/**
 * AI Fix Engine
 *
 * 使用 LLM 生成智能修复代码
 * 突破规则引擎的66%限制
 */

import { Diagnosis, Fix, FileChange, SkillContext } from '../../types';

export interface AIFixOptions {
  model: string;
  temperature: number;
  maxTokens: number;
}

/**
 * LLM 输出的 JSON 形状（不是我们内部的 FileChange）。
 * 内部 FileChange 把 search/replace 折成 oldContent/content；这里只接受 LLM 的原始字段。
 */
interface LLMSuggestedChange {
  file: string;
  type: 'insert' | 'delete' | 'replace';
  line?: number;
  content?: string;
  replace?: string;
  search?: string;
}

interface LLMFixPayload {
  description?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  changes?: LLMSuggestedChange[];
}

interface LLMValidationPayload {
  valid?: boolean;
  confidence?: number;
  issues?: string[];
}

/**
 * 提取 LLM 响应中的 JSON 块。优先 ```json fence，否则匹配最外层平衡 brace。
 * 旧版用 /\{[\s\S]*\}/ 会取到第一个 `{...}` 片段，对 LLM 在解释里夹带 `{}` 的输出是错误的。
 */
function extractFirstJSONObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  let depth = 0;
  let inString = false;
  let escape = false;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') {
      if (start === -1) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function mapSuggestedChange(change: LLMSuggestedChange): FileChange {
  return {
    file: change.file,
    type: change.type,
    position: typeof change.line === 'number' ? { line: change.line } : undefined,
    content: change.content ?? change.replace,
    oldContent: change.search,
  };
}

export class AIFixEngine {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || 'dummy-key';
    this.baseUrl = process.env.LLM_BASE_URL || 'http://localhost:20000/v1';
  }

  /**
   * 使用 AI 生成修复
   */
  async generateFix(
    diagnosis: Diagnosis,
    context: SkillContext
  ): Promise<Fix | null> {
    if (!this.apiKey) {
      context.logger.warn('AI Fix Engine: No API key configured');
      return null;
    }

    try {
      // 构建 prompt
      const prompt = this.buildPrompt(diagnosis, context);

      // 调用 LLM
      const response = await this.callLLM(prompt);

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
    context: SkillContext
  ): Promise<{ valid: boolean; confidence: number; issues: string[] }> {
    const prompt = this.buildValidationPrompt(fix, originalIssue);
    const response = await this.callLLM(prompt);

    return this.parseValidationResponse(response);
  }

  // 私有方法

  private buildPrompt(diagnosis: Diagnosis, context: SkillContext): string {
    return `
You are an expert frontend developer. Fix the following issue:

Issue: ${diagnosis.title}
Description: ${diagnosis.description}
File: ${diagnosis.location.file}
Line: ${diagnosis.location.line}

Code Context:
${diagnosis.evidence?.type === 'code' ? diagnosis.evidence.content : 'N/A'}

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
1. Only output valid JSON (wrap in \`\`\`json ... \`\`\` if possible)
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

  private async callLLM(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a code fixing assistant.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices[0].message.content;
  }

  private parseResponse(response: string, diagnosis: Diagnosis): Fix | null {
    const jsonStr = extractFirstJSONObject(response);
    if (!jsonStr) return null;

    let parsed: LLMFixPayload;
    try {
      parsed = JSON.parse(jsonStr) as LLMFixPayload;
    } catch {
      return null;
    }
    if (!parsed.changes || !Array.isArray(parsed.changes)) {
      return null;
    }

    return {
      id: `ai-fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      description: parsed.description ?? 'AI suggested fix',
      riskLevel: parsed.riskLevel ?? 'medium',
      autoApplicable: true,
      changes: parsed.changes.map(mapSuggestedChange),
    };
  }

  private parseValidationResponse(response: string): { valid: boolean; confidence: number; issues: string[] } {
    const jsonStr = extractFirstJSONObject(response);
    if (!jsonStr) {
      return { valid: false, confidence: 0, issues: ['Failed to parse validation'] };
    }

    let parsed: LLMValidationPayload;
    try {
      parsed = JSON.parse(jsonStr) as LLMValidationPayload;
    } catch {
      return { valid: false, confidence: 0, issues: ['Parse error'] };
    }

    return {
      valid: parsed.valid ?? false,
      confidence: parsed.confidence ?? 0,
      issues: parsed.issues ?? [],
    };
  }
}

export default AIFixEngine;
