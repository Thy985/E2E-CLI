/**
 * Token usage tracking
 *
 * 每次 LLM 调用结束后解析 `usage` 字段并累加。线程安全靠全局 single-threaded JS。
 *
 * 注意：不同 provider 的 usage 字段名不同：
 * - OpenAI 兼容：{ prompt_tokens, completion_tokens, total_tokens }
 * - Claude：{ input_tokens, output_tokens }
 *
 * 我们归一为 internal Usage，并在日志中暴露。
 */

import type { ModelProvider } from './providers';

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export class UsageTracker {
  private totals: Map<ModelProvider, Usage> = new Map();
  private byCall: Usage[] = [];

  /** 解析 provider 返回的 usage，归一为内部格式 */
  static parseUsage(provider: ModelProvider, raw: unknown): Usage {
    if (!raw || typeof raw !== 'object') {
      return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }
    const u = raw as Record<string, unknown>;

    if (provider === 'claude') {
      const input = toInt(u.input_tokens);
      const output = toInt(u.output_tokens);
      return {
        promptTokens: input,
        completionTokens: output,
        totalTokens: input + output,
      };
    }

    // OpenAI 兼容
    const prompt = toInt(u.prompt_tokens);
    const completion = toInt(u.completion_tokens);
    const total = toInt(u.total_tokens) || prompt + completion;
    return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
  }

  /** 累加一次调用的用量 */
  record(provider: ModelProvider, usage: Usage): void {
    this.byCall.push(usage);
    const cur = this.totals.get(provider) || {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
    cur.promptTokens += usage.promptTokens;
    cur.completionTokens += usage.completionTokens;
    cur.totalTokens += usage.totalTokens;
    this.totals.set(provider, cur);
  }

  /** 获取所有 provider 的累计用量 */
  getTotals(): Map<ModelProvider, Usage> {
    return new Map(this.totals);
  }

  /** 序列化为对象，方便日志/UI 渲染 */
  toJSON(): {
    byProvider: Record<string, Usage>;
    overall: Usage;
    callCount: number;
  } {
    const byProvider: Record<string, Usage> = {};
    let overall: Usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    for (const [p, u] of this.totals.entries()) {
      byProvider[p] = u;
      overall.promptTokens += u.promptTokens;
      overall.completionTokens += u.completionTokens;
      overall.totalTokens += u.totalTokens;
    }
    return { byProvider, overall, callCount: this.byCall.length };
  }

  /** 简洁单行输出（用于 CLI） */
  formatLine(): string {
    const o = this.toJSON();
    return `[usage] calls=${o.callCount} prompt=${o.overall.promptTokens} completion=${o.overall.completionTokens} total=${o.overall.totalTokens}`;
  }

  reset(): void {
    this.totals.clear();
    this.byCall = [];
  }
}

function toInt(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  return 0;
}

/** 默认全局 tracker（CLI 模式共用） */
export const globalUsageTracker = new UsageTracker();
