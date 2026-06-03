/**
 * Tests for the retry / backoff / timeout layer
 */

import { describe, it, expect } from 'bun:test';
import { retry, isRetryableHttpStatus, isRetryableNetworkError, RetryAbortError } from '../../src/models/retry';

describe('isRetryableHttpStatus', () => {
  it('classifies 429 as retryable by default', () => {
    expect(isRetryableHttpStatus(429)).toBe(true);
  });

  it('classifies 5xx as retryable by default', () => {
    expect(isRetryableHttpStatus(500)).toBe(true);
    expect(isRetryableHttpStatus(502)).toBe(true);
    expect(isRetryableHttpStatus(503)).toBe(true);
    expect(isRetryableHttpStatus(599)).toBe(true);
  });

  it('does not retry 4xx other than 429', () => {
    expect(isRetryableHttpStatus(400)).toBe(false);
    expect(isRetryableHttpStatus(401)).toBe(false);
    expect(isRetryableHttpStatus(403)).toBe(false);
    expect(isRetryableHttpStatus(404)).toBe(false);
  });

  it('honors retryOn429=false', () => {
    expect(isRetryableHttpStatus(429, { retryOn429: false })).toBe(false);
  });

  it('honors retryOn5xx=false', () => {
    expect(isRetryableHttpStatus(500, { retryOn5xx: false })).toBe(false);
  });
});

describe('isRetryableNetworkError', () => {
  it('classifies ECONNRESET as retryable', () => {
    const err = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
    expect(isRetryableNetworkError(err)).toBe(true);
  });

  it('classifies ETIMEDOUT as retryable', () => {
    const err = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    expect(isRetryableNetworkError(err)).toBe(true);
  });

  it('classifies AbortError as retryable', () => {
    const err = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(isRetryableNetworkError(err)).toBe(true);
  });

  it('does not retry plain TypeErrors', () => {
    expect(isRetryableNetworkError(new TypeError('bad'))).toBe(false);
  });

  it('returns false for non-Error inputs', () => {
    expect(isRetryableNetworkError('plain string')).toBe(false);
    expect(isRetryableNetworkError(null)).toBe(false);
  });
});

describe('retry()', () => {
  it('returns the result on first success', async () => {
    let calls = 0;
    const result = await retry(
      () => {
        calls++;
        return Promise.resolve('ok');
      },
      () => ({ retryable: false })
    );
    expect(result.result).toBe('ok');
    expect(result.attempts).toBe(1);
    expect(calls).toBe(1);
  });

  it('retries on retryable errors up to maxAttempts', async () => {
    let calls = 0;
    const result = await retry(
      () => {
        calls++;
        if (calls < 3) throw new Error('flaky');
        return Promise.resolve('ok');
      },
      () => ({ retryable: true }),
      { baseDelayMs: 1, maxDelayMs: 5, jitter: 0 }
    );
    expect(result.result).toBe('ok');
    expect(result.attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it('throws immediately on non-retryable error', async () => {
    let calls = 0;
    let err: Error | null = null;
    try {
      await retry(
        () => {
          calls++;
          throw new Error('fatal');
        },
        () => ({ retryable: false }),
        { baseDelayMs: 1, maxDelayMs: 5 }
      );
    } catch (e) {
      err = e as Error;
    }
    expect(calls).toBe(1);
    expect(err?.message).toBe('fatal');
  });

  it('throws after maxAttempts on persistent retryable error', async () => {
    let calls = 0;
    let err: Error | null = null;
    try {
      await retry(
        () => {
          calls++;
          throw new Error('always');
        },
        () => ({ retryable: true }),
        { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 5, jitter: 0 }
      );
    } catch (e) {
      err = e as Error;
    }
    expect(calls).toBe(2);
    expect(err?.message).toBe('always');
  });

  it('calls onRetry before each retry', async () => {
    const events: Array<{ attempt: number; error: Error }> = [];
    let err: Error | null = null;
    try {
      await retry(
        () => Promise.reject(new Error('boom')),
        () => ({ retryable: true }),
        {
          maxAttempts: 3,
          baseDelayMs: 1,
          maxDelayMs: 5,
          jitter: 0,
          onRetry: (info) => events.push({ attempt: info.attempt, error: info.error }),
        }
      );
    } catch (e) {
      err = e as Error;
    }
    // No callback after the final attempt
    expect(events.length).toBe(2);
    expect(events[0].attempt).toBe(1);
    expect(events[1].attempt).toBe(2);
    expect(events[0].error.message).toBe('boom');
    expect(err?.message).toBe('boom');
  });

  it('aborts when maxTotalMs is exceeded', async () => {
    let calls = 0;
    let err: Error | null = null;
    try {
      await retry(
        () => {
          calls++;
          throw new Error('slow');
        },
        () => ({ retryable: true }),
        {
          maxAttempts: 10,
          baseDelayMs: 100,
          maxDelayMs: 200,
          maxTotalMs: 250, // tight budget
          jitter: 0,
        }
      );
    } catch (e) {
      err = e as Error;
    }
    // Should have made at least 1 attempt, and stopped early
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThan(10);
    expect(err).toBeInstanceOf(Error);
  });
});
