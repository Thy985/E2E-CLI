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

import * as fs from 'fs';
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
   */
  async previewFix(
    diagnosis: Diagnosis,
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
    try {
      // 1. 创建沙箱
      const sandbox = await this.sandboxManager.create({
        projectPath,
        port: 3456,
      });
      sandboxId = sandbox.id;

      // 2. 启动原始版本并截图
      const beforeScreenshot = path.join(projectPath, '.qa-agent', 'before.png');
      await this.sandboxManager.startServer(sandbox.id, 3456);
      await this.sandboxManager.captureScreenshot(sandbox.id, beforeScreenshot);

      // 3. 应用修复
      await this.sandboxManager.applyFix(sandbox.id, fix);

      // 4. 重启服务器并截图
      const fixedUrl = await this.sandboxManager.startServer(sandbox.id, 3457);
      const afterScreenshot = path.join(projectPath, '.qa-agent', 'after.png');
      await this.sandboxManager.captureScreenshot(sandbox.id, afterScreenshot);

      // 5. 视觉对比
      const diffPath = path.join(projectPath, '.qa-agent', 'diff.png');
      const { diffPercentage } = await this.sandboxManager.visualDiff(
        beforeScreenshot,
        afterScreenshot,
        diffPath
      );

      return {
        success: true,
        fix,
        applied: false,
        verified: false,
        previewUrl: fixedUrl,
        beforeScreenshot,
        afterScreenshot,
        diffPercentage,
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
      const sandbox = await this.sandboxManager.create({ projectPath });
      sandboxId = sandbox.id;
      await this.sandboxManager.applyFix(sandbox.id, fix);
      const { success } = await this.sandboxManager.runTests(sandbox.id);
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

    if (!fs.existsSync(rollbackPath)) {
      throw new Error(`Rollback point ${rollbackId} not found`);
    }

    await copyDir(rollbackPath, projectPath, []);
  }
}

// ============================================
// 模块级辅助函数（避免类内动态 import）
// ============================================

async function replaceInFile(filePath: string, search: string, replace: string): Promise<void> {
  if (!search) {
    throw new Error('replace requires oldContent to search for');
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  if (!content.includes(search)) {
    throw new Error(`Search pattern not found in ${filePath}`);
  }
  const newContent = content.replace(search, replace);
  await fs.promises.writeFile(filePath, newContent, 'utf-8');
}

async function insertInFile(filePath: string, line: number, content: string): Promise<void> {
  const existing = fs.readFileSync(filePath, 'utf-8');
  const lines = existing.split('\n');
  const insertAt = Math.max(0, Math.min(line, lines.length));
  lines.splice(insertAt, 0, content);
  await fs.promises.writeFile(filePath, lines.join('\n'), 'utf-8');
}

async function deleteInFile(filePath: string, search: string): Promise<void> {
  if (!search) {
    throw new Error('delete requires oldContent to search for');
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  if (!content.includes(search)) {
    throw new Error(`Search pattern not found in ${filePath}`);
  }
  const newContent = content.replace(search, '');
  await fs.promises.writeFile(filePath, newContent, 'utf-8');
}

async function copyDir(source: string, target: string, exclude: string[]): Promise<void> {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const entries = fs.readdirSync(source, { withFileTypes: true });

  for (const entry of entries) {
    if (exclude.includes(entry.name)) continue;

    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath, exclude);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

export default FixEngine;
