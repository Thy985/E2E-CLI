/**
 * LLM client contract used by skills via SkillContext.model.
 *
 * Concrete implementations live in `src/models/`.
 */

export interface ModelClient {
  chat(messages: ModelMessage[], opts?: ModelOptions): Promise<string>;
  embed?(text: string): Promise<number[]>;
  meta?(): { provider: string; baseUrl: string; model: string; displayName: string };
}

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Optional per-call overrides for ModelClient.chat().
 * Pass `json: true` to enforce JSON-mode output (response_format).
 */
export interface ModelOptions {
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelRequest {
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ModelResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
