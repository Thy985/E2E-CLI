/**
 * Model Client
 * Provides LLM integration for multiple providers
 *
 * 设计要点：
 * 1. 单一 createModelClient 作为入口；旧版 6 个 createXxxClient 已删
 * 2. 缺 key 时返回 mock，并在 stderr 写一行警告（不是随机向量，避免脏数据）
 * 3. chat 错误冒泡；embed 错误降级为零向量（与 mock embed 行为一致）
 */

import { ModelClient, ModelMessage } from '../types';

export type ModelProvider =
  | 'deepseek'
  | 'openai'
  | 'claude'
  | 'siliconflow'
  | 'groq'
  | 'minimax';

export interface ModelConfig {
  provider: ModelProvider;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

const PROVIDER_CONFIGS: Record<ModelProvider, { baseUrl: string; defaultModel: string }> = {
  deepseek:    { baseUrl: 'https://api.deepseek.com/v1',         defaultModel: 'deepseek-chat' },
  openai:      { baseUrl: 'https://api.openai.com/v1',            defaultModel: 'gpt-4o-mini' },
  claude:      { baseUrl: 'https://api.anthropic.com/v1',         defaultModel: 'claude-sonnet-4-20250514' },
  siliconflow: { baseUrl: 'https://api.siliconflow.cn/v1',        defaultModel: 'deepseek-ai/DeepSeek-V2.5' },
  groq:        { baseUrl: 'https://api.groq.com/openai/v1',       defaultModel: 'llama-3.1-8b-instant' },
  minimax:     { baseUrl: 'https://api.minimax.chat/v1',          defaultModel: 'MiniMax-Text-01' },
};

const EMBED_MODELS: Partial<Record<ModelProvider, string>> = {
  openai: 'text-embedding-3-small',
  deepseek: 'deepseek-text-embedding-3-small',
  minimax: 'embo-01',
};

const EMBED_DIM = 1536;
const ZERO_VECTOR = new Array(EMBED_DIM).fill(0);

/**
 * Detect provider from API key format.
 *
 * 重要：纯靠字符串猜 provider 是脆弱的，强烈建议显式传入 config.provider。
 * 这里的启发式只用于"用户没传 provider 时的兜底"。
 */
export function detectProvider(apiKey: string): ModelProvider {
  if (!apiKey) return 'deepseek';
  if (apiKey.startsWith('sk-ant-')) return 'claude';
  if (apiKey.startsWith('cmk-')) return 'minimax';
  if (apiKey.startsWith('Bearer ')) return 'siliconflow';
  if (apiKey.startsWith('gsk_')) return 'groq';
  if (apiKey.startsWith('sk-')) {
    if (apiKey.startsWith('sk-proj-') || apiKey.length > 60) return 'openai';
    if (/^[a-f0-9]{32,48}$/i.test(apiKey.slice(3))) return 'deepseek';
    return 'openai';
  }
  return 'deepseek';
}

/**
 * Create model client
 */
export function createModelClient(config?: Partial<ModelConfig>): ModelClient {
  const provider = config?.provider
    || detectProvider(config?.apiKey || process.env.MODEL_API_KEY || '');
  const apiKey = config?.apiKey
    || process.env.MODEL_API_KEY
    || process.env[`${provider.toUpperCase()}_API_KEY`]
    || '';
  const baseUrl = config?.baseUrl || PROVIDER_CONFIGS[provider]?.baseUrl || '';
  const model = config?.model || PROVIDER_CONFIGS[provider]?.defaultModel || '';

  if (!apiKey) {
    console.warn('[qa-agent] No API key configured. Falling back to mock client — chat/embed outputs are placeholders, not real AI results.');
    return createMockModelClient();
  }

  return {
    async chat(messages: ModelMessage[]): Promise<string> {
      if (provider === 'claude') {
        return chatWithClaude(apiKey, messages, model);
      }
      return chatWithOpenAICompat(baseUrl, apiKey, provider, model, messages);
    },
    async embed(text: string): Promise<number[]> {
      // 与 mock 行为一致：embed 失败时降级为零向量，不返回随机数。
      // 随机向量会让 dedup / 近邻检索 在生产数据下产生"假阳性"。
      try {
        const response = await fetch(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: EMBED_MODELS[provider] || 'text-embedding-3-small',
            input: text,
          }),
        });
        if (!response.ok) {
          console.warn(`[qa-agent] Embedding API ${response.status}; falling back to zero vector.`);
          return [...ZERO_VECTOR];
        }
        const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
        return data.data[0]?.embedding || [...ZERO_VECTOR];
      } catch (err) {
        console.warn(`[qa-agent] Embedding call failed (${(err as Error).message}); falling back to zero vector.`);
        return [...ZERO_VECTOR];
      }
    },
  };
}

async function chatWithOpenAICompat(
  baseUrl: string,
  apiKey: string,
  provider: string,
  model: string,
  messages: ModelMessage[]
): Promise<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: 0.7,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${provider} API error: ${response.status} - ${text}`);
  }

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content || '';
}

async function chatWithClaude(
  apiKey: string,
  messages: ModelMessage[],
  model: string
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: messages.filter((m) => m.role !== 'system').map((m) => ({
        role: m.role,
        content: m.content,
      })),
      system: messages.find((m) => m.role === 'system')?.content,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${text}`);
  }

  const data = (await response.json()) as { content: Array<{ text: string }> };
  return data.content[0]?.text || '';
}

/**
 * Get supported providers list
 */
export function getSupportedProviders(): string[] {
  return Object.keys(PROVIDER_CONFIGS);
}

/**
 * Create mock model client for MVP functionality without API key.
 *
 * 警告：mock 输出仅用于本地烟测/UI 占位，**不具有任何语义价值**。
 * - mock chat：仅在用户没配 key 时让 CLI 不至于崩溃
 * - mock embed：返回固定维度的零向量。任何依赖相似度排序的逻辑（如 dedup、近邻检索）
 *   在 mock 下结果都是垃圾。上生产前请务必配置真实 API key。
 */
export function createMockModelClient(): ModelClient {
  return {
    async chat(messages: ModelMessage[]): Promise<string> {
      const last = messages[messages.length - 1];
      if (last?.content.includes('fix')) {
        return '【MOCK】建议检查代码中的问题并进行修复。配置 MODEL_API_KEY 启用真实 AI 能力。';
      }
      return '【MOCK】这是一个占位响应。请配置 MODEL_API_KEY 环境变量以启用完整的 AI 功能。';
    },
    async embed(_text: string): Promise<number[]> {
      return [...ZERO_VECTOR];
    },
  };
}
