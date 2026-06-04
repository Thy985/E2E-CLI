/**
 * Core: Project info resolution
 *
 * 单一真相：在 CLI 和 web API 之间共享"项目元信息"探测逻辑。
 * 之前 web/api/diagnose.ts + web/api/fix.ts + cli/commands/diagnose.ts
 * 三处各实现了一份，行为有微妙差异。
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { ProjectInfo } from '../types';
import { QAConfig } from '../config';

export interface GetProjectInfoOptions {
  /** QA-Agent 配置文件（可选，缺省走 fs.readFile） */
  config?: QAConfig;
}

/**
 * Resolve project info: prefer config values, fallback to package.json
 * auto-detection, fallback to defaults derived from `projectPath`.
 *
 * @param projectPath - Absolute path to the project root.
 * @param options - Optional config (used as the source of truth for name/type/framework).
 */
export async function getProjectInfo(
  projectPath: string,
  options: GetProjectInfoOptions = {}
): Promise<ProjectInfo> {
  const config = options.config;

  // Use config values as defaults
  let name = config?.project?.name || path.basename(projectPath);
  let type: ProjectInfo['type'] = config?.project?.type || 'webapp';
  let framework: string | undefined = config?.project?.framework;

  // Auto-detect from package.json if not in config
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

    if (!config?.project?.name) {
      name = packageJson.name || name;
    }

    if (!config?.project?.framework) {
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      if (deps.react) framework = 'react';
      else if (deps.vue) framework = 'vue';
      else if (deps.angular) framework = 'angular';
      else if (deps.svelte) framework = 'svelte';
      else if (deps.next) framework = 'next';
      else if (deps.nuxt) framework = 'nuxt';
    }

    if (!config?.project?.type) {
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      if (deps.express || deps.fastify || deps.koa) type = 'api';
      else if (packageJson.bin) type = 'cli';
      else if (deps.typescript && !deps.react && !deps.vue) type = 'library';
    }
  } catch {
    // package.json not found or unreadable — keep defaults
  }

  return {
    name,
    path: projectPath,
    type,
    framework,
  };
}
