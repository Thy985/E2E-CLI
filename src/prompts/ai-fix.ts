/**
 * AI-Fix prompt templates
 *
 * 用法：
 *   const p = getPrompt('ai-fix', { diagnosis, codeContext });
 *   const parsed = tryParseJsonTyped(p.user, isAIFixResponse);
 *
 * JSON 模式：OpenAI 兼容 provider 走 response_format，Claude 通过 system 强约束。
 */

import { registerPrompt, type PromptTemplate } from './index';

const AI_FIX_SYSTEM = `You are an expert frontend developer who fixes code issues with minimal, surgical changes.

Rules:
- Output ONLY valid JSON, no prose, no markdown fence.
- Match the existing code style (indentation, quotes, semicolons).
- For "replace" changes, the "search" string MUST be unique in the file.
- Use line numbers as 1-based.
- Risk level: "low" for stylistic, "medium" for behavior-affecting, "high" for security/architecture.
- If the issue cannot be fixed by a small change, return an empty changes array.`;

const AI_FIX_USER = `Fix the following issue.

Issue title: {{title}}
Description: {{description}}
File: {{file}}
Line: {{line}}
Severity: {{severity}}

Code context (may be partial):
\`\`\`
{{codeContext}}
\`\`\`

Respond with this exact JSON shape:
{
  "type": "code-change",
  "description": "Brief description of the fix",
  "riskLevel": "low|medium|high",
  "changes": [
    {
      "file": "relative/path/to/file",
      "type": "replace|insert|delete",
      "search": "exact text to search (for replace/delete)",
      "replace": "replacement text (for replace)",
      "content": "content to insert (for insert)",
      "line": 1
    }
  ]
}

If you cannot fix it, return: {"type":"code-change","description":"unable to fix","riskLevel":"low","changes":[]}`;

const AI_FIX_VALIDATE_SYSTEM = `You are a code review assistant. Evaluate whether the proposed fix correctly addresses the original issue.

Rules:
- Output ONLY valid JSON.
- Be conservative: if you are not confident, return valid=false.`;

const AI_FIX_VALIDATE_USER = `Validate this code fix.

Original issue: {{issueTitle}}
Original description: {{issueDescription}}

Proposed fix:
- description: {{fixDescription}}
- riskLevel: {{fixRisk}}
- changes: {{changesJson}}

Evaluate:
1. Does the fix correctly address the issue?
2. Is the code syntactically correct?
3. Any side effects (breaking other code paths, edge cases)?
4. Is the risk level appropriate?

Output JSON:
{
  "valid": true|false,
  "confidence": 0-100,
  "issues": ["list of concerns, empty if none"]
}`;

const templates: PromptTemplate[] = [
  {
    id: 'ai-fix',
    version: '1.0.0',
    system: AI_FIX_SYSTEM,
    user: AI_FIX_USER,
    expectJson: true,
    jsonSchema: 'AIFixResponse',
  },
  {
    id: 'ai-fix-validate',
    version: '1.0.0',
    system: AI_FIX_VALIDATE_SYSTEM,
    user: AI_FIX_VALIDATE_USER,
    expectJson: true,
    jsonSchema: 'AIFixValidation',
  },
];

for (const t of templates) registerPrompt(t);
