/**
 * 评估运行时工具
 *
 * 为 Golden Set 评估提供 4 个共享设施：
 * - applyChanges: 把 FileChange[] 应用到原始代码
 * - createVirtualFS: 虚拟文件系统（只读）
 * - createSilentLogger: 静默日志
 * - buildSkillContext: 从 testCase 构造 SkillContext
 *
 * 供 evaluator / runner 调用，也供 CLI 复用。
 */

import type { FileChange, FileSystemTool, Logger, SkillContext } from '../../../types';
import type { GoldenTestCase } from '../types';

/** 把 FileChange[] 应用到原始代码（replace / insert / delete） */
export function applyChanges(
  originalCode: string,
  changes: FileChange[],
): string {
  let result = originalCode;

  for (const change of changes) {
    switch (change.type) {
      case 'replace':
        if (change.oldContent) {
          result = result.split(change.oldContent).join(change.content ?? '');
        }
        break;
      case 'insert':
        if (change.position) {
          const lines = result.split('\n');
          const insertLine = Math.min(change.position.line, lines.length);
          const insertContent = change.content ?? '';
          lines.splice(insertLine - 1, 0, insertContent);
          result = lines.join('\n');
        } else {
          result += change.content ?? '';
        }
        break;
      case 'delete':
        if (change.oldContent) {
          result = result.split(change.oldContent).join('');
        } else if (change.position) {
          const lines = result.split('\n');
          const deleteLine = Math.min(change.position.line - 1, lines.length - 1);
          lines.splice(deleteLine, 1);
          result = lines.join('\n');
        }
        break;
    }
  }

  return result;
}

/** 虚拟文件系统（只读）— Golden Set 评估的最小 FS shim */
export function createVirtualFS(
  filePath: string,
  content: string,
): FileSystemTool {
  const normalized = filePath.replace(/^\//, '');

  return {
    async readFile(p: string): Promise<string> {
      const target = p.replace(/^\//, '');
      if (target === normalized || target.endsWith(normalized)) {
        return content;
      }
      throw new Error(`File not found in virtual FS: ${p}`);
    },

    async writeFile(): Promise<void> {
      throw new Error('writeFile not supported in virtual FS');
    },

    async exists(p: string): Promise<boolean> {
      const target = p.replace(/^\//, '');
      return target === normalized || target.endsWith(normalized);
    },

    async glob(pattern: string): Promise<string[]> {
      const ext = normalized.split('.').pop() ?? '';

      // Convert glob pattern to regex — handle ** first to avoid double-slash issues
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*\/\*/g, '(.+/)?[^/]*')  // **/* → optional dir prefix + filename
        .replace(/\*\*/g, '.*')               // remaining ** → anything
        .replace(/\*/g, '[^/]*');             // remaining * → filename segment
      const re = new RegExp(`^${regexPattern}$`);
      if (re.test(normalized)) return [normalized];

      // Brace expansion support: **/*.{ts,tsx,js,jsx,html}
      const braceMatch = pattern.match(/\{([^}]+)\}/);
      if (braceMatch) {
        const exts = braceMatch[1].split(',');
        if (exts.includes(ext)) return [normalized];
      }

      // Fallback: simple extension matching
      if (pattern.includes('*.' + ext)) return [normalized];
      if (pattern === `**/*.${ext}`) return [normalized];

      return [];
    },

    async mkdir(): Promise<void> {
      // no-op
    },

    async remove(): Promise<void> {
      throw new Error('remove not supported in virtual FS');
    },

    async stat(p: string): Promise<{ size: number; isFile: boolean; isDirectory: boolean }> {
      const target = p.replace(/^\//, '');
      if (target === normalized || target.endsWith(normalized)) {
        return { size: Buffer.byteLength(content), isFile: true, isDirectory: false };
      }
      throw new Error(`File not found: ${p}`);
    },
  };
}

/** 静默日志 — 评估时丢弃输出 */
export function createSilentLogger(): Logger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

/** 从 GoldenTestCase 构造 SkillContext（含虚拟 FS / 静默 logger / mock model） */
export function buildSkillContext(
  testCase: GoldenTestCase,
): SkillContext {
  const { code, filePath } = testCase.input;

  return {
    project: {
      name: `golden-${testCase.id}`,
      path: '/tmp/qa-eval',
      type: 'webapp',
    },
    config: {
      version: 1,
      rules: {},
      ignore: [],
    },
    logger: createSilentLogger(),
    tools: {
      fs: createVirtualFS(filePath, code),
      git: {
        async getChangedFiles() { return []; },
        async getCurrentBranch() { return 'main'; },
        async getCommitHash() { return 'golden'; },
      },
      shell: {
        async execute() {
          return { stdout: '', stderr: '', exitCode: 0 };
        },
      },
    },
    model: {
      async chat() {
        return { content: '' };
      },
      isMock: true,
    },
    storage: {
      async get() { return null; },
      async set() {},
      async delete() {},
      async clear() {},
    },
  };
}
