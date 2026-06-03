/**
 * Retry layer for HTTP/JSON-RPC calls
 *
 * 设计：
 * - 指数退避（base * 2^attempt）+ 抖动
 * - 只对"可重试错误"重试：429、5xx、网络层 ECONNRESET/ETIMEDOUT/ENOTFOUND
 * - 总耗时硬上限：maxTotalMs（避免无限等）
 * - AbortController 终止：每次重试都启用一个新 timer
 *
 * 不在重试层处理 4xx（除 429）——这些是用户代码 bug，重试无意义。
 */

export interface RetryOptions {
  /** 最大尝试次数（含首次），默认 3 */
  maxAttempts?: number;
  /** 起始退避 ms，默认 500 */
  baseDelayMs?: number;
  /** 退避上限 ms，默认 5000 */
  maxDelayMs?: number;
  /** 总体超时 ms（包含所有重试），默认 30000 */
  maxTotalMs?: number;
  /** 是否对 429 重试，默认 true */
  retryOn429?: boolean;
  /** 是否对 5xx 重试，默认 true */
  retryOn5xx?: boolean;
  /** 抖动系数 0~1，默认 0.3 */
  jitter?: number;
  /** 重试前回调（用于日志） */
  onRetry?: (info: { attempt: number; delayMs: number; error: Error }) => void;
}

export class RetryAbortError extends Error {
  constructor(public readonly reason: string) {
    super(`Retry aborted: ${reason}`);
    this.name = 'RetryAbortError';
  }
}

/**
 * 检查 HTTP 错误是否可重试
 */
export function isRetryableHttpStatus(
  status: number,
  opts: Pick<RetryOptions, 'retryOn429' | 'retryOn5xx'> = {}
): boolean {
  const { retryOn429 = true, retryOn5xx = true } = opts;
  if (retryOn429 && status === 429) return true;
  if (retryOn5xx && status >= 500 && status < 600) return true;
  return false;
}

/**
 * 检查网络层错误是否可重试
 */
export function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ECONNREFUSED'
  ) {
    return true;
  }
  // Timeout via AbortController
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
  return false;
}

/**
 * Sleep helper
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RetryAbortError('Aborted before sleep'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new RetryAbortError('Aborted during sleep'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * 计算下一次退避时间
 */
function computeDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitter: number
): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  const jitterAmount = exp * jitter * Math.random();
  return Math.round(exp + jitterAmount);
}

export interface RetryRunner<T> {
  result: T;
  attempts: number;
  totalMs: number;
}

/**
 * 带重试地执行一个异步函数。
 *
 * @param fn 实际执行的函数
 * @param classifyError 把任意 error 归一为 { retryable: boolean, status?: number }
 * @param opts RetryOptions
 * @returns RetryRunner 包含结果、尝试次数、总耗时
 */
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  classifyError: (err: unknown) => { retryable: boolean; status?: number },
  opts: RetryOptions = {}
): Promise<RetryRunner<T>> {
  const {
    maxAttempts = 3,
    baseDelayMs = 500,
    maxDelayMs = 5000,
    maxTotalMs = 30000,
    jitter = 0.3,
    onRetry,
  } = opts;

  const start = Date.now();
  let lastError: Error | undefined;
  const controller = new AbortController();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (controller.signal.aborted) {
      throw new RetryAbortError('Aborted before attempt');
    }
    const elapsed = Date.now() - start;
    if (elapsed >= maxTotalMs && attempt > 1) {
      throw new RetryAbortError(`maxTotalMs ${maxTotalMs} exceeded`);
    }

    try {
      const result = await fn(attempt);
      return { result, attempts: attempt, totalMs: Date.now() - start };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      lastError = e;
      const cls = classifyError(err);
      const canRetry = cls.retryable && attempt < maxAttempts;
      const remaining = maxTotalMs - (Date.now() - start);

      if (!canRetry) {
        throw e;
      }

      const delay = Math.min(computeDelay(attempt, baseDelayMs, maxDelayMs, jitter), remaining);
      if (delay <= 0) throw e;

      onRetry?.({ attempt, delayMs: delay, error: e });
      await sleep(delay, controller.signal);
    }
  }

  // 不可达：循环要么 return 要么 throw
  throw lastError ?? new Error('retry: exhausted without result');
}
