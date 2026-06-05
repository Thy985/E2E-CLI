/**
 * Project 探测器：从 package.json 自动推断 name / type / framework / packageManager。
 * 原本在 cli/commands/diagnose.ts 与 engines/audit/index.ts 各写一份完全相同的 if 链，
 * 现在抽到这里，两处都改为调用 `detectProjectInfo`。
 */

import * as fsp from 'fs/promises';
import * as path from 'path';
import { ProjectInfo } from '../types';

interface PackageJson {
  name?: string;
  version?: string;
  bin?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const FRAMEWORK_DEPS = ['react', 'vue', 'angular', 'svelte', 'next', 'nuxt'] as const;
const API_DEPS = ['express', 'fastify', 'koa'] as const;

export interface ProjectDetectorOverrides {
  name?: string;
  type?: ProjectInfo['type'];
  framework?: string;
  packageManager?: ProjectInfo['packageManager'];
}

/**
 * 读取 + 解析 package.json；缺失或损坏时返回 null，调用方用默认值兜底。
 */
async function readPackageJson(projectPath: string): Promise<PackageJson | null> {
  try {
    const raw = await fsp.readFile(path.join(projectPath, 'package.json'), 'utf-8');
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

function detectFramework(deps: Record<string, string> | undefined): string | undefined {
  if (!deps) return undefined;
  for (const name of FRAMEWORK_DEPS) {
    if (deps[name]) return name;
  }
  return undefined;
}

function detectType(pkg: PackageJson | null, deps: Record<string, string> | undefined): ProjectInfo['type'] {
  if (!pkg) return 'webapp';
  if (!deps) return 'webapp';
  for (const name of API_DEPS) {
    if (deps[name]) return 'api';
  }
  if (pkg.bin) return 'cli';
  if (deps.typescript && !deps.react && !deps.vue) return 'library';
  return 'webapp';
}

async function detectPackageManager(projectPath: string): Promise<ProjectInfo['packageManager']> {
  try {
    const entries = await fsp.readdir(projectPath);
    if (entries.includes('pnpm-lock.yaml')) return 'pnpm';
    if (entries.includes('yarn.lock')) return 'yarn';
  } catch {
    /* ignore */
  }
  return 'npm';
}

/**
 * 公共入口：组装 ProjectInfo。
 * @param projectPath 项目根目录
 * @param overrides   用户在 config 里写死的字段（优先级最高）
 */
export async function detectProjectInfo(
  projectPath: string,
  overrides: ProjectDetectorOverrides = {}
): Promise<ProjectInfo> {
  const pkg = await readPackageJson(projectPath);
  const deps = pkg ? { ...pkg.dependencies, ...pkg.devDependencies } : undefined;

  const name = overrides.name ?? pkg?.name ?? path.basename(projectPath);
  const framework = overrides.framework ?? detectFramework(deps);
  const type = overrides.type ?? detectType(pkg, deps);
  const packageManager = overrides.packageManager ?? (await detectPackageManager(projectPath));

  return {
    name,
    path: projectPath,
    type,
    framework,
    packageManager,
  };
}
