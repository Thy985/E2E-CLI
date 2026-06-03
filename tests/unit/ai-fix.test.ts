/**
 * Tests for the refactored AIFixEngine.
 *
 * Strategy: inject a fake ModelClient so we don't hit any real API.
 * The engine should:
 * 1. Use a JSON-mode chat call.
 * 2. Pass through model/temperature/maxTokens from AIFixOptions.
 * 3. Parse the response with the schema type guards.
 * 4. Return null when the response doesn't match the schema.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { AIFixEngine, DEFAULT_AI_FIX_OPTIONS } from '../../src/engines/ai-fix';
import type { Diagnosis, Fix, ModelClient, ModelMessage, ModelOptions, SkillContext } from '../../src/types';

function fakeContext(): SkillContext {
  const logs: Array<[string, unknown[]]> = [];
  return {
    project: { path: '/tmp', name: 'p', type: 'webapp' },
    config: {} as any,
    logger: {
      info: (...args) => logs.push(['info', args]),
      warn: (...args) => logs.push(['warn', args]),
      error: (...args) => logs.push(['error', args]),
      debug: (...args) => logs.push(['debug', args]),
      child: () => fakeContext().logger,
    } as any,
    tools: {} as any,
    model: {} as any,
    storage: {} as any,
  };
}

function fakeDiagnosis(): Diagnosis {
  return {
    id: 'd-1',
    type: 'a11y',
    title: 'Missing alt attribute',
    description: 'Image without alt text',
    severity: 'high',
    location: { file: 'src/a.ts', line: 5 },
    evidence: { type: 'code', content: '<img src="x.png">' },
  };
}

function fakeModel(reply: string, capture?: { messages?: ModelMessage[]; opts?: ModelOptions }): ModelClient & { calls: number } {
  const m: any = {
    calls: 0,
    async chat(messages: ModelMessage[], opts?: ModelOptions) {
      m.calls++;
      if (capture) {
        capture.messages = messages;
        capture.opts = opts;
      }
      return reply;
    },
  };
  return m;
}

describe('AIFixEngine', () => {
  let ctx: SkillContext;
  beforeEach(() => { ctx = fakeContext(); });

  it('returns a parsed Fix when the LLM reply matches the schema', async () => {
    const reply = JSON.stringify({
      type: 'code-change',
      description: 'Add alt attribute',
      riskLevel: 'low',
      changes: [
        { file: 'src/a.ts', type: 'replace', search: '<img src="x.png">', replace: '<img src="x.png" alt="">', line: 5 },
      ],
    });
    const model = fakeModel(reply);
    const engine = new AIFixEngine(model);
    const fix = await engine.generateFix(fakeDiagnosis(), ctx);
    expect(fix).not.toBeNull();
    expect(fix?.description).toBe('Add alt attribute');
    expect(fix?.riskLevel).toBe('low');
    expect(fix?.changes[0].oldContent).toBe('<img src="x.png">');
    expect(fix?.changes[0].content).toBe('<img src="x.png" alt="">');
  });

  it('passes AIFixOptions through to model.chat (json + temperature + maxTokens)', async () => {
    const capture: { messages?: ModelMessage[]; opts?: ModelOptions } = {};
    const model = fakeModel(JSON.stringify({
      type: 'code-change', description: 'x', riskLevel: 'low', changes: [],
    }), capture);
    const engine = new AIFixEngine(model);
    await engine.generateFix(fakeDiagnosis(), ctx, { model: 'ignored-as-string', temperature: 0.9, maxTokens: 1234 });
    expect(capture.opts?.json).toBe(true);
    expect(capture.opts?.temperature).toBe(0.9);
    expect(capture.opts?.maxTokens).toBe(1234);
  });

  it('uses the prompt registry to build messages (system + user)', async () => {
    const capture: { messages?: ModelMessage[] } = {};
    const model = fakeModel(JSON.stringify({
      type: 'code-change', description: 'x', riskLevel: 'low', changes: [],
    }), capture);
    const engine = new AIFixEngine(model);
    await engine.generateFix(fakeDiagnosis(), ctx);
    expect(capture.messages?.length).toBe(2);
    expect(capture.messages?.[0].role).toBe('system');
    expect(capture.messages?.[1].role).toBe('user');
    expect(capture.messages?.[1].content).toContain('Missing alt attribute');
  });

  it('returns null when reply does not match the schema', async () => {
    const model = fakeModel('not json at all');
    const engine = new AIFixEngine(model);
    const fix = await engine.generateFix(fakeDiagnosis(), ctx);
    expect(fix).toBeNull();
  });

  it('returns null when reply is valid JSON but wrong shape', async () => {
    const model = fakeModel(JSON.stringify({ type: 'other', foo: 'bar' }));
    const engine = new AIFixEngine(model);
    const fix = await engine.generateFix(fakeDiagnosis(), ctx);
    expect(fix).toBeNull();
  });

  it('returns null when chat throws', async () => {
    const model: ModelClient = {
      async chat() { throw new Error('network down'); },
    };
    const engine = new AIFixEngine(model);
    const fix = await engine.generateFix(fakeDiagnosis(), ctx);
    expect(fix).toBeNull();
  });

  it('batch generate returns map keyed by diagnosis id', async () => {
    const reply = JSON.stringify({
      type: 'code-change', description: 'x', riskLevel: 'low',
      changes: [{ file: 'a', type: 'replace', search: 's', replace: 'r', line: 1 }],
    });
    const model = fakeModel(reply);
    const engine = new AIFixEngine(model);
    const d1 = { ...fakeDiagnosis(), id: 'd-1' };
    const d2 = { ...fakeDiagnosis(), id: 'd-2' };
    const fixes = await engine.generateBatchFixes([d1, d2], ctx);
    expect(fixes.size).toBe(2);
    expect(fixes.get('d-1')).toBeDefined();
    expect(fixes.get('d-2')).toBeDefined();
  });

  it('validateFix returns parsed validation or a failure marker', async () => {
    const model = fakeModel(JSON.stringify({ valid: true, confidence: 92, issues: [] }));
    const engine = new AIFixEngine(model);
    const fix: Fix = {
      id: 'f-1', diagnosisId: 'd-1', description: 'x', riskLevel: 'low',
      autoApplicable: true, changes: [],
    };
    const result = await engine.validateFix(fix, fakeDiagnosis(), ctx);
    expect(result.valid).toBe(true);
    expect(result.confidence).toBe(92);
  });
});

describe('AIFixOptions defaults', () => {
  it('exposes a sensible default', () => {
    expect(DEFAULT_AI_FIX_OPTIONS.temperature).toBe(0.3);
    expect(DEFAULT_AI_FIX_OPTIONS.maxTokens).toBe(2000);
    expect(typeof DEFAULT_AI_FIX_OPTIONS.model).toBe('string');
  });
});
