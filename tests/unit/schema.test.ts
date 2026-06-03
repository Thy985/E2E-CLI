/**
 * Tests for JSON parsing & type guards
 */

import { describe, it, expect } from 'bun:test';
import { extractJsonBlock, tryParseJson, tryParseJsonTyped, isObject, isString, isArrayOf } from '../../src/models/schema';

describe('extractJsonBlock', () => {
  it('extracts an object', () => {
    const result = extractJsonBlock('prefix {"a":1} suffix');
    expect(result?.kind).toBe('object');
    expect(result?.json).toBe('{"a":1}');
  });

  it('extracts an array', () => {
    const result = extractJsonBlock('hi [{"x":1},{"y":2}] bye');
    expect(result?.kind).toBe('array');
    expect(result?.json).toBe('[{"x":1},{"y":2}]');
  });

  it('handles nested objects correctly (does not over-match)', () => {
    const text = '{"a":{"b":{"c":1}},"d":2}';
    const result = extractJsonBlock(text);
    expect(result?.json).toBe(text);
  });

  it('handles arrays with nested objects', () => {
    const text = '[{"a":1},{"b":[{"c":2}]}]';
    const result = extractJsonBlock(text);
    expect(result?.json).toBe(text);
  });

  it('strips markdown fence', () => {
    const result = extractJsonBlock('```json\n{"a":1}\n```');
    expect(result?.json).toBe('{"a":1}');
  });

  it('handles escaped strings inside objects', () => {
    const text = '{"msg":"hello {world}"}';
    const result = extractJsonBlock(text);
    expect(result?.json).toBe(text);
  });

  it('returns null when no JSON present', () => {
    expect(extractJsonBlock('no json here')).toBeNull();
  });

  it('returns null on truncated JSON', () => {
    expect(extractJsonBlock('{"a":1')).toBeNull();
  });
});

describe('tryParseJson', () => {
  it('parses valid JSON', () => {
    expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null on invalid JSON', () => {
    expect(tryParseJson('not json')).toBeNull();
  });
});

describe('tryParseJsonTyped', () => {
  interface Foo { x: number }
  const isFoo = (v: unknown): v is Foo => isObject(v) && typeof v.x === 'number';

  it('returns parsed value when guard passes', () => {
    expect(tryParseJsonTyped('{"x":1}', isFoo)).toEqual({ x: 1 });
  });

  it('returns null when guard fails', () => {
    expect(tryParseJsonTyped('{"x":"nope"}', isFoo)).toBeNull();
  });

  it('returns null when JSON is invalid', () => {
    expect(tryParseJsonTyped('not json', isFoo)).toBeNull();
  });
});

describe('Type guards', () => {
  it('isObject', () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ a: 1 })).toBe(true);
    expect(isObject(null)).toBe(false);
    expect(isObject([])).toBe(false);
    expect(isObject('s')).toBe(false);
  });

  it('isString', () => {
    expect(isString('s')).toBe(true);
    expect(isString('')).toBe(true);
    expect(isString(1)).toBe(false);
  });

  it('isArrayOf', () => {
    expect(isArrayOf([1, 2, 3], (v): v is number => typeof v === 'number')).toBe(true);
    expect(isArrayOf([1, 'a'], (v): v is number => typeof v === 'number')).toBe(false);
    expect(isArrayOf([], (v): v is number => typeof v === 'number')).toBe(true);
  });
});
