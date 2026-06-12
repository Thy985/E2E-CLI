/**
 * Fix Engine
 *
 * Core functionality:
 * 1. Risk assessment (file criticality, change size, operation type)
 * 2. Sandbox preview
 * 3. Apply fixes (with pre-flight validation and atomic apply)
 * 4. Verify fixes
 * 5. Rollback mechanism (diff-based, file-level backup)
 */

import * as fs from 'fs';
import * as path from 'path';
import { Diagnosis, Fix, FileChange } from '../../types';
import { SandboxManager } from '../sandbox';
import { replaceInFile, insertInFile, deleteInFile } from '../../utils/file-ops';
import {
  FileNotFoundError,
  ContentNotFoundError,
  PreFlightValidationError,
  RollbackError,
} from './errors';

export interface FixEngineConfig {
  autoApproveLowRisk: boolean;
  sandboxEnabled: boolean;
  previewBeforeApply: boolean;
  verifyAfterFix: boolean;
  compileCheck: boolean;
}

export interface FixResult {
  success: boolean;
  fix: Fix;
  applied: boolean;
  verified: boolean;
  compileCheckPassed?: boolean;
  compileCheckOutput?: string;
  previewUrl?: string;
  beforeScreenshot?: string;
  afterScreenshot?: string;
  diffPercentage?: number;
  error?: string;
}

/** Metadata for a rollback point. */
interface RollbackMetadata {
  id: string;
  timestamp: number;
  changedFiles: string[];
  // Maps each changed relative-file path to the backup copy inside the rollback dir
  backupMap: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Risk-assessment helpers
// ---------------------------------------------------------------------------

/** Patterns that identify critical configuration / manifest files. */
const CRITICAL_FILE_PATTERNS = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^\.?gitignore$/,
  /^\.?eslintrc/,
  /^\.?prettierrc/,
  /^tsconfig\.json$/,
  /^tsconfig\./,
  /^webpack\.config/,
  /^vite\.config/,
  /^rollup\.config/,
  /^babel\.config/,
  /^\.babelrc$/,
  /^jest\.config/,
  /^next\.config/,
  /^nuxt\.config/,
  /^tailwind\.config/,
  /^postcss\.config/,
  /^\.env/,
  /^docker-compose/,
  /^Dockerfile$/,
  /^nginx\.conf$/,
  /\.config\.(js|ts|mjs|cjs|json|yaml|yml)$/,
] as const;

/** Returns true when the relative file path is considered critical. */
function isCriticalFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return CRITICAL_FILE_PATTERNS.some((p) => p.test(base));
}

/**
 * Compute the ratio of characters being replaced.
 * Returns a number in [0, 1].
 */
function changeSizeRatio(change: FileChange, originalContent: string): number {
  if (originalContent.length === 0) {
    return change.content ? 1 : 0;
  }
  if (change.type === 'replace') {
    // How much of the file is being replaced?
    const oldLen = (change.oldContent || '').length;
    const newLen = (change.content || '').length;
    return Math.max(oldLen, newLen) / originalContent.length;
  }
  if (change.type === 'insert') {
    return (change.content || '').length / originalContent.length;
  }
  if (change.type === 'delete') {
    return (change.oldContent || '').length / originalContent.length;
  }
  return 0;
}

/** Whether the change is structural (alters logic / structure) vs cosmetic. */
function isStructuralChange(change: FileChange): boolean {
  const content = change.content || change.oldContent || '';
  // Heuristic: cosmetic if only whitespace / comment changes
  const withoutComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return withoutComments.trim().length > 0;
}

/** Count how many changes target the same file. */
function groupChangesByFile(changes: FileChange[]): Map<string, FileChange[]> {
  const map = new Map<string, FileChange[]>();
  for (const c of changes) {
    const arr = map.get(c.file) || [];
    arr.push(c);
    map.set(c.file, arr);
  }
  return map;
}

// ---------------------------------------------------------------------------
// FixEngine
// ---------------------------------------------------------------------------

export class FixEngine {
  private sandboxManager: SandboxManager;
  private config: FixEngineConfig;

  constructor(config: FixEngineConfig) {
    this.sandboxManager = new SandboxManager();
    this.config = config;
  }

  /**
   * Assess fix risk based on multiple dimensions:
   * - File criticality (package.json, config files = high risk)
   * - Change size ratio (replacing >30% of file = high risk)
   * - Operation type (delete is always medium+, insert into config = high)
   * - Multiple changes to the same file
   * - Structural vs cosmetic changes
   */
  assessRisk(fix: Fix, projectPath?: string): 'low' | 'medium' | 'high' {
    if (!fix.changes || fix.changes.length === 0) {
      return 'low';
    }

    const fileGroups = groupChangesByFile(fix.changes);
    const fileCount = fileGroups.size;

    // ---- High-risk signals ----

    // Any critical file touched → high
    for (const [filePath] of fileGroups) {
      if (isCriticalFile(filePath)) {
        return 'high';
      }
    }

    // Delete operation on potentially non-empty file → high
    if (fix.changes.some((c) => c.type === 'delete' && (c.oldContent || '').length > 0)) {
      return 'high';
    }

    // Large change ratio (>30% of file) → high
    if (projectPath) {
      for (const change of fix.changes) {
        try {
          const fullPath = path.join(projectPath, change.file);
          if (fs.existsSync(fullPath)) {
            const originalContent = fs.readFileSync(fullPath, 'utf-8');
            if (changeSizeRatio(change, originalContent) > 0.3) {
              return 'high';
            }
          }
        } catch {
          // If we can't read the file, conservatively mark high risk
          return 'high';
        }
      }
    }

    // >5 files → high
    if (fileCount > 5) {
      return 'high';
    }

    // Multiple changes to same file → medium or high
    for (const [, changes] of fileGroups) {
      if (changes.length > 1) {
        // Multiple structural changes to same file → high
        if (changes.some(isStructuralChange)) {
          return 'high';
        }
      }
    }

    // ---- Medium-risk signals ----

    // Insert into any file → at least medium
    if (fix.changes.some((c) => c.type === 'insert')) {
      return 'medium';
    }

    // Delete (even if oldContent is empty/unknown) → at least medium
    if (fix.changes.some((c) => c.type === 'delete')) {
      return 'medium';
    }

    // Cross-file changes → medium
    if (fileCount > 1) {
      return 'medium';
    }

    // Structural changes → medium
    if (fix.changes.some(isStructuralChange)) {
      return 'medium';
    }

    // Single-file, single replace, small → low
    if (fileCount === 1 && fix.changes.length === 1 && fix.changes[0].type === 'replace') {
      return 'low';
    }

    return 'medium';
  }

  /**
   * Preview fix in sandbox
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
    try {
      // 1. Create sandbox
      const sandbox = await this.sandboxManager.create({
        projectPath,
        port: 3456,
      });
      sandboxId = sandbox.id;

      // 2. Start original version and capture screenshot
      const beforeScreenshot = path.join(projectPath, '.qa-agent', 'before.png');
      await this.sandboxManager.startServer(sandbox.id, 3456);
      await this.sandboxManager.captureScreenshot(sandbox.id, beforeScreenshot);

      // 3. Apply fix
      await this.sandboxManager.applyFix(sandbox.id, fix);

      // 4. Restart server and capture screenshot
      const fixedUrl = await this.sandboxManager.startServer(sandbox.id, 3457);
      const afterScreenshot = path.join(projectPath, '.qa-agent', 'after.png');
      await this.sandboxManager.captureScreenshot(sandbox.id, afterScreenshot);

      // 5. Visual diff
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
          // cleanup failure does not block main flow
        }
      }
    }
  }

  /**
   * Pre-flight validation for a single change.
   * Returns a descriptive error or undefined when validation passes.
   */
  private async validateChange(
    change: FileChange,
    projectPath: string
  ): Promise<Error | undefined> {
    const filePath = path.join(projectPath, change.file);

    // File must exist for all operations
    if (!fs.existsSync(filePath)) {
      return new FileNotFoundError(filePath);
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    if (change.type === 'replace') {
      if (!change.oldContent) {
        return new PreFlightValidationError(
          `replace operation requires oldContent for file "${change.file}"`
        );
      }
      if (!content.includes(change.oldContent)) {
        return new ContentNotFoundError(filePath, change.oldContent);
      }
    }

    if (change.type === 'delete') {
      if (!change.oldContent) {
        return new PreFlightValidationError(
          `delete operation requires oldContent for file "${change.file}"`
        );
      }
      if (!content.includes(change.oldContent)) {
        return new ContentNotFoundError(filePath, change.oldContent);
      }
    }

    // Insert requires a valid line number
    if (change.type === 'insert') {
      const lines = content.split('\n');
      const line = change.position?.line ?? 0;
      if (line < 0 || line > lines.length) {
        return new PreFlightValidationError(
          `insert line ${line} out of range for file "${change.file}" (has ${lines.length} lines)`
        );
      }
    }

    return undefined;
  }

  /**
   * Apply fix with:
   * - Pre-flight validation for every change
   * - Atomic apply (all-or-nothing via in-memory backup)
   * - Optional compilation check after apply
   */
  async applyFix(fix: Fix, projectPath: string): Promise<FixResult> {
    const appliedFiles: Map<string, string> = new Map();
    const appliedChanges: string[] = [];

    try {
      // Phase 1: Pre-flight validation
      for (const change of fix.changes) {
        const err = await this.validateChange(change, projectPath);
        if (err) {
          return {
            success: false,
            fix,
            applied: false,
            verified: false,
            error: err.message,
          };
        }
      }

      // Phase 2: Backup original content of every affected file (in-memory)
      const fileSet = new Set(fix.changes.map((c) => c.file));
      for (const relPath of fileSet) {
        const fullPath = path.join(projectPath, relPath);
        appliedFiles.set(relPath, fs.readFileSync(fullPath, 'utf-8'));
      }

      // Phase 3: Apply all changes
      for (const change of fix.changes) {
        const filePath = path.join(projectPath, change.file);

        if (change.type === 'replace') {
          await replaceInFile(filePath, change.oldContent || '', change.content || '');
        } else if (change.type === 'insert') {
          await insertInFile(filePath, change.position?.line || 0, change.content || '');
        } else if (change.type === 'delete') {
          await deleteInFile(filePath, change.oldContent || '');
        }

        appliedChanges.push(change.file);
      }

      // Phase 3.5: Optional compilation check
      if (this.config.compileCheck) {
        const compileResult = await this.runCompileCheck(projectPath);
        if (!compileResult.success) {
          // Rollback files to original content
          for (const [relPath, originalContent] of appliedFiles) {
            const fullPath = path.join(projectPath, relPath);
            fs.writeFileSync(fullPath, originalContent, 'utf-8');
          }
          return {
            success: false,
            fix,
            applied: false,
            verified: false,
            compileCheckPassed: false,
            compileCheckOutput: compileResult.output,
            error: `Compilation check failed:\n${compileResult.output}`,
          };
        }
        return {
          success: true,
          fix,
          applied: true,
          verified: false,
          compileCheckPassed: true,
        };
      }

      return {
        success: true,
        fix,
        applied: true,
        verified: false,
      };
    } catch (error) {
      // Phase 4: Atomic rollback – restore all files to their original content
      for (const [relPath, originalContent] of appliedFiles) {
        try {
          const fullPath = path.join(projectPath, relPath);
          fs.writeFileSync(fullPath, originalContent, 'utf-8');
        } catch (rollbackError) {
          // If rollback itself fails, we have a serious problem
          const msg =
            error instanceof Error ? error.message : String(error);
          return {
            success: false,
            fix,
            applied: false,
            verified: false,
            error: `Apply failed (${msg}); partial rollback attempted — some files may be inconsistent.`,
          };
        }
      }

      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        fix,
        applied: false,
        verified: false,
        error: msg,
      };
    }
  }

  /**
   * Run `tsc --noEmit` in the given project directory.
   * Uses `npx tsc` so that the project's own TypeScript version is used.
   */
  private async runCompileCheck(projectPath: string): Promise<{ success: boolean; output: string }> {
    const { execFile } = await import('child_process');

    return new Promise((resolve) => {
      execFile(
        'npx',
        ['tsc', '--noEmit'],
        { cwd: projectPath, timeout: 60_000 },
        (error, stdout, stderr) => {
          const output = String(stdout) + String(stderr);
          // tsc returns error code 2 on type errors, null on success
          resolve({
            success: error === null,
            output,
          });
        }
      );
    });
  }

  /**
   * Verify fix: apply in sandbox, run compilation check, then run tests.
   * Original project stays clean.
   */
  async verifyFix(fix: Fix, projectPath: string): Promise<{
    success: boolean;
    compileCheckPassed: boolean;
    testsPassed: boolean;
    compileOutput?: string;
    testOutput?: string;
  }> {
    let sandboxId: string | undefined;
    try {
      const sandbox = await this.sandboxManager.create({ projectPath });
      sandboxId = sandbox.id;
      await this.sandboxManager.applyFix(sandbox.id, fix);

      // Step 1: Compilation check
      let compileCheckPassed = false;
      let compileOutput: string | undefined;
      if (this.config.compileCheck) {
        const compileResult = await this.sandboxManager.runTypeCheck(sandbox.id);
        compileCheckPassed = compileResult.success;
        compileOutput = compileResult.output;
        if (!compileCheckPassed) {
          return {
            success: false,
            compileCheckPassed: false,
            testsPassed: false,
            compileOutput,
          };
        }
      } else {
        compileCheckPassed = true;
      }

      // Step 2: Run tests
      const { success: testsPassed, output: testOutput } = await this.sandboxManager.runTests(sandbox.id);

      return {
        success: compileCheckPassed && testsPassed,
        compileCheckPassed,
        testsPassed,
        compileOutput,
        testOutput,
      };
    } catch {
      return {
        success: false,
        compileCheckPassed: false,
        testsPassed: false,
      };
    } finally {
      if (sandboxId) {
        try {
          await this.sandboxManager.destroy(sandboxId);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  /**
   * Create a rollback point.
   *
   * Instead of copying the entire project directory, this method only
   * backs up the specific files that will be changed, storing them in
   * `.qa-agent/rollback/<id>/backups/` along with a metadata.json file.
   */
  async createRollbackPoint(
    projectPath: string,
    changes: FileChange[]
  ): Promise<string> {
    const rollbackId = `rollback-${Date.now()}`;
    const rollbackDir = path.join(projectPath, '.qa-agent', 'rollback', rollbackId);
    const backupDir = path.join(rollbackDir, 'backups');

    // Ensure directories exist
    fs.mkdirSync(backupDir, { recursive: true });

    const changedFiles = new Set(changes.map((c) => c.file));
    const backupMap: Record<string, string> = {};

    for (const relPath of changedFiles) {
      const srcPath = path.join(projectPath, relPath);
      if (!fs.existsSync(srcPath)) {
        continue; // skip files that don't exist yet (e.g. new inserts)
      }
      const destPath = path.join(backupDir, relPath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      backupMap[relPath] = destPath;
    }

    // Write metadata
    const metadata: RollbackMetadata = {
      id: rollbackId,
      timestamp: Date.now(),
      changedFiles: Array.from(changedFiles),
      backupMap,
    };
    fs.writeFileSync(
      path.join(rollbackDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );

    return rollbackId;
  }

  /**
   * Restore a rollback point.
   *
   * Only the files that were backed up are restored from the backup
   * directory, making this much faster than a full directory copy.
   */
  async rollback(rollbackId: string, projectPath: string): Promise<void> {
    const rollbackDir = path.join(projectPath, '.qa-agent', 'rollback', rollbackId);
    const metadataPath = path.join(rollbackDir, 'metadata.json');

    if (!fs.existsSync(metadataPath)) {
      throw new RollbackError(`Rollback point "${rollbackId}" not found at ${metadataPath}`);
    }

    const metadata: RollbackMetadata = JSON.parse(
      fs.readFileSync(metadataPath, 'utf-8')
    );

    for (const relPath of metadata.changedFiles) {
      const backupPath = path.join(rollbackDir, 'backups', relPath);
      const targetPath = path.join(projectPath, relPath);

      if (fs.existsSync(backupPath)) {
        // Restore from backup
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(backupPath, targetPath);
      } else {
        // Backup doesn't exist — the file was likely new; remove it
        if (fs.existsSync(targetPath)) {
          fs.rmSync(targetPath, { recursive: true, force: true });
        }
      }
    }

    // Clean up the rollback directory
    await fs.promises.rm(rollbackDir, { recursive: true, force: true });
  }
}

export default FixEngine;
