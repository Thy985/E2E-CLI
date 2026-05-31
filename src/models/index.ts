/**
 * Model Client
 * Provides LLM integration for multiple providers
 */

import { ModelClient, ModelMessage } from '../types';

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
 * Detect provider from API key format
 */
export function detectProvider(apiKey: string): ModelProvider {
  if (apiKey.startsWith('sk-ant')) return 'claude';
  // DeepSeek keys: sk- prefix, 32-48 chars, hex-like pattern
  if (apiKey.startsWith('sk-') && /^[a-f0-9]{32,48}$/i.test(apiKey.slice(3))) return 'deepseek';
  if (apiKey.startsWith('sk-') && apiKey.length > 60) return 'deepseek';
  if (apiKey.startsWith('sk-')) return 'openai';
  if (apiKey.startsWith('Bearer')) return 'siliconflow';
  if (apiKey.match(/^[a-zA-Z0-9]{32,}$/) && !apiKey.includes('-')) return 'groq';
  if (apiKey.startsWith('cmk-')) return 'minimax';
  return 'deepseek'; // default
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
    console.warn('No API key provided. Using mock model client. Set MODEL_API_KEY for full functionality.');
    return createMockModelClient();
  }

  return {
    async chat(messages: ModelMessage[]): Promise<string> {
      const endpoint = `${baseUrl}/chat/completions`;

      const body: Record<string, unknown> = {
        model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: 0.7,
        max_tokens: 2048,
      };

      // Claude uses a different API format
      if (provider === 'claude') {
        body.max_tokens = body.max_tokens as number;
        delete body.model;
        // Claude uses messages endpoint differently
        return chatWithClaude(apiKey, messages, PROVIDER_CONFIGS[provider].defaultModel);
      }

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
        return data.choices[0]?.message?.content || '';
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
 * Create mock model client for MVP functionality without API key
 */
export function createMockModelClient(): ModelClient {
  return {
    async chat(messages: ModelMessage[]): Promise<string> {
      // Return a mock response for MVP functionality
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.content.includes('fix')) {
        return '建议检查代码中的问题并进行修复。';
      }
      return '这是一个模拟响应。请配置 MODEL_API_KEY 环境变量以启用完整的 AI 功能。';
    },

    async embed(text: string): Promise<number[]> {
      // Return a deterministic mock embedding based on text hash
      const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return Array(1536).fill(0).map((_, i) => Math.sin(hash + i) * 0.5);
    },
  };
}
