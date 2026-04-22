/**
 * Model Client
 * Provides LLM integration for diagnosis and fix generation
 */

import { ModelClient, ModelMessage } from '../types';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

/**
 * Create model client with Deepseek API
 */
export function createModelClient(): ModelClient {
  return {
    async chat(messages: ModelMessage[]): Promise<string> {
      const apiKey = process.env.DEEPSEEK_API_KEY;

      if (!apiKey) {
        throw new Error('DEEPSEEK_API_KEY environment variable is not set');
      }

      try {
        const response = await fetch(DEEPSEEK_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: messages.map(m => ({
              role: m.role,
              content: m.content,
            })),
            temperature: 0.7,
            max_tokens: 2048,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Deepseek API error: ${response.status} - ${error}`);
        }

        const data = await response.json() as { choices: Array<{ message: { content: string } }> };
        return data.choices[0]?.message?.content || '';
      } catch (error) {
        console.error('Model API call failed:', error);
        throw error;
      }
    },

    async embed(text: string): Promise<number[]> {
      // Deepseek doesn't have embedding API in the same way
      // Return a mock vector for compatibility
      const apiKey = process.env.DEEPSEEK_API_KEY;

      try {
        const response = await fetch('https://api.deepseek.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'deepseek-text-embedding-3-small',
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
 * Create OpenAI client (for future use)
 */
export function createOpenAIClient(_apiKey: string): ModelClient {
  return createModelClient();
}

/**
 * Create Claude client (for future use)
 */
export function createClaudeClient(_apiKey: string): ModelClient {
  return createModelClient();
}
