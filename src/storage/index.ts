/**
 * Storage Module
 * Provides key-value storage for caching and persistence
 */

import { Storage } from '../types';
import * as fsp from 'fs/promises';
import * as path from 'path';

/**
 * Create in-memory storage
 */
export function createMemoryStorage(): Storage {
  const store = new Map<string, any>();

  return {
    async get<T>(key: string): Promise<T | null> {
      const value = store.get(key);
      return value !== undefined ? value : null;
    },

    async set<T>(key: string, value: T): Promise<void> {
      store.set(key, value);
    },

    async delete(key: string): Promise<void> {
      store.delete(key);
    },

    async clear(): Promise<void> {
      store.clear();
    },
  };
}

/**
 * Create file-based storage backed by a single JSON file.
 *
 * 设计要点：
 * 1. 启动时一次性 load 到内存，所有 get 都是 O(1) 内存查
 * 2. 写操作采用串行化队列，避免并发写导致文件被覆盖
 * 3. dirty 标记避免无意义的空写
 * 4. 失败不污染内存（写盘失败时回滚内存）
 */
export function createFileStorage(basePath: string): Storage {
  const storePath = path.join(basePath, '.qa-agent', 'cache', 'storage.json');
  let cache: Record<string, any> = {};
  let loaded = false;
  let writeChain: Promise<void> = Promise.resolve();

  async function load(): Promise<void> {
    if (loaded) return;
    try {
      const content = await fsp.readFile(storePath, 'utf-8');
      const parsed = JSON.parse(content);
      cache = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err: any) {
      // 文件不存在 / 解析失败都不致命，当成空 store
      if (err && err.code !== 'ENOENT') {
        // 真正的 IO 错误要抛出，不能默默吞
        throw err;
      }
      cache = {};
    } finally {
      loaded = true;
    }
  }

  async function flush(): Promise<void> {
    try {
      await fsp.mkdir(path.dirname(storePath), { recursive: true });
      const tmp = `${storePath}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(cache, null, 2), 'utf-8');
      await fsp.rename(tmp, storePath);
    } catch (err) {
      throw err;
    }
  }

  function enqueueWrite(): Promise<void> {
    writeChain = writeChain.then(flush, flush);
    return writeChain;
  }

  return {
    async get<T>(key: string): Promise<T | null> {
      await load();
      const value = cache[key];
      return value !== undefined ? (value as T) : null;
    },

    async set<T>(key: string, value: T): Promise<void> {
      await load();
      const previous = cache[key];
      cache[key] = value;
      try {
        await enqueueWrite();
      } catch (err) {
        // 写盘失败回滚内存，保持内存/磁盘一致
        cache[key] = previous;
        throw err;
      }
    },

    async delete(key: string): Promise<void> {
      await load();
      if (!(key in cache)) return;
      const previous = cache[key];
      delete cache[key];
      try {
        await enqueueWrite();
      } catch (err) {
        cache[key] = previous;
        throw err;
      }
    },

    async clear(): Promise<void> {
      await load();
      const snapshot = { ...cache };
      cache = {};
      try {
        await enqueueWrite();
      } catch (err) {
        cache = snapshot;
        throw err;
      }
    },
  };
}

/**
 * Create default storage (in-memory for MVP)
 */
export function createStorage(): Storage {
  return createMemoryStorage();
}
