/**
 * Model Client
 *
 * 统一 LLM 客户端入口。
 *
 * 特性：
 * - 6 家 provider 自动路由（detectProvider 按 key 前缀猜）
 * - 内置重试 / 退避 / 超时（src/models/retry.ts）
 * - JSON 模式（response_format: json_object）以提高 JSON 合规率
 * - 用量统计（UsageTracker，CLI 默认全局累加）
 * - API key 缺失时降级为 mock client
 *
 * 调用方：diagnose.ts、fix.ts、gui/actor/index.ts、engines/ai-fix
 */

import type { ModelClient, ModelMessage, ModelOptions } from '../types';
import { globalUsageTracker, UsageTracker } from './usage';
import type { Usage } from './usage';
import {
  PROVIDER_CONFIGS,
  detectProvider,
  getSupportedProviders,
  type ModelProvider,
  type ProviderConfig,
} from './providers';
import {
  isRetryableHttpStatus,
  isRetryableNetworkError,
  retry,
  type RetryOptions,
} from './retry';

export type { ModelProvider, ProviderConfig } from './providers';
export { PROVIDER_CONFIGS, detectProvider, getSupportedProviders } from './providers';
export { UsageTracker, globalUsageTracker } from './usage';
export type { Usage } from './usage';

export interface ModelConfig {
  provider: ModelProvider;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  /** 默认 false；为 true 时所有 chat 强制 JSON 输出 */
  jsonMode?: boolean;
  /** 每次调用的最大 token 数，默认 2048 */
  maxTokens?: number;
  /** 温度 0~2，默认 0.7 */
  temperature?: number;
  /** 重试配置 */
  retry?: RetryOptions;
  /** 用量追踪器，默认 globalUsageTracker */
  usageTracker?: UsageTracker;
}

export const DEFAULT_RETRY_OPTS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  maxTotalMs: 30000,
  retryOn429: true,
  retryOn5xx: true,
  jitter: 0.3,
};

export class ModelCallError extends Error {
  constructor(
    message: string,
    public readonly provider: ModelProvider,
    public readonly status?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ModelCallError';
  }
}

/**
 * Create a model client with the given configuration.
 */
export function createModelClient(config?: Partial<ModelConfig>): ModelClient {
  const provider =
    config?.provider ||
    detectProvider(config?.apiKey || process.env.MODEL_API_KEY || '');
  const apiKey =
    config?.apiKey || process.env.MODEL_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  const providerCfg = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.deepseek;

  const baseUrl = config?.baseUrl || providerCfg.baseUrl;
  const model = config?.model || providerCfg.defaultModel;
  const jsonMode = config?.jsonMode ?? false;
  const maxTokens = config?.maxTokens ?? 2048;
  const temperature = config?.temperature ?? 0.7;
  const retryOpts: RetryOptions = { ...DEFAULT_RETRY_OPTS, ...(config?.retry || {}) };
  const usageTracker = config?.usageTracker || globalUsageTracker;

  if (!apiKey) {
    if (process.env.QA_AGENT_SUPPRESS_MOCK_WARNING !== '1') {
      console.warn('[model] No API key provided. Using mock client. Set MODEL_API_KEY for full functionality.');
    }
    return createMockModelClient();
  }

  async function callOnce(messages: ModelMessage[], opts: ModelOptions = {}): Promise<string> {
    const {
      json: forceJson = false,
      temperature: t = temperature,
      maxTokens: mt = maxTokens,
    } = opts;
    const wantJson = forceJson || jsonMode;

    if (provider === 'claude') {
      return chatWithClaude(
        apiKey,
        baseUrl,
        model,
        messages,
        mt,
        t,
        usageTracker
      );
    }
    return chatWithOpenAICompatible(
      provider,
      baseUrl,
      apiKey,
      model,
      messages,
      mt,
      t,
      wantJson,
      usageTracker
    );
  }

  return {
    /**
     * Standard chat call. opts.json = true 时强制 JSON 输出（OpenAI 兼容 provider 走
     * response_format: { type: 'json_object' }，Claude 通过 system prompt 强约束）。
     */
    async chat(messages: ModelMessage[], opts?: ModelOptions): Promise<string> {
      const run = await retry(
        () => callOnce(messages, opts),
        (err) => {
          if (err instanceof ModelCallError && err.status !== undefined) {
            return { retryable: isRetryableHttpStatus(err.status, retryOpts), status: err.status };
          }
          if (isRetryableNetworkError(err)) {
            return { retryable: true };
          }
          return { retryable: false };
        },
        retryOpts
      );
      return run.result;
    },

    /**
     * Embedding call. OpenAI 兼容 provider 走 /embeddings，Claude 直接抛错（不支持）。
     */
    async embed(text: string): Promise<number[]> {
      if (provider === 'claude') {
        // Claude 没原生 embedding 接口。返回 mock 向量保持兼容。
        return mockEmbedding(text, providerCfg.embeddingDimension);
      }
      const dim = providerCfg.embeddingDimension;
      try {
        const response = await fetch(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: providerCfg.embeddingModel,
            input: text,
          }),
        });
        if (!response.ok) {
          throw new ModelCallError(
            `${provider} embedding API error: ${response.status}`,
            provider,
            response.status
          );
        }
        const data = (await response.json()) as {
          data: Array<{ embedding: number[] }>;
          usage?: { prompt_tokens?: number; total_tokens?: number };
        };
        if (data.usage) {
          usageTracker.record(
            provider,
            UsageTracker.parseUsage(provider, data.usage)
          );
        }
        return data.data[0]?.embedding || mockEmbedding(text, dim);
      } catch (err) {
        if (err instanceof ModelCallError) throw err;
        // 网络层错误不重试 embed（意义不大），直接 mock
        return mockEmbedding(text, dim);
      }
    },

    /** 暴露内部 provider 元信息，方便上层做 UI/log */
    meta() {
      return { provider, baseUrl, model, displayName: providerCfg.displayName };
    },
  } as ModelClient & { meta?: () => { provider: ModelProvider; baseUrl: string; model: string; displayName: string } };
}

// ============================================
// HTTP transports
// ============================================

async function chatWithOpenAICompatible(
  provider: ModelProvider,
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ModelMessage[],
  maxTokens: number,
  temperature: number,
  jsonMode: boolean,
  usageTracker: UsageTracker
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature,
    max_tokens: maxTokens,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ModelCallError(
      `${provider} network error: ${err instanceof Error ? err.message : String(err)}`,
      provider,
      undefined,
      err
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ModelCallError(
      `${provider} API error: ${response.status} - ${text}`,
      provider,
      response.status
    );
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: unknown;
  };
  if (data.usage) {
    usageTracker.record(provider, UsageTracker.parseUsage(provider, data.usage));
  }
  return data.choices[0]?.message?.content || '';
}

async function chatWithClaude(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: ModelMessage[],
  maxTokens: number,
  temperature: number,
  usageTracker: UsageTracker
): Promise<string> {
  const system = messages.find((m) => m.role === 'system')?.content;
  const nonSystem = messages.filter((m) => m.role !== 'system');
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: nonSystem.map((m) => ({ role: m.role, content: m.content })),
  };
  if (system) body.system = system;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ModelCallError(
      `claude network error: ${err instanceof Error ? err.message : String(err)}`,
      'claude',
      undefined,
      err
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ModelCallError(
      `claude API error: ${response.status} - ${text}`,
      'claude',
      response.status
    );
  }

  const data = (await response.json()) as {
    content: Array<{ text: string }>;
    usage?: unknown;
  };
  if (data.usage) {
    usageTracker.record('claude', UsageTracker.parseUsage('claude', data.usage));
  }
  return data.content[0]?.text || '';
}

// ============================================
// Per-provider convenience factories
// ============================================

export function createDeepseekClient(apiKey?: string): ModelClient {
  return createModelClient({ provider: 'deepseek', apiKey: apiKey || process.env.DEEPSEEK_API_KEY || '' });
}
export function createOpenAIClient(apiKey?: string): ModelClient {
  return createModelClient({ provider: 'openai', apiKey: apiKey || process.env.OPENAI_API_KEY || '' });
}
export function createClaudeClient(apiKey?: string): ModelClient {
  return createModelClient({ provider: 'claude', apiKey: apiKey || process.env.ANTHROPIC_API_KEY || '' });
}
export function createSiliconFlowClient(apiKey?: string): ModelClient {
  return createModelClient({
    provider: 'siliconflow',
    apiKey: apiKey || process.env.SILICONFLOW_API_KEY || '',
  });
}
export function createGroqClient(apiKey?: string): ModelClient {
  return createModelClient({ provider: 'groq', apiKey: apiKey || process.env.GROQ_API_KEY || '' });
}
export function createMiniMaxClient(apiKey?: string): ModelClient {
  return createModelClient({
    provider: 'minimax',
    apiKey: apiKey || process.env.MINIMAX_API_KEY || '',
  });
}

// ============================================
// Mock client (offline / no API key fallback)
// ============================================

export function createMockModelClient(): ModelClient {
  return {
    async chat(messages: ModelMessage[], opts?: ModelOptions): Promise<string> {
      const last = messages[messages.length - 1]?.content || '';
      // 简单模式匹配，模拟一些有用响应
      if (opts?.json) {
        return JSON.stringify({ mock: true, received_keywords: extractKeywords(last) });
      }
      return `这是一个模拟响应（mock）。请配置 MODEL_API_KEY 环境变量以启用完整 AI 功能。`;
    },
    async embed(text: string): Promise<number[]> {
      return mockEmbedding(text, 1536);
    },
  };
}

function mockEmbedding(text: string, dim: number): number[] {
  const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return Array(dim).fill(0).map((_, i) => Math.sin(hash + i) * 0.5);
}

function extractKeywords(text: string): string[] {
  return Array.from(new Set(text.split(/\s+/).filter((w) => w.length >= 4))).slice(0, 10);
}
