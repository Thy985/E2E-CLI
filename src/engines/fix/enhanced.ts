/**
 * Enhanced Fix Engine
 * Applies fixes with rollback support and verification
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { Fix, FileChange, SkillContext } from '../../types';
import { createLogger, Logger } from '../../utils/logger';
import { RollbackManager } from './rollback';
import { VerifyEngine } from '../verify';

export interface FixEngineOptions {
  autoApproveLowRisk: boolean;
  autoApproveMediumRisk: boolean;
  autoApproveHighRisk: boolean;
  sandboxEnabled: boolean;
  previewBeforeApply: boolean;
  verifyAfterApply: boolean;
  createRollbackPoint: boolean;
}

export interface FixResult {
  success: boolean;
  fix: Fix;
  applied: boolean;
  verified: boolean;
  rollbackId?: string;
  errors: string[];
  warnings: string[];
}

export class FixEngine {
  private options: FixEngineOptions;
  private logger: Logger;
  private rollbackManager: RollbackManager;
  private verifyEngine: VerifyEngine;

  constructor(options: Partial<FixEngineOptions> = {}, logger?: Logger) {
    this.options = {
      autoApproveLowRisk: true,
      autoApproveMediumRisk: false,
      autoApproveHighRisk: false,
      sandboxEnabled: false,
      previewBeforeApply: false,
      verifyAfterApply: true,
      createRollbackPoint: true,
      ...options,
    };
    this.logger = logger || createLogger({ level: 'info' });
    this.rollbackManager = new RollbackManager(this.logger);
    this.verifyEngine = new VerifyEngine(this.logger);
  }

  /**
   * Apply a single fix
   */
  async applyFix(fix: Fix, projectPath: string, context?: SkillContext): Promise<FixResult> {
    const result: FixResult = {
      success: false,
      fix,
      applied: false,
      verified: false,
      errors: [],
      warnings: [],
    };

    this.logger.info(`Applying fix: ${fix.id}`);
    this.logger.info(`Description: ${fix.description}`);
    this.logger.info(`Risk Level: ${fix.riskLevel}`);
    this.logger.info(`Changes: ${fix.changes.length} files`);

    // Check auto-approval
    const shouldAutoApprove = this.shouldAutoApprove(fix.riskLevel);
    if (!shouldAutoApprove) {
      this.logger.info(`Fix requires manual approval (risk: ${fix.riskLevel})`);
      result.warnings.push(`Fix requires manual approval (risk: ${fix.riskLevel})`);
      return result;
    }

    // Create rollback point
    let rollbackId: string | undefined;
    if (this.options.createRollbackPoint) {
      const affectedFiles = fix.changes.map(c => c.file);
      rollbackId = await this.rollbackManager.createRollbackPoint(
        projectPath,
        affectedFiles,
        `Before applying fix: ${fix.description}`
      );
      result.rollbackId = rollbackId;
      this.logger.info(`Rollback point created: ${rollbackId}`);
    }

    try {
      // Apply each change
      for (const change of fix.changes) {
        await this.applyChange(change, projectPath);
      }

      result.applied = true;
      this.logger.info(`✅ Fix applied: ${fix.id}`);

      // Verify fix if context provided
      if (this.options.verifyAfterApply && context) {
        this.logger.info(`Verifying fix: ${fix.id}`);
        const verifyResult = await this.verifyEngine.verifyFix(fix, context);
        result.verified = verifyResult.success;

        if (!verifyResult.success) {
          result.warnings.push(...verifyResult.errors);
          this.logger.warn(`⚠️ Fix verification issues: ${fix.id}`);

          // Rollback if verification failed
          if (rollbackId && verifyResult.diff.new > 0) {
            this.logger.info(`Rolling back fix due to new issues introduced`);
            await this.rollbackManager.rollback(rollbackId);
            result.applied = false;
            result.errors.push('Fix rolled back due to verification failure');
          }
        } else {
          this.logger.info(`✅ Fix verified: ${fix.id}`);
        }
      }

      result.success = result.applied && (!this.options.verifyAfterApply || result.verified);

    } catch (error) {
      this.logger.error(`❌ Failed to apply fix: ${fix.id}`, error);
      result.errors.push(error instanceof Error ? error.message : String(error));

      // Rollback on error
      if (rollbackId) {
        this.logger.info(`Rolling back due to error`);
        await this.rollbackManager.rollback(rollbackId);
        result.warnings.push('Changes rolled back due to error');
      }
    }

    return result;
  }

  /**
   * Apply multiple fixes
   */
  async applyFixes(
    fixes: Fix[],
    projectPath: string,
    context?: SkillContext
  ): Promise<FixResult[]> {
    this.logger.info(`Applying ${fixes.length} fixes`);

    const results: FixResult[] = [];

    for (const fix of fixes) {
      const result = await this.applyFix(fix, projectPath, context);
      results.push(result);

      // Stop on critical error
      if (!result.success && result.errors.length > 0 && !result.applied) {
        this.logger.error(`Critical error, stopping fix application`);
        break;
      }
    }

    // Summary
    const appliedCount = results.filter(r => r.applied).length;
    const verifiedCount = results.filter(r => r.verified).length;
    const failedCount = results.filter(r => !r.success).length;

    this.logger.info(`\n📊 Fix Application Summary:`);
    this.logger.info(`   ✅ Applied: ${appliedCount}/${results.length}`);
    this.logger.info(`   ✅ Verified: ${verifiedCount}/${results.length}`);
    this.logger.info(`   ❌ Failed: ${failedCount}/${results.length}`);

    return results;
  }

  /**
   * Rollback to a specific point
   */
  async rollback(rollbackId: string): Promise<boolean> {
    this.logger.info(`Rolling back: ${rollbackId}`);
    return await this.rollbackManager.rollback(rollbackId);
  }

  /**
   * List available rollback points
   */
  async listRollbackPoints(projectPath?: string) {
    return await this.rollbackManager.listRollbackPoints(projectPath);
  }

  /**
   * Preview a fix without applying
   */
  async previewFix(fix: Fix, projectPath: string): Promise<string> {
    const lines: string[] = [];

    lines.push(`# Fix Preview: ${fix.id}\n`);
    lines.push(`**Description**: ${fix.description}`);
    lines.push(`**Risk Level**: ${fix.riskLevel}`);
    lines.push(`**Auto-Applicable**: ${fix.autoApplicable ? 'Yes' : 'No'}\n`);

    lines.push(`## Changes (${fix.changes.length} files)\n`);

    for (const change of fix.changes) {
      const filePath = path.join(projectPath, change.file);
      lines.push(`### ${change.file}`);
      lines.push(`**Type**: ${change.type}\n`);

      if (change.type === 'replace') {
        lines.push('**Before**:');
        lines.push('```');
        lines.push(change.oldContent || '(not available)');
        lines.push('```\n');
        lines.push('**After**:');
        lines.push('```');
        lines.push(change.content || '(not available)');
        lines.push('```\n');
      } else if (change.type === 'insert') {
        lines.push(`**Insert at line**: ${change.position?.line || 'end'}`);
        lines.push('```');
        lines.push(change.content || '');
        lines.push('```\n');
      }
    }

    if (fix.verificationSteps && fix.verificationSteps.length > 0) {
      lines.push('## Verification Steps\n');
      for (const step of fix.verificationSteps) {
        lines.push(`- ${step}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private shouldAutoApprove(riskLevel: string): boolean {
    switch (riskLevel) {
      case 'low':
        return this.options.autoApproveLowRisk;
      case 'medium':
        return this.options.autoApproveMediumRisk;
      case 'high':
        return this.options.autoApproveHighRisk;
      default:
        return false;
    }
  }

  private async applyChange(change: FileChange, projectPath: string): Promise<void> {
    const filePath = path.join(projectPath, change.file);

    if (change.type === 'replace') {
      await this.replaceInFile(filePath, change.oldContent || '', change.content || '');
    } else if (change.type === 'insert') {
      await this.insertInFile(filePath, change.position?.line || 0, change.content || '');
    } else if (change.type === 'delete') {
      await this.deleteInFile(filePath, change.oldContent || '');
    }
  }

  private async replaceInFile(filePath: string, search: string, replace: string): Promise<void> {
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err && err.code === 'ENOENT') {
        // File doesn't exist — create the directory and file with the replace content
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, replace, 'utf-8');
        this.logger.debug(`Created ${filePath}`);
        return;
      }
      throw error;
    }

    if (!search) {
      // No search pattern: overwrite the file with the replace content
      await fs.writeFile(filePath, replace, 'utf-8');
      this.logger.debug(`Overwrote ${filePath}`);
      return;
    }

    const newContent = content.replace(search, replace);

    if (content === newContent) {
      this.logger.warn(`No changes made to ${filePath} - pattern not found`);
    } else {
      await fs.writeFile(filePath, newContent, 'utf-8');
      this.logger.debug(`Replaced in ${filePath}`);
    }
  }

  private async insertInFile(filePath: string, line: number, content: string): Promise<void> {
    let existing: string;
    try {
      existing = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err && err.code === 'ENOENT') {
        // File doesn't exist — create it with the content
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf-8');
        this.logger.debug(`Created ${filePath} with content`);
        return;
      }
      throw error;
    }

    const lines = existing.split('\n');
    // `line` is 1-based (matches the FileChange.position convention).
    // Clamp into [0, lines.length] so 0 means prepend and `lines.length` means append.
    const insertAt = Math.max(0, Math.min(line - 1, lines.length));
    lines.splice(insertAt, 0, content);
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
    this.logger.debug(`Inserted at line ${insertAt} in ${filePath}`);
  }

  private async deleteInFile(filePath: string, content: string): Promise<void> {
    if (!content) {
      // No search content: delete the whole file
      try {
        await fs.unlink(filePath);
        this.logger.debug(`Deleted ${filePath}`);
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err && err.code !== 'ENOENT') {
          throw error;
        }
      }
      return;
    }

    let existing: string;
    try {
      existing = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err && err.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    const newContent = existing.replace(content, '');
    if (existing === newContent) {
      this.logger.warn(`No content removed from ${filePath} - pattern not found`);
    } else {
      await fs.writeFile(filePath, newContent, 'utf-8');
      this.logger.debug(`Deleted content from ${filePath}`);
    }
  }
}

export default FixEngine;
