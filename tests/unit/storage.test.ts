/**
 * Tests for in-memory storage
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { createMemoryStorage, createStorage } from '../../src/storage';

describe('createMemoryStorage', () => {
  it('returns null for missing keys', async () => {
    const s = createMemoryStorage();
    expect(await s.get('missing')).toBeNull();
  });

  it('stores and retrieves values', async () => {
    const s = createMemoryStorage();
    await s.set('foo', { a: 1 });
    expect(await s.get('foo')).toEqual({ a: 1 });
  });

  it('overwrites existing values', async () => {
    const s = createMemoryStorage();
    await s.set('foo', 1);
    await s.set('foo', 2);
    expect(await s.get('foo')).toBe(2);
  });

  it('deletes keys', async () => {
    const s = createMemoryStorage();
    await s.set('foo', 1);
    await s.delete('foo');
    expect(await s.get('foo')).toBeNull();
  });

  it('clears all', async () => {
    const s = createMemoryStorage();
    await s.set('a', 1);
    await s.set('b', 2);
    await s.clear();
    expect(await s.get('a')).toBeNull();
    expect(await s.get('b')).toBeNull();
  });
});

describe('createStorage factory', () => {
  it('returns memory storage when no path', () => {
    const s = createStorage();
    expect(s).toBeDefined();
    expect(typeof s.get).toBe('function');
  });

  it('returns file storage when path provided', () => {
    const s = createStorage('/tmp/qa-test');
    expect(s).toBeDefined();
    expect(typeof s.set).toBe('function');
  });
});
