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

import * as path from 'path';
import * as fs from 'fs/promises';
import { Diagnosis, Fix } from '../../types';
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
   * 评估修复风险
   */
  assessRisk(fix: Fix): 'low' | 'medium' | 'high' {
    // 简单的 CSS 颜色变量替换是低风险
    if (fix.changes.length === 1 && fix.changes[0].type === 'replace') {
      const change = fix.changes[0];
      if (typeof change.oldContent === 'string' && change.oldContent.startsWith('#')) {
        return 'low';
      }
    }

    // 插入新代码通常是中等风险
    if (fix.changes.some(c => c.type === 'insert')) {
      return 'medium';
    }

    // 多个文件变更是高风险
    if (fix.changes.length > 3) {
      return 'high';
    }

    return 'medium';
  }

  /**
   * 预览修复效果（在沙箱中）
   */
  async previewFix(
    diagnosis: Diagnosis,
    fix: Fix,
    projectPath: string
  ): Promise<FixResult> {
    void diagnosis;
    if (!this.config.sandboxEnabled) {
      return {
        success: true,
        fix,
        applied: false,
        verified: false,
        error: 'Sandbox is disabled',
      };
    }

    let sandboxId: string | null = null;
    try {
      // 1. 创建沙箱
      const sandbox = await this.sandboxManager.create({
        projectPath,
        port: 3456,
      });
      sandboxId = sandbox.id;

      // 2. 启动原始版本并截图
      const originalUrl = await this.sandboxManager.startServer(sandbox.id, 3456);
      const beforeScreenshot = path.join(projectPath, '.qa-agent', 'before.png');
      await this.sandboxManager.captureScreenshot(sandbox.id, beforeScreenshot);

      // 3. 应用修复
      await this.sandboxManager.applyFix(sandbox.id, fix);

      // 4. 截图（修复后）
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
        previewUrl: originalUrl,
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
        try { await this.sandboxManager.destroy(sandboxId); } catch { /* ignore */ }
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
          await this.replaceInFile(filePath, change.oldContent || '', change.content || '');
        } else if (change.type === 'insert') {
          await this.insertInFile(filePath, change.position?.line || 0, change.content || '');
        } else if (change.type === 'delete') {
          await this.deleteInFile(filePath, change.oldContent || '');
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
   * 验证修复（运行项目测试）
   */
  async verifyFix(fix: Fix, projectPath: string): Promise<boolean> {
    void fix;
    try {
      const sandbox = await this.sandboxManager.create({ projectPath, port: 0 });
      try {
        const result = await this.sandboxManager.runTests(sandbox.id);
        return result.success;
      } finally {
        await this.sandboxManager.destroy(sandbox.id);
      }
    } catch {
      return false;
    }
  }

  /**
   * 创建回滚点
   */
  async createRollbackPoint(projectPath: string): Promise<string> {
    const rollbackId = `rollback-${Date.now()}`;
    const rollbackPath = path.join(projectPath, '.qa-agent', 'rollback', rollbackId);

    await this.copyDir(projectPath, rollbackPath, [
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
      await fs.access(rollbackPath);
    } catch {
      throw new Error(`Rollback point ${rollbackId} not found`);
    }

    // Clear target (except protected dirs) and restore
    await this.copyDir(rollbackPath, projectPath, []);
  }

  // 私有方法

  private async replaceInFile(filePath: string, search: string, replace: string): Promise<void> {
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      // File doesn't exist yet — create it with just the replace content.
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, replace, 'utf-8');
      return;
    }
    const newContent = search ? content.replace(search, replace) : replace;
    await fs.writeFile(filePath, newContent, 'utf-8');
  }

  private async insertInFile(filePath: string, line: number, content: string): Promise<void> {
    let existing: string;
    try {
      existing = await fs.readFile(filePath, 'utf-8');
    } catch {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      return;
    }
    const lines = existing.split('\n');
    lines.splice(Math.max(0, line - 1), 0, content);
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  }

  private async deleteInFile(filePath: string, search: string): Promise<void> {
    if (!search) return;
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      return;
    }
    await fs.writeFile(filePath, content.replace(search, ''), 'utf-8');
  }

  private async copyDir(source: string, target: string, exclude: string[]): Promise<void> {
    await fs.mkdir(target, { recursive: true });

    let entries;
    try {
      entries = await fs.readdir(source, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue;

      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await this.copyDir(sourcePath, targetPath, exclude);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }
}

export default FixEngine;
