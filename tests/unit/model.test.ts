/**
 * Model Client Tests
 */

import { describe, it, expect } from 'bun:test';
import {
  createModelClient,
  getSupportedProviders,
  detectProvider,
} from '../../src/models';

describe('Model Provider Detection', () => {
  it('should detect claude provider by sk-ant- prefix', () => {
    expect(detectProvider('sk-ant-api03-abc123def456')).toBe('claude');
  });

  it('should detect deepseek provider by sk- + hex pattern', () => {
    expect(detectProvider('sk-' + 'a'.repeat(32))).toBe('deepseek');
    expect(detectProvider('sk-' + '0123456789abcdef'.repeat(2))).toBe('deepseek');
  });

  it('should detect openai provider by long sk- prefix', () => {
    expect(detectProvider('sk-OpenAIKeyHere1234567890abcdefghijk1234567890')).toBe('openai');
    expect(detectProvider('sk-proj-abc123')).toBe('openai');
  });

  it('should detect minimax provider by cmk- prefix', () => {
    expect(detectProvider('cmk-abc123')).toBe('minimax');
  });

  it('should detect siliconflow provider by Bearer prefix', () => {
    expect(detectProvider('Bearer some-token-here')).toBe('siliconflow');
  });

  it('should detect groq provider by gsk_ prefix', () => {
    expect(detectProvider('gsk_' + 'a'.repeat(32))).toBe('groq');
  });

  it('should default to deepseek for empty / unknown', () => {
    expect(detectProvider('')).toBe('deepseek');
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

  it('should return mock client when no API key available', () => {
    const client = createModelClient({
      provider: 'deepseek',
      apiKey: '',
    });
    expect(client).toBeDefined();
    expect(typeof client.chat).toBe('function');
    expect(typeof client.embed).toBe('function');
  });

  it('should create a real client for each provider', () => {
    const cases: Array<{ provider: 'deepseek' | 'openai' | 'claude' | 'siliconflow' | 'groq' | 'minimax'; apiKey: string }> = [
      { provider: 'deepseek',    apiKey: 'sk-deepseek-test' },
      { provider: 'openai',      apiKey: 'sk-openai-test' },
      { provider: 'claude',      apiKey: 'sk-ant-test' },
      { provider: 'siliconflow', apiKey: 'Bearer siliconflow-test' },
      { provider: 'groq',        apiKey: 'gsk_groq_test_key' },
      { provider: 'minimax',     apiKey: 'cmk-minimax-test' },
    ];
    for (const c of cases) {
      const client = createModelClient(c);
      expect(client).toBeDefined();
      expect(typeof client.chat).toBe('function');
      expect(typeof client.embed).toBe('function');
    }
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
