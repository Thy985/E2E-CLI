/**
 * Provider configurations and detection
 *
 * 单一职责：列出支持的 provider、提供 baseUrl / 默认模型，
 * 负责"按 API key 前缀猜 provider"。
 */

export type ModelProvider =
  | 'deepseek'
  | 'openai'
  | 'claude'
  | 'siliconflow'
  | 'groq'
  | 'minimax';

export interface ProviderConfig {
  baseUrl: string;
  defaultModel: string;
  /** 友好中文名（用于日志/UI） */
  displayName: string;
  /** 是否走 OpenAI 兼容 /chat/completions；false 表示走原生协议（目前仅 Claude） */
  openaiCompatible: boolean;
  /** 该 provider 的 embedding 模型名 */
  embeddingModel: string;
  /** embedding 维度（用于 mock 兜底对齐） */
  embeddingDimension: number;
}

export const PROVIDER_CONFIGS: Record<ModelProvider, ProviderConfig> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    displayName: 'DeepSeek',
    openaiCompatible: true,
    embeddingModel: 'deepseek-text-embedding-3-small',
    embeddingDimension: 1536,
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    displayName: 'OpenAI',
    openaiCompatible: true,
    embeddingModel: 'text-embedding-3-small',
    embeddingDimension: 1536,
  },
  claude: {
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    displayName: 'Anthropic Claude',
    openaiCompatible: false,
    embeddingModel: '',
    embeddingDimension: 1536,
  },
  siliconflow: {
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V2.5',
    displayName: 'SiliconFlow',
    openaiCompatible: true,
    embeddingModel: 'BAAI/bge-m3',
    embeddingDimension: 1024,
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.1-8b-instant',
    displayName: 'Groq',
    openaiCompatible: true,
    embeddingModel: 'nomic-embed-text',
    embeddingDimension: 768,
  },
  minimax: {
    baseUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'MiniMax-Text-01',
    displayName: 'MiniMax',
    openaiCompatible: true,
    embeddingModel: 'embo-01',
    embeddingDimension: 1536,
  },
};

/**
 * Detect provider from API key format
 *
 * 注意：启发式判断有歧义（如 sk- 开头的 32~48 字符 key 既可能是 deepseek
 * 也可能是 siliconflow）。这里用 prefix 长度尽量区分，歧义时优先 deepseek。
 */
export function detectProvider(apiKey: string): ModelProvider {
  if (apiKey.startsWith('sk-ant')) return 'claude';
  if (apiKey.startsWith('Bearer')) return 'siliconflow';
  if (apiKey.startsWith('cmk-')) return 'minimax';
  if (apiKey.startsWith('gsk_')) return 'groq';

  if (apiKey.startsWith('sk-')) {
    const rest = apiKey.slice(3);
    // DeepSeek 历史上是 32-48 字符的 hex-like
    if (/^[a-f0-9]{32,48}$/i.test(rest)) return 'deepseek';
    // SiliconFlow 是 sk- 开头但不是 hex
    if (rest.includes('-')) return 'siliconflow';
    // 长 sk- key 也归到 deepseek（兼容历史规则）
    if (apiKey.length > 60) return 'deepseek';
    return 'openai';
  }

  return 'deepseek'; // default
}

export function getSupportedProviders(): ModelProvider[] {
  return Object.keys(PROVIDER_CONFIGS) as ModelProvider[];
}
