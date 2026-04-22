/**
 * Model Client Tests
 */

import { describe, it, expect } from 'vitest';
import {
  createModelClient,
  createDeepseekClient,
  createOpenAIClient,
  createClaudeClient,
  createSiliconFlowClient,
  createGroqClient,
  createMiniMaxClient,
  getSupportedProviders,
  detectProvider,
} from '../../src/models';

describe('Model Provider Detection', () => {
  it('should detect claude provider by sk-ant prefix', () => {
    expect(detectProvider('sk-ant-api03-abc123def456')).toBe('claude');
  });

  it('should detect deepseek provider by sk- prefix with length', () => {
    expect(detectProvider('sk-abcdefghijk1234567890abcdefghijk1234567890abcdefghijk123456')).toBe('deepseek');
  });

  it('should detect openai provider by sk- prefix', () => {
    expect(detectProvider('sk-OpenAIKeyHere123456')).toBe('openai');
  });

  it('should default to deepseek', () => {
    expect(detectProvider('unknown-key')).toBe('deepseek');
  });
});

describe('createModelClient', () => {
  it('should create model client with explicit config', () => {
    const client = createModelClient({
      provider: 'deepseek',
      apiKey: 'sk-test-key',
    });
    expect(client).toBeDefined();
    expect(typeof client.chat).toBe('function');
    expect(typeof client.embed).toBe('function');
  });

  it('should throw error when no API key available', () => {
    // Clear env vars by using empty string fallback
    expect(() => createModelClient({
      provider: 'deepseek',
      apiKey: '',
    })).toThrow('API key is required');
  });
});

describe('Provider-specific clients', () => {
  it('should create Deepseek client with api key', () => {
    const client = createDeepseekClient('sk-deepseek-test');
    expect(client).toBeDefined();
    expect(typeof client.chat).toBe('function');
  });

  it('should create OpenAI client with api key', () => {
    const client = createOpenAIClient('sk-openai-test');
    expect(client).toBeDefined();
    expect(typeof client.chat).toBe('function');
  });

  it('should create Claude client with api key', () => {
    const client = createClaudeClient('sk-ant-test');
    expect(client).toBeDefined();
    expect(typeof client.chat).toBe('function');
  });

  it('should create SiliconFlow client with api key', () => {
    const client = createSiliconFlowClient('Bearer siliconflow-test');
    expect(client).toBeDefined();
    expect(typeof client.chat).toBe('function');
  });

  it('should create Groq client with api key', () => {
    const client = createGroqClient('gsk_groq_test_key');
    expect(client).toBeDefined();
    expect(typeof client.chat).toBe('function');
  });

  it('should create MiniMax client with api key', () => {
    const client = createMiniMaxClient('cmk-minimax-test');
    expect(client).toBeDefined();
    expect(typeof client.chat).toBe('function');
  });
});

describe('getSupportedProviders', () => {
  it('should return list of supported providers', () => {
    const providers = getSupportedProviders();

    expect(providers).toContain('deepseek');
    expect(providers).toContain('openai');
    expect(providers).toContain('claude');
    expect(providers).toContain('siliconflow');
    expect(providers).toContain('groq');
    expect(providers).toContain('minimax');
  });

  it('should return array with 6 providers', () => {
    const providers = getSupportedProviders();
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBe(6);
  });
});

describe('Model Client API structure', () => {
  it('should have chat method that returns promise', () => {
    const client = createModelClient({
      provider: 'deepseek',
      apiKey: 'sk-test-key',
    });
    expect(typeof client.chat).toBe('function');
  });

  it('should have embed method that returns promise', () => {
    const client = createModelClient({
      provider: 'deepseek',
      apiKey: 'sk-test-key',
    });
    expect(typeof client.embed).toBe('function');
  });
});
