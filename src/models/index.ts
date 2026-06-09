/**
 * Model Client
 * Provides LLM integration for multiple providers
 */

import { ModelClient, ModelMessage, ModelResponse } from '../types';

export type ModelProvider = 'deepseek' | 'openai' | 'claude' | 'siliconflow' | 'groq' | 'minimax';

export interface ModelConfig {
  provider: ModelProvider;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

const PROVIDER_CONFIGS: Record<ModelProvider, { baseUrl: string; defaultModel: string }> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  claude: {
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
  },
  siliconflow: {
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V2.5',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.1-8b-instant',
  },
  minimax: {
    baseUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'MiniMax-Text-01',
  },
};

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
  if (apiKey.startsWith('sk-')) {
    // OpenAI 新 key 形如 sk-proj-... / sk-... 长度较长；DeepSeek 形如 sk- + hex
    if (apiKey.startsWith('sk-proj-') || apiKey.length > 60) return 'openai';
    if (/^[a-f0-9]{32,48}$/i.test(apiKey.slice(3))) return 'deepseek';
    return 'openai';
  }
  // Groq key 形如 gsk_...，但与硅基流动难分，这里保守兜底
  if (/^gsk_/.test(apiKey)) return 'groq';
  return 'deepseek';
}

/**
 * Create model client with specified provider
 */
export function createModelClient(config?: Partial<ModelConfig>): ModelClient {
  const provider = config?.provider || detectProvider(config?.apiKey || process.env.MODEL_API_KEY || '');
  const apiKey = config?.apiKey || process.env.MODEL_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  const baseUrl = config?.baseUrl || PROVIDER_CONFIGS[provider]?.baseUrl || 'https://api.deepseek.com/v1';
  const model = config?.model || PROVIDER_CONFIGS[provider]?.defaultModel || 'deepseek-chat';

  // If no API key, return mock client for MVP functionality
  if (!apiKey) {
    return createMockModelClient();
  }

  return {
    async chat(messages: ModelMessage[]): Promise<ModelResponse> {
      // Claude 用独立 API 路径
      if (provider === 'claude') {
        const result = await chatWithClaude(apiKey, messages, model);
        return { content: result };
      }

      const endpoint = `${baseUrl}/chat/completions`;
      const body = {
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: 0.7,
        max_tokens: 2048,
      };

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`${provider} API error: ${response.status} - ${error}`);
        }

        const data = await response.json() as { choices: Array<{ message: { content: string } }> };
        return { content: data.choices[0]?.message?.content || '' };
      } catch (error) {
        console.error(`Model API call failed (${provider}):`, error);
        throw error;
      }
    },

    async embed(text: string): Promise<number[]> {
      const embeddingEndpoint = `${baseUrl}/embeddings`;

      let embeddingModel = 'text-embedding-3-small';
      if (provider === 'deepseek') {
        embeddingModel = 'deepseek-text-embedding-3-small';
      } else if (provider === 'minimax') {
        embeddingModel = 'embo-01';
      }

      try {
        const response = await fetch(embeddingEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: embeddingModel,
            input: text,
          }),
        });

        if (!response.ok) {
          throw new Error(`Embedding API error: ${response.status}`);
        }

        const data = await response.json() as { data: Array<{ embedding: number[] }> };
        return data.data[0]?.embedding || [];
      } catch {
        // Fallback to mock embedding
        return Array(1536).fill(0).map(() => Math.random() * 2 - 1);
      }
    },
  };
}

/**
 * Chat with Claude API (different format)
 */
async function chatWithClaude(apiKey: string, messages: ModelMessage[], model: string): Promise<string> {
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
      messages: messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role,
        content: m.content,
      })),
      system: messages.find(m => m.role === 'system')?.content,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as { content: Array<{ text: string }> };
  return data.content[0]?.text || '';
}

/**
 * Create Deepseek client
 */
export function createDeepseekClient(apiKey?: string): ModelClient {
  return createModelClient({
    provider: 'deepseek',
    apiKey: apiKey || process.env.DEEPSEEK_API_KEY || '',
  });
}

/**
 * Create OpenAI client
 */
export function createOpenAIClient(apiKey?: string): ModelClient {
  return createModelClient({
    provider: 'openai',
    apiKey: apiKey || process.env.OPENAI_API_KEY || '',
  });
}

/**
 * Create Claude client
 */
export function createClaudeClient(apiKey?: string): ModelClient {
  return createModelClient({
    provider: 'claude',
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY || '',
  });
}

/**
 * Create SiliconFlow client
 */
export function createSiliconFlowClient(apiKey?: string): ModelClient {
  return createModelClient({
    provider: 'siliconflow',
    apiKey: apiKey || process.env.SILICONFLOW_API_KEY || '',
  });
}

/**
 * Create Groq client
 */
export function createGroqClient(apiKey?: string): ModelClient {
  return createModelClient({
    provider: 'groq',
    apiKey: apiKey || process.env.GROQ_API_KEY || '',
  });
}

/**
 * Create MiniMax client
 */
export function createMiniMaxClient(apiKey?: string): ModelClient {
  return createModelClient({
    provider: 'minimax',
    apiKey: apiKey || process.env.MINIMAX_API_KEY || '',
  });
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
  console.warn(
    '[qa-agent] Using mock model client — no MODEL_API_KEY is configured. ' +
    'AI responses are simulated. Set MODEL_API_KEY for real AI capabilities.'
  );

  return {
    isMock: true,

    async chat(messages: ModelMessage[]): Promise<ModelResponse> {
      const lastMessage = messages[messages.length - 1];
      const content = lastMessage?.content?.toLowerCase() || '';

      // Generate context-aware responses based on the input
      if (/fix|repair|bug|error|issue/.test(content)) {
        return {
          content: '【MOCK】建议检查代码中的以下问题：1. 类型不一致（如接口返回 Promise<string> 但实现返回 string）；2. 缺少错误处理；3. 硬编码的值应提取为常量。请配置 MODEL_API_KEY 启用真实 AI 能力。',
        };
      }
      if (/test|unit|integration|e2e|coverage/.test(content)) {
        return {
          content: '【MOCK】建议为关键路径补充测试用例：1. 边界条件测试；2. 错误处理分支；3. 核心业务逻辑。请配置 MODEL_API_KEY 启用真实 AI 能力。',
        };
      }
      if (/performance|slow|optimize|bottleneck/.test(content)) {
        return {
          content: '【MOCK】性能优化建议：1. 减少不必要的网络请求；2. 使用缓存策略；3. 优化渲染性能（如 React.memo、useMemo）。请配置 MODEL_API_KEY 启用真实 AI 能力。',
        };
      }
      if (/accessibility|a11y|aria|screen.*reader/.test(content)) {
        return {
          content: '【MOCK】无障碍建议：1. 确保所有交互元素有正确的 aria 属性；2. 图片提供 alt 文本；3. 键盘导航支持。请配置 MODEL_API_KEY 启用真实 AI 能力。',
        };
      }
      if (/security|vulnerability|xss|csrf/.test(content)) {
        return {
          content: '【MOCK】安全检查清单：1. 用户输入必须转义；2. 使用 HTTPS 传输敏感数据；3. 避免在内联脚本中使用敏感信息。请配置 MODEL_API_KEY 启用真实 AI 能力。',
        };
      }
      if (/hello|hi|hey|你好/.test(content)) {
        return {
          content: '【MOCK】你好！我是 QA-Agent 的模拟 AI 助手。请配置 MODEL_API_KEY 环境变量以启用完整的 AI 诊断能力。',
        };
      }

      // Default response that echoes context
      return {
        content: `【MOCK】收到你的请求："${lastMessage?.content?.slice(0, 50)}${(lastMessage?.content?.length || 0) > 50 ? '...' : ''}"。当前使用的是模拟 AI 客户端，回复是占位文本。请配置 MODEL_API_KEY 环境变量以启用完整的 AI 功能。`,
      };
    },

    async embed(_text: string): Promise<number[]> {
      // 显式返回 0 向量 + 抛出警告，比"假语义"更安全
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[qa-agent] Mock embed 返回零向量，不能用于任何语义检索。');
      }
      return new Array(1536).fill(0);
    },
  };
}
