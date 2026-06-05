/**
 * JSON storage
 * Persistent key-value storage backed by a single JSON file
 *
 * 设计要点：
 * 1. 写入走临时文件 + rename，原子替换，避免半写文件被读到
 * 2. 内存 cache + 单次加载（lazy）；load 失败不污染 loaded 标志
 * 3. flush 暴露手动调用，避免每次 set 都重写整个文件
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export class JSONStorage {
  private filePath: string;
  private cache: Record<string, any> = {};
  private loadAttempted = false;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join(os.homedir(), '.qa-agent', 'storage.json');
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
  }

  /**
   * Load from disk (lazy, called automatically on get/set)
   * Throws if the file exists but contains invalid JSON.
   */
  private async load(): Promise<void> {
    if (this.loadAttempted) return;
    this.loadAttempted = true;
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      this.cache = JSON.parse(content);
    } catch (err: any) {
      if (err && err.code === 'ENOENT') {
        this.cache = {};
        return;
      }
      // 文件存在但内容损坏：清空内存 cache，重新允许下次 load 再试
      this.cache = {};
      this.loadAttempted = false;
      throw err;
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    await this.load();
    return this.cache[key] ?? null;
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    await this.load();
    this.cache[key] = value;
    await this.flush();
  }

  async delete(key: string): Promise<boolean> {
    await this.load();
    if (!(key in this.cache)) return false;
    delete this.cache[key];
    await this.flush();
    return true;
  }

  async has(key: string): Promise<boolean> {
    await this.load();
    return key in this.cache;
  }

  async keys(): Promise<string[]> {
    await this.load();
    return Object.keys(this.cache);
  }

  async clear(): Promise<void> {
    this.cache = {};
    await this.flush();
  }

  /**
   * Atomically persist cache to disk via temp file + rename
   */
  async flush(): Promise<void> {
    await this.ensureDir();
    const dir = path.dirname(this.filePath);
    const tmp = path.join(dir, `.${path.basename(this.filePath)}.${process.pid}.${Date.now()}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(this.cache, null, 2), 'utf-8');
    await fs.rename(tmp, this.filePath);
  }
}

/**
 * Default singleton factory
 */
export function createStorage(filePath?: string): JSONStorage {
  return new JSONStorage(filePath);
}
