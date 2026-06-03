/**
 * JSON parsing & lightweight validation
 *
 * 设计：避免引入 zod，自己写最小的 type guard。
 * - `tryParseJson<T>(text, guard)` 安全解析 + 类型守卫
 * - `extractJsonBlock(text)` 用括号计数（不是 regex）找最外层 JSON
 *
 * 业务方用法：
 *   const parsed = tryParseJson(text, isAIFixResponse);
 *   if (parsed) { ... } else { 解析失败 fallback }
 */

/**
 * 提取最外层 JSON 对象/数组。
 * 旧实现用 /\{[\s\S]*\}/ 在嵌套对象下会匹配过头，这里用括号计数。
 */
export function extractJsonBlock(text: string): { json: string; kind: 'object' | 'array' } | null {
  const trimmed = text.trim();
  // Strip common LLM preamble
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  // Find first { or [
  const startIdx = candidate.search(/[\[{]/);
  if (startIdx === -1) return null;

  const openChar = candidate[startIdx];
  const closeChar = openChar === '{' ? '}' : ']';
  const kind: 'object' | 'array' = openChar === '{' ? 'object' : 'array';

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return { json: candidate.slice(startIdx, i + 1), kind };
      }
    }
  }
  return null;
}

/**
 * 安全地尝试解析 JSON。
 * 返回 null 表示解析失败。
 */
export function tryParseJson(text: string): unknown | null {
  const block = extractJsonBlock(text);
  if (!block) return null;
  try {
    return JSON.parse(block.json);
  } catch {
    return null;
  }
}

export class JsonParseError extends Error {
  constructor(public readonly raw: string, cause: unknown) {
    super(`JSON parse failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'JsonParseError';
  }
}

/**
 * 解析 + type guard。
 * 使用：
 *   const parsed = tryParseJsonTyped(text, isAIFixResponse);
 *   if (!parsed) return null;
 */
export function tryParseJsonTyped<T>(
  text: string,
  guard: (v: unknown) => v is T
): T | null {
  const block = extractJsonBlock(text);
  if (!block) return null;
  try {
    const parsed: unknown = JSON.parse(block.json);
    return guard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ============================================
// Common type guards
// ============================================

export function isString(v: unknown): v is string {
  return typeof v === 'string';
}

export function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}

export function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isArrayOf<T>(v: unknown, item: (x: unknown) => x is T): v is T[] {
  return Array.isArray(v) && v.every(item);
}

/**
 * Type guard that just checks "is non-null object". Use as fallback when
 * you don't have a more specific guard.
 */
export function isUnknownObject(v: unknown): v is Record<string, unknown> {
  return isObject(v);
}
