/**
 * Core: Fix orchestration
 *
 * 单一真相：CLI 和 web API 都用同一份"预览修复"和"应用修复"流程。
 * 之前 web/api/fix.ts 和 cli/commands/fix.ts 各写一份 applyFix。
 *
 * 注意：批量 + 自动 approve 流程在 `engines/fix/batch.ts`（更复杂，涉及 sandbox），
 * 本文件只覆盖单条 / 给定 issues 列表的预览 + 应用。
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { Diagnosis, Fix, SkillContext } from '../types';
import { QAConfig } from '../config';
import { BuiltContext, buildSkillContext, cleanupSkillContext } from './context';

export interface PreviewFixesOptions {
  /** Skill names that own these issues. Default: each issue's `skill` field. */
  skills?: string[];
  level?: 'debug' | 'info' | 'warn' | 'error';
}

export interface PreviewFixesItem {
  fix: Fix;
  issue: Diagnosis;
}

export interface PreviewFixesResult {
  context: SkillContext;
  fixes: PreviewFixesItem[];
  /** Issues whose skill had no `fix` handler. */
  skipped: Diagnosis[];
  built: BuiltContext;
}

/**
 * Preview fixes for a list of issues: build context, call each issue's skill.fix.
 * Does NOT write any files.
 */
export async function previewFixes(
  projectPath: string,
  config: QAConfig,
  issues: Diagnosis[],
  options: PreviewFixesOptions = {}
): Promise<PreviewFixesResult> {
  if (!issues || issues.length === 0) {
    const built = await buildSkillContext(projectPath, config, { level: options.level });
    return { context: built.context, fixes: [], skipped: [], built };
  }

  const built = await buildSkillContext(projectPath, config, { level: options.level });
  const { context, registry } = built;

  const fixes: PreviewFixesItem[] = [];
  const skipped: Diagnosis[] = [];

  for (const issue of issues) {
    const skill = registry.get(issue.skill);
    if (!skill || !skill.fix) {
      skipped.push(issue);
      continue;
    }
    try {
      const fix = await skill.fix(issue, context);
      fixes.push({ fix, issue });
    } catch (e) {
      // Skip this issue but keep going
      skipped.push(issue);
    }
  }

  return { context, fixes, skipped, built };
}

export interface ApplyFixesOptions {
  /** Overwrite safety: refuse if file doesn't already exist (default: false). */
  requireExisting?: boolean;
}

export interface ApplyFixesResult {
  applied: number;
  failed: number;
  errors: string[];
}

export interface ApplyFixesInput {
  fixes: PreviewFixesItem[] | Array<{ fix: Fix; issue?: Diagnosis }>;
  projectPath: string;
  options?: ApplyFixesOptions;
}

/**
 * Apply a list of fixes to disk. Pure I/O: no registry, no model.
 * Each `change` is applied to its target file in the order given.
 */
export async function applyFixes(input: ApplyFixesInput): Promise<ApplyFixesResult> {
  const { fixes, projectPath, options = {} } = input;
  let applied = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const { fix } of fixes) {
    try {
      await applyOneFix(fix, projectPath, options);
      applied++;
    } catch (e: unknown) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${fix.description}: ${msg}`);
    }
  }

  return { applied, failed, errors: errors.length > 0 ? errors : undefined as unknown as string[] };
}

async function applyOneFix(fix: Fix, projectPath: string, options: ApplyFixesOptions): Promise<void> {
  for (const change of fix.changes) {
    const filePath = path.isAbsolute(change.file)
      ? change.file
      : path.join(projectPath, change.file);

    switch (change.type) {
      case 'replace': {
        if (!change.oldContent || !change.content) {
          throw new Error(`replace change missing oldContent/content: ${change.file}`);
        }
        const fileContent = await fs.readFile(filePath, 'utf-8');
        if (options.requireExisting !== false && !fileContent.includes(change.oldContent)) {
          throw new Error(`oldContent not found in ${change.file}`);
        }
        const newContent = fileContent.replace(change.oldContent, change.content);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, newContent, 'utf-8');
        break;
      }
      case 'insert': {
        if (!change.content || !change.position) {
          throw new Error(`insert change missing content/position: ${change.file}`);
        }
        let fileContent = '';
        try {
          fileContent = await fs.readFile(filePath, 'utf-8');
        } catch {
          // File doesn't exist — start from empty
        }
        const lines = fileContent.split('\n');
        const insertAt = Math.max(0, Math.min(change.position.line - 1, lines.length));
        lines.splice(insertAt, 0, change.content);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
        break;
      }
      default:
        throw new Error(`Unsupported change type: ${(change as { type: string }).type}`);
    }
  }
}

/**
 * Cleanup helper: tear down the registry used by `previewFixes`.
 */
export async function cleanupFixes(result: PreviewFixesResult): Promise<void> {
  await cleanupSkillContext(result.built.registry, result.built.logger);
}
