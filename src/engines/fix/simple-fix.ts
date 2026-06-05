/**
 * Simple Fix Engine
 * A simplified fix engine for testing and debugging
 */

import * as fs from 'fs';
import * as path from 'path';
import { Fix, FileChange } from '../../types';
import { createLogger, Logger } from '../../utils/logger';
import { replaceInFile, insertInFile } from '../../utils/file-ops';

export interface SimpleFixResult {
  success: boolean;
  fix: Fix;
  applied: boolean;
  error?: string;
  details: {
    file: string;
    type: string;
    success: boolean;
    error?: string;
  }[];
}

export class SimpleFixEngine {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || createLogger({ level: 'info' });
  }

  /**
   * Apply a fix with detailed logging
   */
  async applyFix(fix: Fix, projectPath: string): Promise<SimpleFixResult> {
    this.logger.info('='.repeat(70));
    this.logger.info(`🔧 APPLYING FIX: ${fix.id}`);
    this.logger.info('='.repeat(70));
    this.logger.info(`Description: ${fix.description}`);
    this.logger.info(`Risk Level: ${fix.riskLevel}`);
    this.logger.info(`Changes: ${fix.changes.length} files`);
    this.logger.info('');

    const result: SimpleFixResult = {
      success: false,
      fix,
      applied: false,
      details: [],
    };

    try {
      for (let i = 0; i < fix.changes.length; i++) {
        const change = fix.changes[i];
        this.logger.info(`-`.repeat(70));
        this.logger.info(`Change ${i + 1}/${fix.changes.length}:`);
        this.logger.info(`  File: ${change.file}`);
        this.logger.info(`  Type: ${change.type}`);
        
        const changeResult = await this.applyChange(change, projectPath);
        result.details.push(changeResult);
        
        if (changeResult.success) {
          this.logger.info(`  ✅ SUCCESS`);
        } else {
          this.logger.error(`  ❌ FAILED: ${changeResult.error}`);
        }
        this.logger.info('');
      }

      result.applied = result.details.every(d => d.success);
      result.success = result.applied;

      this.logger.info('='.repeat(70));
      this.logger.info(`📊 RESULT: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      this.logger.info('='.repeat(70));

    } catch (error) {
      this.logger.error('❌ CRITICAL ERROR:', error);
      result.error = error instanceof Error ? error.message : String(error);
    }

    return result;
  }

  private async applyChange(
    change: FileChange,
    projectPath: string
  ): Promise<{ file: string; type: string; success: boolean; error?: string }> {
    const filePath = path.join(projectPath, change.file);
    const result: {
      file: string;
      type: string;
      success: boolean;
      error?: string;
    } = {
      file: change.file,
      type: change.type,
      success: false,
    };

    this.logger.debug(`  Full path: ${filePath}`);

    try {
      const fileExists = fs.existsSync(filePath);
      this.logger.debug(`  File exists: ${fileExists}`);

      if (!fileExists) {
        result.error = `File not found: ${filePath}`;
        return result;
      }

      if (change.type === 'replace') {
        if (!change.oldContent) {
          result.error = 'No search pattern provided';
          return result;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content.includes(change.oldContent)) {
          result.error = `Search pattern not found in file`;
          this.logger.warn(`  ⚠️ Pattern not found!`);
          this.logger.debug(`  Looking for: ${change.oldContent.substring(0, 50)}...`);
          return result;
        }

        await replaceInFile(filePath, change.oldContent, change.content || '');
        result.success = true;

      } else if (change.type === 'insert') {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const insertLine = change.position?.line ?? lines.length;

        await insertInFile(filePath, insertLine, change.content || '');
        result.success = true;

      } else {
        result.error = `Unknown change type: ${change.type}`;
      }

    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }

    return result;
  }
}

export default SimpleFixEngine;
