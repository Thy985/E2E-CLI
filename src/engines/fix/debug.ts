/**
 * Debug Fix Engine
 * Enhanced fix engine with detailed logging and debugging
 */

import * as fs from 'fs';
import * as path from 'path';
import { Fix, FileChange, SkillContext } from '../../types';
import { createLogger, Logger } from '../../utils/logger';

export interface DebugFixResult {
  success: boolean;
  fix: Fix;
  applied: boolean;
  changesApplied: number;
  changesFailed: number;
  details: {
    file: string;
    type: string;
    success: boolean;
    error?: string;
    before?: string;
    after?: string;
  }[];
  errors: string[];
}

export class DebugFixEngine {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || createLogger({ level: 'debug' });
  }

  /**
   * Apply fix with detailed debugging
   */
  async applyFixDebug(fix: Fix, projectPath: string): Promise<DebugFixResult> {
    const result: DebugFixResult = {
      success: false,
      fix,
      applied: false,
      changesApplied: 0,
      changesFailed: 0,
      details: [],
      errors: [],
    };

    this.logger.info('='.repeat(70));
    this.logger.info(`🔧 APPLYING FIX: ${fix.id}`);
    this.logger.info('='.repeat(70));
    this.logger.info(`Description: ${fix.description}`);
    this.logger.info(`Risk Level: ${fix.riskLevel}`);
    this.logger.info(`Auto-Applicable: ${fix.autoApplicable}`);
    this.logger.info(`Changes: ${fix.changes.length} files`);
    this.logger.info('');

    try {
      for (let i = 0; i < fix.changes.length; i++) {
        const change = fix.changes[i];
        this.logger.info(`-`.repeat(70));
        this.logger.info(`Change ${i + 1}/${fix.changes.length}:`);
        this.logger.info(`  File: ${change.file}`);
        this.logger.info(`  Type: ${change.type}`);
        
        const changeResult = await this.applyChangeDebug(change, projectPath);
        result.details.push(changeResult);
        
        if (changeResult.success) {
          result.changesApplied++;
          this.logger.info(`  ✅ SUCCESS`);
        } else {
          result.changesFailed++;
          result.errors.push(`Failed to apply change to ${change.file}: ${changeResult.error}`);
          this.logger.error(`  ❌ FAILED: ${changeResult.error}`);
        }
        this.logger.info('');
      }

      result.applied = result.changesApplied > 0 && result.changesFailed === 0;
      result.success = result.applied;

      this.logger.info('='.repeat(70));
      this.logger.info(`📊 FIX RESULT:`);
      this.logger.info(`  Applied: ${result.changesApplied}/${fix.changes.length}`);
      this.logger.info(`  Failed: ${result.changesFailed}/${fix.changes.length}`);
      this.logger.info(`  Success: ${result.success ? '✅ YES' : '❌ NO'}`);
      this.logger.info('='.repeat(70));

    } catch (error) {
      this.logger.error('❌ CRITICAL ERROR applying fix:', error);
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Apply single change with debugging
   */
  private async applyChangeDebug(
    change: FileChange,
    projectPath: string
  ): Promise<{
    file: string;
    type: string;
    success: boolean;
    error?: string;
    before?: string;
    after?: string;
  }> {
    const filePath = path.join(projectPath, change.file);
    const result: {
      file: string;
      type: string;
      success: boolean;
      error?: string;
      before?: string;
      after?: string;
    } = {
      file: change.file,
      type: change.type,
      success: false,
    };

    this.logger.debug(`  Full path: ${filePath}`);

    try {
      // Check if file exists
      const fileExists = fs.existsSync(filePath);
      this.logger.debug(`  File exists: ${fileExists}`);

      if (change.type === 'replace') {
        if (!fileExists) {
          result.error = `File not found: ${filePath}`;
          return result;
        }

        // Read original content
        const before = fs.readFileSync(filePath, 'utf-8');
        result.before = before.substring(0, 200) + (before.length > 200 ? '...' : '');
        
        this.logger.debug(`  Original content length: ${before.length}`);
        this.logger.debug(`  Search pattern: "${change.oldContent?.substring(0, 100)}${change.oldContent && change.oldContent.length > 100 ? '...' : ''}"`);
        this.logger.debug(`  Replace with: "${change.content?.substring(0, 100)}${change.content && change.content.length > 100 ? '...' : ''}"`);

        // Check if pattern exists
        if (!change.oldContent || !before.includes(change.oldContent)) {
          result.error = `Search pattern not found in file`;
          this.logger.warn(`  ⚠️ Pattern not found!`);
          this.logger.debug(`  Available content preview: ${before.substring(0, 200)}...`);
          return result;
        }

        // Apply replacement
        const after = before.replace(change.oldContent, change.content || '');
        fs.writeFileSync(filePath, after, 'utf-8');
        
        result.after = after.substring(0, 200) + (after.length > 200 ? '...' : '');
        result.success = true;
        
        this.logger.debug(`  New content length: ${after.length}`);

      } else if (change.type === 'insert') {
        if (!fileExists) {
          result.error = `File not found: ${filePath}`;
          return result;
        }

        const before = fs.readFileSync(filePath, 'utf-8');
        result.before = before.substring(0, 200) + '...';
        
        const lines = before.split('\n');
        const insertLine = change.position?.line || lines.length;
        
        this.logger.debug(`  Insert at line: ${insertLine}`);
        this.logger.debug(`  Content to insert: "${change.content?.substring(0, 100)}${change.content && change.content.length > 100 ? '...' : ''}"`);

        if (insertLine >= 0 && insertLine <= lines.length) {
          lines.splice(insertLine, 0, change.content || '');
          const after = lines.join('\n');
          fs.writeFileSync(filePath, after, 'utf-8');
          
          result.after = after.substring(0, 200) + '...';
          result.success = true;
          
          this.logger.debug(`  New content length: ${after.length}`);
        } else {
          result.error = `Invalid insert line: ${insertLine}`;
          this.logger.error(`  ❌ Invalid insert line`);
        }

      } else if (change.type === 'delete') {
        if (!fileExists) {
          result.error = `File not found: ${filePath}`;
          return result;
        }

        const before = fs.readFileSync(filePath, 'utf-8');
        result.before = before.substring(0, 200) + '...';
        
        this.logger.debug(`  Content to delete: "${change.oldContent?.substring(0, 100)}${change.oldContent && change.oldContent.length > 100 ? '...' : ''}"`);

        if (!change.oldContent || !before.includes(change.oldContent)) {
          result.error = `Content to delete not found`;
          this.logger.warn(`  ⚠️ Content to delete not found!`);
          return result;
        }

        const after = before.replace(change.oldContent, '');
        fs.writeFileSync(filePath, after, 'utf-8');
        
        result.after = after.substring(0, 200) + '...';
        result.success = true;
        
        this.logger.debug(`  New content length: ${after.length}`);

      } else {
        result.error = `Unknown change type: ${change.type}`;
        this.logger.error(`  ❌ Unknown change type: ${change.type}`);
      }

    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      this.logger.error(`  ❌ ERROR: ${result.error}`);
    }

    return result;
  }

  /**
   * Verify file content after fix
   */
  async verifyFix(fix: Fix, projectPath: string): Promise<{
    verified: boolean;
    checks: {
      file: string;
      exists: boolean;
      readable: boolean;
      containsExpected: boolean;
      errors: string[];
    }[];
  }> {
    this.logger.info('='.repeat(70));
    this.logger.info(`🔍 VERIFYING FIX: ${fix.id}`);
    this.logger.info('='.repeat(70));

    const checks: {
      file: string;
      exists: boolean;
      readable: boolean;
      containsExpected: boolean;
      errors: string[];
    }[] = [];

    for (const change of fix.changes) {
      const filePath = path.join(projectPath, change.file);
      const check = {
        file: change.file,
        exists: false,
        readable: false,
        containsExpected: false,
        errors: [] as string[],
      };

      try {
        // Check file exists
        check.exists = fs.existsSync(filePath);
        this.logger.info(`File: ${change.file}`);
        this.logger.info(`  Exists: ${check.exists ? '✅' : '❌'}`);

        if (!check.exists) {
          check.errors.push('File does not exist');
          checks.push(check);
          continue;
        }

        // Check readable
        const content = fs.readFileSync(filePath, 'utf-8');
        check.readable = true;
        this.logger.info(`  Readable: ✅`);

        // Check expected content
        if (change.type === 'replace' || change.type === 'insert') {
          check.containsExpected = content.includes(change.content || '');
          this.logger.info(`  Contains expected: ${check.containsExpected ? '✅' : '❌'}`);
          
          if (!check.containsExpected) {
            check.errors.push('Expected content not found');
            this.logger.debug(`  Expected: ${change.content?.substring(0, 100)}...`);
            this.logger.debug(`  Actual: ${content.substring(0, 100)}...`);
          }
        }

        if (change.type === 'replace' || change.type === 'delete') {
          const oldContentGone = !content.includes(change.oldContent || '');
          this.logger.info(`  Old content removed: ${oldContentGone ? '✅' : '❌'}`);
          
          if (!oldContentGone) {
            check.errors.push('Old content still present');
          }
        }

      } catch (error) {
        check.errors.push(error instanceof Error ? error.message : String(error));
        this.logger.error(`  Error: ${check.errors[check.errors.length - 1]}`);
      }

      checks.push(check);
      this.logger.info('');
    }

    const verified = checks.every(c => c.exists && c.readable && c.errors.length === 0);
    
    this.logger.info('='.repeat(70));
    this.logger.info(`📊 VERIFICATION RESULT: ${verified ? '✅ PASSED' : '❌ FAILED'}`);
    this.logger.info('='.repeat(70));

    return { verified, checks };
  }

  /**
   * Generate detailed fix report
   */
  generateDebugReport(results: DebugFixResult[]): string {
    const lines: string[] = [];
    
    lines.push('# Debug Fix Report\n');
    lines.push(`Generated: ${new Date().toISOString()}\n`);
    
    const totalApplied = results.filter(r => r.applied).length;
    const totalFailed = results.filter(r => !r.applied).length;
    
    lines.push(`## Summary\n`);
    lines.push(`- **Total Fixes**: ${results.length}`);
    lines.push(`- **Applied**: ${totalApplied}`);
    lines.push(`- **Failed**: ${totalFailed}`);
    lines.push(`- **Success Rate**: ${((totalApplied / results.length) * 100).toFixed(1)}%\n`);
    
    lines.push(`## Details\n`);
    for (const result of results) {
      lines.push(`### ${result.fix.id}`);
      lines.push(`- **Description**: ${result.fix.description}`);
      lines.push(`- **Applied**: ${result.applied ? '✅' : '❌'}`);
      lines.push(`- **Changes Applied**: ${result.changesApplied}/${result.fix.changes.length}`);
      lines.push(`- **Changes Failed**: ${result.changesFailed}`);
      
      if (result.details.length > 0) {
        lines.push(`- **Details**:`);
        for (const detail of result.details) {
          lines.push(`  - ${detail.file} (${detail.type}): ${detail.success ? '✅' : '❌'}`);
          if (!detail.success && detail.error) {
            lines.push(`    - Error: ${detail.error}`);
          }
        }
      }
      
      if (result.errors.length > 0) {
        lines.push(`- **Errors**:`);
        for (const error of result.errors) {
          lines.push(`  - ${error}`);
        }
      }
      lines.push('');
    }
    
    return lines.join('\n');
  }
}

export default DebugFixEngine;
