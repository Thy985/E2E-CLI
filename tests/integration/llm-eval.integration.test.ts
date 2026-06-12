/**
 * LLM 集成测试 (Real API)
 *
 * 目标：验证 `createModelClient` 和基于它的 skills 在真实 API 路径下的行为。
 *
 * 运行条件：
 * - 设置以下任一环境变量才能跑真实 API 测试：
 *   - MODEL_API_KEY（通用，自动 detect provider）
 *   - DEEPSEEK_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY
 *     / SILICONFLOW_API_KEY / GROQ_API_KEY / MINIMAX_API_KEY
 * - 没有这些 key → 真实 API 测试 skip，mock fallback 测试照常跑
 *
 * 用法：
 *   MODEL_API_KEY=sk-... bun test tests/integration/llm-eval.integration.test.ts
 *
 * 注意：
 * - 真实 API 测试会消耗 LLM 配额，请谨慎跑
 * - 默认 timeout 30s 可被 LLM_LIVE_TIMEOUT 环境变量覆盖
 */

import { describe, it, expect } from 'bun:test';
import {
  createModelClient,
  createMockModelClient,
  detectProvider,
  createDeepseekClient,
  createOpenAIClient,
  createClaudeClient,
  getSupportedProviders,
} from '../../src/models';
import { E2ESkill } from '../../src/skills/builtin/e2e';
import type { SkillContext } from '../../src/types';

const LIVE_TIMEOUT = Number(process.env.LLM_LIVE_TIMEOUT ?? 30000);

/** 是否有任何真实 provider 的 API key */
function hasAnyApiKey(): boolean {
  return Boolean(
    process.env.MODEL_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.SILICONFLOW_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.MINIMAX_API_KEY,
  );
}

const skipIfNoKey = hasAnyApiKey() ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Provider detection (unconditional, no API calls)
// ---------------------------------------------------------------------------

describe('detectProvider (heuristic, unconditional)', () => {
  it('detects claude from sk-ant- prefix', () => {
    expect(detectProvider('sk-ant-fakekey123')).toBe('claude');
  });

  it('detects openai from sk-proj- prefix', () => {
    expect(detectProvider('sk-proj-' + 'a'.repeat(60))).toBe('openai');
  });

  it('detects deepseek from sk- + hex suffix', () => {
    expect(detectProvider('sk-' + 'a1b2c3d4e5f6'.repeat(4))).toBe('deepseek');
  });

  it('detects groq from gsk_ prefix', () => {
    expect(detectProvider('gsk_fakekey123')).toBe('groq');
  });

  it('falls back to deepseek on empty key', () => {
    expect(detectProvider('')).toBe('deepseek');
  });

  it('falls back to deepseek on unrecognized format', () => {
    expect(detectProvider('something-unexpected')).toBe('deepseek');
  });
});

describe('getSupportedProviders', () => {
  it('returns the 6 expected providers', () => {
    const providers = getSupportedProviders();
    expect(providers).toContain('deepseek');
    expect(providers).toContain('openai');
    expect(providers).toContain('claude');
    expect(providers).toContain('siliconflow');
    expect(providers).toContain('groq');
    expect(providers).toContain('minimax');
    expect(providers.length).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Mock client fallback (unconditional, no API calls)
// ---------------------------------------------------------------------------

describe('Mock fallback (when no API key)', () => {
  it('createModelClient returns mock when no key', () => {
    // 显式传空 apiKey，强制走 mock 路径，不依赖 process.env 状态
    const client = createModelClient({ provider: 'openai', apiKey: '' });
    expect(client.isMock).toBe(true);
  });

  it('createMockModelClient returns mock with isMock=true', () => {
    const client = createMockModelClient();
    expect(client.isMock).toBe(true);
  });

  it('mock chat returns MOCK marker in content', async () => {
    const client = createMockModelClient();
    const response = await client.chat([
      { role: 'user', content: 'any prompt' },
    ]);
    expect(response.content).toContain('【MOCK】');
  });

  it('mock embed returns zero vector of dim 1536', async () => {
    const client = createMockModelClient();
    const vec = await client.embed!('test');
    expect(vec).toBeInstanceOf(Array);
    expect(vec.length).toBe(1536);
    expect(vec.every((v) => v === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Real API tests — SKIP if no key
// ---------------------------------------------------------------------------

skipIfNoKey('Live LLM API (skipped without API key)', () => {
  it('createModelClient returns non-mock client when key present', () => {
    const client = createModelClient();
    expect(client.isMock).not.toBe(true);
  });

  it(
    'live chat returns non-mock content for trivial prompt',
    async () => {
      const client = createModelClient();
      const response = await client.chat([
        { role: 'user', content: 'Reply with the single word: pong' },
      ]);
      expect(response.content.length).toBeGreaterThan(0);
      // 不应包含 mock 标记
      expect(response.content).not.toContain('【MOCK】');
    },
    LIVE_TIMEOUT,
  );

  it(
    'live embed returns non-zero vector',
    async () => {
      const client = createModelClient();
      if (!client.embed) {
        // 某些 provider 可能不实现 embed
        return;
      }
      const vec = await client.embed('hello world');
      expect(vec).toBeInstanceOf(Array);
      expect(vec.length).toBeGreaterThan(0);
      // 至少有一个非零值
      expect(vec.some((v) => v !== 0)).toBe(true);
    },
    LIVE_TIMEOUT,
  );

  it(
    'E2ESkill.generateTest produces Playwright code via real LLM',
    async () => {
      const skill = new E2ESkill();
      const modelClient = createModelClient();
      const ctx: SkillContext = {
        project: { name: 'live-llm-test', path: process.cwd(), type: 'webapp' },
        config: { enabled: true, options: {} } as any,
        logger: {
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
        } as any,
        tools: {
          fs: { readFile: async () => '', writeFile: async () => {}, exists: async () => false, glob: async () => [], mkdir: async () => {}, remove: async () => {}, stat: async () => ({ size: 0, isFile: true, isDirectory: false }) },
          git: { getChangedFiles: async () => [], getCurrentBranch: async () => 'main', getCommitHash: async () => 'abc' },
          shell: { execute: async () => ({ stdout: '', stderr: '', exitCode: 0 }) },
        } as any,
        model: modelClient,
        storage: { get: async () => null, set: async () => {}, delete: async () => {} } as any,
      };

      // Access private method via any cast — integration test boundary
      const result = await (skill as any).generateTest(
        'Visit homepage and verify the title is "Hello"',
        ctx,
      );

      expect(result.code.length).toBeGreaterThan(50);
      // 真实 LLM 生成的代码应该包含 Playwright 风格 API
      const code = result.code;
      const looksLikePlaywright =
        /playwright|test\(|expect\(|getByRole|getByText|page\./i.test(code);
      expect(looksLikePlaywright).toBe(true);
      // 不应是 mock 内容
      expect(code).not.toContain('【MOCK】');
    },
    LIVE_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// Provider-specific client factories (no API calls — only check no-throw)
// ---------------------------------------------------------------------------

skipIfNoKey('Provider-specific client factories (no-throw check)', () => {
  it('createDeepseekClient does not throw', () => {
    expect(() => createDeepseekClient()).not.toThrow();
  });

  it('createOpenAIClient does not throw', () => {
    expect(() => createOpenAIClient()).not.toThrow();
  });

  it('createClaudeClient does not throw', () => {
    expect(() => createClaudeClient()).not.toThrow();
  });
});
