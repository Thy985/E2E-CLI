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
    // 基于变更类型和范围评估风险
    if (fix.changes.length === 1 && fix.changes[0].type === 'replace') {
      const change = fix.changes[0];
      // 简单的 CSS 变量替换是低风险
      if (typeof change.search === 'string' && change.search.startsWith('#')) {
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

    try {
      // 1. 创建沙箱
      const sandbox = await this.sandboxManager.create({
        projectPath,
        port: 3456,
      });

      // 2. 启动原始版本并截图
      const originalUrl = await this.sandboxManager.startServer(sandbox.id, 3456);
      const beforeScreenshot = path.join(projectPath, '.qa-agent', 'before.png');
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

      // 6. 清理沙箱
      await this.sandboxManager.destroy(sandbox.id);

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
          await this.replaceInFile(filePath, change.search, change.replace);
        } else if (change.type === 'insert') {
          await this.insertInFile(filePath, change.line!, change.content!);
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
   * 验证修复
   */
  async verifyFix(fix: Fix, projectPath: string): Promise<boolean> {
    // 运行测试验证修复
    try {
      const { success } = await this.sandboxManager.runTests('test-instance');
      return success;
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
    
    // 复制当前项目状态
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
    
    if (!fs.existsSync(rollbackPath)) {
      throw new Error(`Rollback point ${rollbackId} not found`);
    }

    // 恢复文件
    await this.copyDir(rollbackPath, projectPath, []);
  }

  // 私有方法

  private async replaceInFile(filePath: string, search: string | RegExp, replace: string): Promise<void> {
    const fs = await import('fs');
    const content = fs.readFileSync(filePath, 'utf-8');
    const newContent = content.replace(search, replace);
    fs.writeFileSync(filePath, newContent, 'utf-8');
  }

  private async insertInFile(filePath: string, line: number, content: string): Promise<void> {
    const fs = await import('fs');
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    lines.splice(line, 0, content);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  }

  private async copyDir(source: string, target: string, exclude: string[]): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');

    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }

    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue;

      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await this.copyDir(sourcePath, targetPath, exclude);
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }
}

import * as path from 'path';
import * as fs from 'fs';

export default FixEngine;