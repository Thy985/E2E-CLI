/**
 * JSONStorage tests
 *
 * 覆盖：
 * - get/set/has/keys/delete/clear 行为
 * - flush 走 tmp + rename（不污染主文件）
 * - 文件存在但 JSON 损坏时允许下次重试
 * - 文件不存在时不抛错
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { JSONStorage } from '../../src/storage';

let tmpDir = '';
let filePath = '';

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-agent-storage-test-'));
  filePath = path.join(tmpDir, 'storage.json');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('JSONStorage', () => {
  it('returns null for missing file (no error)', async () => {
    const store = new JSONStorage(filePath);
    expect(await store.get('foo')).toBeNull();
    expect(await store.has('foo')).toBe(false);
  });

  it('persists values across instances', async () => {
    const a = new JSONStorage(filePath);
    await a.set('greeting', 'hi');
    await a.set('count', 42);

    const b = new JSONStorage(filePath);
    const greeting = await b.get('greeting');
    expect(greeting).toBe('hi' as any);
    expect(await b.get<number>('count')).toBe(42);
  });

  it('delete returns false for missing key', async () => {
    const store = new JSONStorage(filePath);
    expect(await store.delete('nope')).toBe(false);
  });

  it('delete returns true and removes key', async () => {
    const store = new JSONStorage(filePath);
    await store.set('k', 'v');
    expect(await store.delete('k')).toBe(true);
    expect(await store.get('k')).toBeNull();
  });

  it('keys() returns all persisted keys', async () => {
    const store = new JSONStorage(filePath);
    await store.set('a', 1);
    await store.set('b', 2);
    const keys = await store.keys();
    expect(keys.sort()).toEqual(['a', 'b']);
  });

  it('clear() wipes all keys', async () => {
    const store = new JSONStorage(filePath);
    await store.set('a', 1);
    await store.set('b', 2);
    await store.clear();
    expect(await store.keys()).toEqual([]);
  });

  it('flush writes via temp file + rename (no leftover .tmp)', async () => {
    const store = new JSONStorage(filePath);
    await store.set('x', 'y');
    const entries = await fs.readdir(tmpDir);
    expect(entries).toContain('storage.json');
    expect(entries.some((e) => e.endsWith('.tmp'))).toBe(false);
  });

  it('throws on corrupt JSON, and re-throws on next access (allows retry)', async () => {
    await fs.writeFile(filePath, '{not valid json', 'utf-8');
    const store = new JSONStorage(filePath);
    await expect(store.get('any')).rejects.toThrow();
    // 再次访问应当重新尝试 load（loadAttempted 已重置为 false）
    await expect(store.get('any')).rejects.toThrow();
  });

  it('recovers when corrupt file is replaced between calls', async () => {
    await fs.writeFile(filePath, '{not valid json', 'utf-8');
    const store = new JSONStorage(filePath);
    await expect(store.get('any')).rejects.toThrow();

    // 修复文件后下次访问应当成功
    await fs.writeFile(filePath, JSON.stringify({ ok: 1 }), 'utf-8');
    const recovered = await store.get('ok');
    expect(recovered).toBe(1 as any);
  });
});
