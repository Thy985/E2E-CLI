/**
 * Core: Skill context construction
 *
 * 单一真相：CLI 和 web API 都用同一份"创建 SkillContext + 初始化 registry"流程。
 * 之前 web/api/diagnose.ts、web/api/fix.ts、cli/commands/diagnose.ts 三处各写一遍。
 */

import { SkillContext } from '../types';
import { QAConfig } from '../config';
import { createLogger, Logger } from '../utils/logger';
import { createSkillRegistry, getRegisteredSkills, SkillRegistry } from '../skills';
import { createModelClient } from '../models';
import { createTools } from '../tools';
import { createStorage } from '../storage';
import { getProjectInfo, GetProjectInfoOptions } from './project-info';

export interface BuildSkillContextOptions extends GetProjectInfoOptions {
  /** Logger level. Default: 'info'. */
  level?: 'debug' | 'info' | 'warn' | 'error';
  /** Suppress all output. Default: false. */
  quiet?: boolean;
  /** Custom parent logger (overrides `level`/`quiet` if provided). */
  logger?: Logger;
}

export interface BuiltContext {
  context: SkillContext;
  registry: SkillRegistry;
  logger: Logger;
}

/**
 * Build a SkillContext: resolve project info, create logger/registry/tools/model/storage,
 * register all built-in skills, initialize the registry.
 *
 * @param projectPath - Absolute path to the project root.
 * @param config - QA-Agent config (used to wire model credentials).
 * @param options - Logger level/quiet or custom parent logger.
 */
export async function buildSkillContext(
  projectPath: string,
  config: QAConfig,
  options: BuildSkillContextOptions = {}
): Promise<BuiltContext> {
  const logger =
    options.logger ??
    createLogger({
      level: options.level ?? 'info',
      quiet: options.quiet ?? false,
    });

  const projectInfo = await getProjectInfo(projectPath, { config });

  const registry = createSkillRegistry(logger);
  for (const skill of getRegisteredSkills()) {
    registry.register(skill);
  }

  const context: SkillContext = {
    project: projectInfo,
    config,
    logger: logger.child('Skill'),
    tools: createTools(projectPath),
    model: createModelClient({
      // Cast to any for the union literal: config is YAML-driven and may
      // contain provider strings we haven't pre-validated.
      provider: config.model?.provider as any,
      model: config.model?.model,
      apiKey: config.model?.apiKey,
      baseUrl: config.model?.baseUrl,
    }),
    storage: createStorage(),
  };

  await registry.initializeAll(context);

  return { context, registry, logger };
}

/**
 * Run cleanup for a built registry (best-effort; errors are logged, not thrown).
 */
export async function cleanupSkillContext(registry: SkillRegistry, logger?: Logger): Promise<void> {
  try {
    await registry.cleanupAll();
  } catch (e) {
    logger?.warn('Skill registry cleanup failed:', e);
  }
}
