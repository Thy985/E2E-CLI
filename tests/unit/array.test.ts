/**
 * array utility tests (groupBy)
 */

import { describe, it, expect } from 'bun:test';
import { groupBy } from '../../src/utils/array';

describe('groupBy', () => {
  it('groups by string key', () => {
    const result = groupBy(
      [{ k: 'a', v: 1 }, { k: 'b', v: 2 }, { k: 'a', v: 3 }],
      (x) => x.k
    );
    expect(result.a).toHaveLength(2);
    expect(result.b).toHaveLength(1);
    expect(result.a[0]?.v).toBe(1);
    expect(result.a[1]?.v).toBe(3);
  });

  it('returns empty object for empty input', () => {
    expect(groupBy([], (x: number) => String(x))).toEqual({});
  });

  it('preserves input order within each group', () => {
    const result = groupBy([1, 2, 1, 3, 2, 1], (n) => String(n % 2));
    expect(result['0']).toEqual([2, 2]);
    expect(result['1']).toEqual([1, 1, 3, 1]);
  });

  it('does not mutate the input', () => {
    const input = [{ k: 'a' }, { k: 'b' }];
    const snapshot = JSON.stringify(input);
    groupBy(input, (x) => x.k);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
