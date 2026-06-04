/**
 * Core: Diagnose orchestration
 *
 * 单一真相：CLI 和 web API 都用同一份"运行诊断"流程。
 * 之前 web/api/diagnose.ts 和 cli/commands/diagnose.ts 两处各写一遍。
 */

import { Diagnosis } from '../types';
import { QAConfig } from '../config';
import { BuiltContext, buildSkillContext, cleanupSkillContext } from './context';

export interface RunDiagnoseOptions {
  /** Skill names to run. Default: registry's enabled skills (or all if none configured). */
  skills?: string[];
  /** Skills explicitly disabled by config (filtered out from the run). */
  disabledSkills?: string[];
  /** Logger level. Default: 'info'. */
  level?: 'debug' | 'info' | 'warn' | 'error';
}

export interface RunDiagnoseResult {
  project: import('../types').ProjectInfo;
  issues: Diagnosis[];
  results: Map<string, Diagnosis[]>;
  durationMs: number;
  /** Built context (kept so the caller can run further work or cleanup). */
  built: BuiltContext;
}

/**
 * Run a diagnose pass: build context, run each requested skill, collect issues.
 *
 * Skills not registered in the registry are silently skipped. Skills listed in
 * `disabledSkills` are excluded. If `skills` is empty, the registry's full set
 * (minus disabled) is used.
 *
 * @param projectPath - Absolute path to the project root.
 * @param config - QA-Agent config.
 * @param options - Skills filter, disabled list, logger level.
 */
export async function runDiagnose(
  projectPath: string,
  config: QAConfig,
  options: RunDiagnoseOptions = {}
): Promise<RunDiagnoseResult> {
  const startTime = Date.now();

  const built = await buildSkillContext(projectPath, config, { level: options.level });
  const { context, registry } = built;

  // Resolve which skills to run
  const disabled = options.disabledSkills ?? config.skills?.disabled ?? [];
  const requested =
    options.skills && options.skills.length > 0
      ? options.skills
      : (config.skills?.enabled ?? registry.getNames());

  const skillsToRun = requested.filter(
    (name: string) => registry.has(name) && !disabled.includes(name)
  );

  if (skillsToRun.length === 0) {
    // No skills selected — return empty but still allow cleanup.
    return {
      project: context.project,
      issues: [],
      results: new Map(),
      durationMs: Date.now() - startTime,
      built,
    };
  }

  const results = await registry.runDiagnosis(skillsToRun, context);

  const issues: Diagnosis[] = [];
  for (const [, diags] of results) {
    issues.push(...diags);
  }

  return {
    project: context.project,
    issues,
    results,
    durationMs: Date.now() - startTime,
    built,
  };
}

/**
 * Cleanup helper: tear down the registry used by `runDiagnose`.
 * Always call this when you're done with the result, even on error.
 */
export async function cleanupDiagnose(result: RunDiagnoseResult): Promise<void> {
  await cleanupSkillContext(result.built.registry, result.built.logger);
}
