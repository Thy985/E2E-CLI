/**
 * Fix Engine
 *
 * 核心功能：
 * 1. 风险评估
 * 2. 沙箱预览
 * 3. 应用修复
 * 4. 验证修复
 * 5. 回滚机制
 */

import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Diagnosis, Fix, FileChange } from '../../types';
import { SandboxManager } from '../sandbox';

export interface FixEngineConfig {
  autoApproveLowRisk: boolean;
  sandboxEnabled: boolean;
  previewBeforeApply: boolean;
  verifyAfterFix: boolean;
}

export interface FixResult {
  success: boolean;
  fix: Fix;
  applied: boolean;
  verified: boolean;
  previewUrl?: string;
  beforeScreenshot?: string;
  afterScreenshot?: string;
  diffPercentage?: number;
  error?: string;
}

export class FixEngine {
  private sandboxManager: SandboxManager;
  private config: FixEngineConfig;

  constructor(config: FixEngineConfig) {
    this.sandboxManager = new SandboxManager();
    this.config = config;
  }

  /**
   * 评估修复风险。
   * 启发式：
   * - 0 变更视为低风险（空操作）
   * - 单文件、单条 replace 视为低风险
   * - 涉及 insert / 跨多文件视为中风险
   * - 跨多文件且包含 insert 或 delete 视为高风险
   * - 任何 touch 超过 5 个文件直接高风险
   */
  assessRisk(fix: Fix): 'low' | 'medium' | 'high' {
    if (!fix.changes || fix.changes.length === 0) {
      return 'low';
    }

    const fileSet = new Set(fix.changes.map(c => c.file));
    const hasInsert = fix.changes.some(c => c.type === 'insert');
    const hasDelete = fix.changes.some(c => c.type === 'delete');

    if (fileSet.size > 5 || (fileSet.size > 2 && (hasInsert || hasDelete))) {
      return 'high';
    }

    if (fileSet.size === 1 && fix.changes.length === 1 && fix.changes[0].type === 'replace') {
      return 'low';
    }

    if (hasInsert || hasDelete || fileSet.size > 1) {
      return 'medium';
    }

    return 'medium';
  }

  /**
   * 预览修复效果
   *
   * 流程：创建沙箱 → 启动原始 server → 应用修复 → 重启 server
   * 视觉对比（screenshot/pixelmatch）已随 web/gui 一并删除，
   * 改用 previewUrl 让用户自行访问对比。
   */
  async previewFix(
    _diagnosis: Diagnosis,
    fix: Fix,
    projectPath: string
  ): Promise<FixResult> {
    if (!this.config.sandboxEnabled) {
      return {
        success: true,
        fix,
        applied: false,
        verified: false,
        error: 'Sandbox is disabled',
      };
    }

    let sandboxId: string | undefined;
    let beforeUrl: string | undefined;
    try {
      // 1. 创建沙箱
      sandboxId = await this.sandboxManager.create(projectPath);
      beforeUrl = await this.sandboxManager.startServer(sandboxId, 3456);

      // 2. 应用修复
      await this.applyFix(fix, projectPath);

      // 3. 重启服务器（端口错开避免冲突）
      const fixedUrl = await this.sandboxManager.startServer(sandboxId, 3457);

      return {
        success: true,
        fix,
        applied: true,
        verified: false,
        previewUrl: fixedUrl,
        // 视觉对比已下线；保留 beforeUrl 供调用方展示
        beforeScreenshot: beforeUrl,
      };
    } catch (error) {
      return {
        success: false,
        fix,
        applied: false,
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      if (sandboxId) {
        try {
          await this.sandboxManager.destroy(sandboxId);
        } catch {
          // 清理失败不影响主流程
        }
      }
    }
  }

  /**
   * 应用修复
   */
  async applyFix(fix: Fix, projectPath: string): Promise<FixResult> {
    try {
      for (const change of fix.changes) {
        const filePath = path.join(projectPath, change.file);

        if (change.type === 'replace') {
          await replaceInFile(filePath, change.oldContent || '', change.content || '');
        } else if (change.type === 'insert') {
          await insertInFile(filePath, change.position?.line || 0, change.content || '');
        } else if (change.type === 'delete') {
          await deleteInFile(filePath, change.oldContent || '');
        }
      }

      return {
        success: true,
        fix,
        applied: true,
        verified: false,
      };

    } catch (error) {
      return {
        success: false,
        fix,
        applied: false,
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 验证修复：在沙箱里应用 fix 后跑测试，原始项目不会被污染。
   */
  async verifyFix(fix: Fix, projectPath: string): Promise<boolean> {
    let sandboxId: string | undefined;
    try {
      sandboxId = await this.sandboxManager.create(projectPath);
      // 修复副本里的文件：先复制到临时位置再操作
      const sandboxPath = path.join(os.tmpdir(), 'qa-agent-sandbox', sandboxId);
      await this.applyFix(fix, sandboxPath);
      const { success } = await this.sandboxManager.runTests(sandboxId);
      return success;
    } catch {
      return false;
    } finally {
      if (sandboxId) {
        try {
          await this.sandboxManager.destroy(sandboxId);
        } catch {
          // 忽略清理错误
        }
      }
    }
  }

  /**
   * 创建回滚点
   */
  async createRollbackPoint(projectPath: string): Promise<string> {
    const rollbackId = `rollback-${Date.now()}`;
    const rollbackPath = path.join(projectPath, '.qa-agent', 'rollback', rollbackId);

    await copyDir(projectPath, rollbackPath, [
      'node_modules',
      '.git',
      '.qa-agent',
    ]);

    return rollbackId;
  }

  /**
   * 执行回滚
   */
  async rollback(rollbackId: string, projectPath: string): Promise<void> {
    const rollbackPath = path.join(projectPath, '.qa-agent', 'rollback', rollbackId);

    try {
      await fsp.access(rollbackPath);
    } catch {
      throw new Error(`Rollback point ${rollbackId} not found`);
    }

    await copyDir(rollbackPath, projectPath, []);
  }
}

// ============================================
// 模块级辅助函数（避免类内动态 import）
// 注意：以下函数都改用 fs.promises 异步 I/O，
//       避免大文件读取阻塞事件循环。
// ============================================

async function replaceInFile(filePath: string, search: string, replace: string): Promise<void> {
  if (!search) {
    throw new Error('replace requires oldContent to search for');
  }
  const content = await fsp.readFile(filePath, 'utf-8');
  if (!content.includes(search)) {
    throw new Error(`Search pattern not found in ${filePath}`);
  }
  // 全局只替换一次：避免一处 search 文本在文件里出现多次时只改第一处但下游误以为"全文一致"
  const newContent = content.replace(search, replace);
  await fsp.writeFile(filePath, newContent, 'utf-8');
}

async function insertInFile(filePath: string, line: number, content: string): Promise<void> {
  const existing = await fsp.readFile(filePath, 'utf-8');
  const lines = existing.split('\n');
  const insertAt = Math.max(0, Math.min(line, lines.length));
  lines.splice(insertAt, 0, content);
  await fsp.writeFile(filePath, lines.join('\n'), 'utf-8');
}

async function deleteInFile(filePath: string, search: string): Promise<void> {
  if (!search) {
    throw new Error('delete requires oldContent to search for');
  }
  const content = await fsp.readFile(filePath, 'utf-8');
  if (!content.includes(search)) {
    throw new Error(`Search pattern not found in ${filePath}`);
  }
  // 第一次匹配后停止，避免误删所有同名片段
  const newContent = content.replace(search, '');
  await fsp.writeFile(filePath, newContent, 'utf-8');
}

async function copyDir(source: string, target: string, exclude: string[]): Promise<void> {
  await fsp.mkdir(target, { recursive: true });

  const entries = await fsp.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    if (exclude.includes(entry.name)) continue;

    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath, exclude);
    } else if (entry.isFile()) {
      await fsp.copyFile(sourcePath, targetPath);
    }
    // 跳过 symlink/socket/device 等特殊文件类型
  }
}

export default FixEngine;
