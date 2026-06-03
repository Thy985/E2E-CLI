/**
 * Prompt Template Registry
 *
 * 统一管理所有 LLM prompt。
 *
 * 设计原则：
 * - 每个 prompt 有稳定 id + version（方便回滚 / a/b）
 * - 模板用 template literal 描述，运行时注入变量
 * - 模板里的 JSON 期望格式用 `expectJsonSchema` 描述，方便上层加 response_format
 *
 * 用法：
 *   import { getPrompt } from './prompts';
 *   const p = getPrompt('ai-fix', { diagnosis: d, evidence: e });
 *   await model.chat([{ role: 'system', content: p.system }, { role: 'user', content: p.user }], { json: true });
 */

export interface PromptTemplate {
  id: string;
  version: string;
  system: string;
  user: string;
  /** 期望 JSON 模式（OpenAI 兼容 provider 会传 response_format，Claude 走 system 强约束） */
  expectJson?: boolean;
  /** schema 描述（仅用于文档/校验） */
  jsonSchema?: string;
}

export interface PromptContext {
  [key: string]: string | number | boolean | undefined | null;
}

const registry: Map<string, PromptTemplate> = new Map();

/**
 * Register a prompt template. Throws if id+version already exists.
 */
export function registerPrompt(template: PromptTemplate): void {
  const key = `${template.id}@${template.version}`;
  if (registry.has(key)) {
    throw new Error(`Prompt ${key} already registered`);
  }
  registry.set(key, template);
}

/**
 * Get a prompt template by id, optionally pinned to a version.
 * Returns the latest registered version if `version` omitted.
 */
export function getPromptTemplate(id: string, version?: string): PromptTemplate {
  if (version) {
    const t = registry.get(`${id}@${version}`);
    if (t) return t;
  }
  // Find latest version
  let latest: PromptTemplate | undefined;
  for (const [k, t] of registry.entries()) {
    if (!k.startsWith(`${id}@`)) continue;
    if (!latest || compareVersion(t.version, latest.version) > 0) {
      latest = t;
    }
  }
  if (!latest) throw new Error(`Prompt ${id} not found`);
  return latest;
}

/**
 * Get a fully-rendered prompt. Variables in `{{name}}` form are replaced
 * from `ctx`. Missing variables raise an error (caller must pass all required
 * variables, so we don't silently send a broken prompt).
 */
export function getPrompt(id: string, ctx: PromptContext = {}, version?: string): {
  system: string;
  user: string;
  template: PromptTemplate;
} {
  const t = getPromptTemplate(id, version);
  return {
    system: render(t.system, ctx),
    user: render(t.user, ctx),
    template: t,
  };
}

function render(text: string, ctx: PromptContext): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => {
    const v = ctx[name];
    if (v === undefined || v === null) {
      throw new Error(`Prompt variable "${name}" not provided`);
    }
    return String(v);
  });
}

function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** List all registered prompts (for --list-style diagnostics) */
export function listPrompts(): Array<{ id: string; version: string; expectJson: boolean }> {
  return Array.from(registry.values()).map((t) => ({
    id: t.id,
    version: t.version,
    expectJson: !!t.expectJson,
  }));
}
