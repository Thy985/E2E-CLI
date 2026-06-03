/**
 * Tests for utility helpers
 */

import { describe, it, expect } from 'bun:test';
import {
  generateId,
  hash,
  formatDuration,
  formatSize,
  debounce,
  throttle,
  deepMerge,
  pick,
  omit,
  groupBy,
  calculateScore,
  getGrade,
} from '../../src/utils';

describe('generateId', () => {
  it('returns 8-char id', () => {
    const id = generateId();
    expect(id).toHaveLength(8);
  });

  it('returns different ids on each call', () => {
    const ids = new Set([generateId(), generateId(), generateId()]);
    expect(ids.size).toBe(3);
  });
});

describe('hash', () => {
  it('produces 8-char hash', () => {
    expect(hash('hello')).toHaveLength(8);
  });

  it('produces consistent hash for same input', () => {
    expect(hash('hello')).toBe(hash('hello'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hash('hello')).not.toBe(hash('world'));
  });
});

describe('formatDuration', () => {
  it('formats sub-second as ms', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats seconds with one decimal', () => {
    expect(formatDuration(1500)).toBe('1.5s');
  });

  it('formats minutes', () => {
    expect(formatDuration(90_000)).toBe('1.5min');
  });
});

describe('formatSize', () => {
  it('formats bytes', () => {
    expect(formatSize(500)).toBe('500.0B');
  });

  it('formats KB', () => {
    expect(formatSize(2048)).toBe('2.0KB');
  });

  it('formats MB', () => {
    expect(formatSize(5_242_880)).toBe('5.0MB');
  });
});

describe('deepMerge', () => {
  it('merges nested objects', () => {
    const target = { a: { b: 1, c: 2 } };
    const source = { a: { b: 10, d: 3 } };
    const result = deepMerge(target, source);
    expect(result).toEqual({ a: { b: 10, c: 2, d: 3 } });
  });

  it('replaces arrays (no deep merge)', () => {
    const result = deepMerge({ a: [1, 2, 3] }, { a: [4, 5] });
    expect(result.a).toEqual([4, 5]);
  });

  it('ignores undefined source values', () => {
    const result = deepMerge({ a: 1, b: 2 }, { a: undefined });
    expect(result).toEqual({ a: 1, b: 2 });
  });
});

describe('pick / omit', () => {
  it('pick returns only selected keys', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
  });

  it('omit removes selected keys', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
  });
});

describe('groupBy', () => {
  it('groups by key function', () => {
    const items = [
      { type: 'a', v: 1 },
      { type: 'b', v: 2 },
      { type: 'a', v: 3 },
    ];
    const groups = groupBy(items, x => x.type);
    expect(groups.a).toHaveLength(2);
    expect(groups.b).toHaveLength(1);
  });
});

describe('calculateScore / getGrade', () => {
  it('returns 100 for empty issues', () => {
    expect(calculateScore([])).toBe(100);
  });

  it('subtracts weights for critical', () => {
    expect(calculateScore([{ severity: 'critical' }])).toBe(90);
  });

  it('clamps to 0', () => {
    const issues = Array(20).fill({ severity: 'critical' });
    expect(calculateScore(issues)).toBe(0);
  });

  it('maps scores to grades', () => {
    expect(getGrade(95)).toBe('A');
    expect(getGrade(85)).toBe('B');
    expect(getGrade(75)).toBe('C');
    expect(getGrade(65)).toBe('D');
    expect(getGrade(50)).toBe('F');
  });
});

describe('debounce / throttle', () => {
  it('debounce delays execution', async () => {
    let count = 0;
    const fn = debounce(() => count++, 30);
    fn();
    fn();
    fn();
    expect(count).toBe(0);
    await new Promise(r => setTimeout(r, 50));
    expect(count).toBe(1);
  });

  it('throttle limits execution to one call per window', async () => {
    let count = 0;
    const fn = throttle(() => count++, 30);
    fn();
    fn();
    fn();
    expect(count).toBe(1);
    await new Promise(r => setTimeout(r, 50));
    fn();
    expect(count).toBe(2);
  });
});
