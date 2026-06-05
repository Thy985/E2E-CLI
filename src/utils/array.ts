/**
 * Array utilities
 *
 * 唯一权威的 groupBy 实现；其他模块（report, cli/commands/*）必须从这里 import。
 */

export function groupBy<T, K extends string = string>(
  array: readonly T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of array) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}
