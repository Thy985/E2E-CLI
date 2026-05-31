/**
 * Storage Module
 * Provides key-value storage for caching and persistence
 */

import { Storage } from '../types';
import * as fs from 'fs/promises';
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
 * Create file-based storage
 */
export function createFileStorage(basePath: string): Storage {
  const storePath = path.join(basePath, '.qa-agent', 'cache', 'storage.json');
  let cache: Record<string, any> = {};

  async function load(): Promise<void> {
    try {
      const content = await fs.readFile(storePath, 'utf-8');
      cache = JSON.parse(content);
    } catch {
      cache = {};
    }
  }

  async function save(): Promise<void> {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, JSON.stringify(cache, null, 2), 'utf-8');
  }

  return {
    async get<T>(key: string): Promise<T | null> {
      await load();
      const value = cache[key];
      return value !== undefined ? value : null;
    },

    async set<T>(key: string, value: T): Promise<void> {
      await load();
      cache[key] = value;
      await save();
    },

    async delete(key: string): Promise<void> {
      await load();
      delete cache[key];
      await save();
    },

    async clear(): Promise<void> {
      cache = {};
      await save();
    },
  };
}

/**
 * Create default storage (in-memory for MVP)
 */
export function createStorage(): Storage {
  return createMemoryStorage();
}
