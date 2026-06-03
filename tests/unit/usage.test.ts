/**
 * Tests for UsageTracker (token usage accounting)
 */

import { describe, it, expect } from 'bun:test';
import { UsageTracker, globalUsageTracker } from '../../src/models/usage';

describe('UsageTracker.parseUsage', () => {
  it('parses OpenAI-style usage', () => {
    const u = UsageTracker.parseUsage('openai', { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 });
    expect(u).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
  });

  it('parses Claude-style usage', () => {
    const u = UsageTracker.parseUsage('claude', { input_tokens: 100, output_tokens: 50 });
    expect(u).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
  });

  it('returns zeros for missing or malformed usage', () => {
    expect(UsageTracker.parseUsage('openai', null)).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    expect(UsageTracker.parseUsage('openai', {})).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  });

  it('falls back to prompt+completion when total is missing', () => {
    const u = UsageTracker.parseUsage('openai', { prompt_tokens: 10, completion_tokens: 5 });
    expect(u.totalTokens).toBe(15);
  });

  it('clamps negative numbers to 0', () => {
    const u = UsageTracker.parseUsage('openai', { prompt_tokens: -5, completion_tokens: 10, total_tokens: 5 });
    expect(u.promptTokens).toBe(0);
    expect(u.completionTokens).toBe(10);
  });
});

describe('UsageTracker record / toJSON', () => {
  it('records and aggregates per provider', () => {
    const t = new UsageTracker();
    t.record('openai', { promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    t.record('openai', { promptTokens: 20, completionTokens: 10, totalTokens: 30 });
    t.record('claude', { promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    const o = t.toJSON();
    expect(o.byProvider.openai).toEqual({ promptTokens: 30, completionTokens: 15, totalTokens: 45 });
    expect(o.byProvider.claude).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    expect(o.overall).toEqual({ promptTokens: 130, completionTokens: 65, totalTokens: 195 });
    expect(o.callCount).toBe(3);
  });

  it('reset clears all state', () => {
    const t = new UsageTracker();
    t.record('openai', { promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    t.reset();
    expect(t.toJSON().callCount).toBe(0);
    expect(t.toJSON().overall.totalTokens).toBe(0);
  });

  it('formatLine outputs a one-liner', () => {
    const t = new UsageTracker();
    t.record('openai', { promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    const line = t.formatLine();
    expect(line).toContain('[usage]');
    expect(line).toContain('calls=1');
    expect(line).toContain('total=15');
  });
});

describe('globalUsageTracker', () => {
  it('exists and is a UsageTracker', () => {
    expect(globalUsageTracker).toBeInstanceOf(UsageTracker);
  });
});
