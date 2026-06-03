/**
 * Storage Module
 * Provides key-value storage for caching and persistence.
 *
 * Implementations:
 * - In-memory (default for tests / short-lived processes)
 * - File-based JSON (lazy-loaded, debounced writes)
 */

import { Storage } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as fssync from 'fs';

/**
 * In-memory storage. Default for unit tests and short-lived processes.
 */
export function createMemoryStorage(): Storage {
  const store = new Map<string, unknown>();

  return {
    async get<T>(key: string): Promise<T | null> {
      const value = store.get(key);
      return value === undefined ? null : (value as T);
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
 * File-based JSON storage. Best for caching across CLI invocations.
 *
 * Notes:
 * - Loads on first access (lazy)
 * - Coalesces writes within a short debounce window to avoid hot-path thrash
 */
export function createFileStorage(basePath: string): Storage {
  const storePath = path.join(basePath, '.qa-agent', 'cache', 'storage.json');
  let cache: Record<string, unknown> | null = null;
  let loadPromise: Promise<Record<string, unknown>> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  async function load(): Promise<Record<string, unknown>> {
    if (cache) return cache;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      try {
        const content = await fs.readFile(storePath, 'utf-8');
        cache = JSON.parse(content);
      } catch {
        cache = {};
      }
      return cache!;
    })();
    return loadPromise;
  }

  function scheduleSave(): void {
    if (saveTimer) return;
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      if (!cache) return;
      try {
        await fs.mkdir(path.dirname(storePath), { recursive: true });
        await fs.writeFile(storePath, JSON.stringify(cache, null, 2), 'utf-8');
      } catch (err) {
        // Swallow — caller already has the value in memory
      }
    }, 50);
  }

  // Best-effort flush on exit
  const flush = async () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (cache) {
      try {
        await fs.mkdir(path.dirname(storePath), { recursive: true });
        await fs.writeFile(storePath, JSON.stringify(cache, null, 2), 'utf-8');
      } catch { /* ignore */ }
    }
  };
  process.once('exit', () => {
    if (cache && fssync.existsSync(storePath) === false && cache && Object.keys(cache).length > 0) {
      try {
        fssync.mkdirSync(path.dirname(storePath), { recursive: true });
        fssync.writeFileSync(storePath, JSON.stringify(cache, null, 2), 'utf-8');
      } catch { /* ignore */ }
    }
  });

  return {
    async get<T>(key: string): Promise<T | null> {
      const data = await load();
      const value = data[key];
      return value === undefined ? null : (value as T);
    },

    async set<T>(key: string, value: T): Promise<void> {
      const data = await load();
      data[key] = value;
      scheduleSave();
    },

    async delete(key: string): Promise<void> {
      const data = await load();
      delete data[key];
      scheduleSave();
    },

    async clear(): Promise<void> {
      cache = {};
      scheduleSave();
    },
  };
}

/**
 * Default storage factory. Uses file storage when a basePath is given, otherwise memory.
 */
export function createStorage(basePath?: string): Storage {
  if (basePath) {
    return createFileStorage(basePath);
  }
  return createMemoryStorage();
}

export default createStorage;
