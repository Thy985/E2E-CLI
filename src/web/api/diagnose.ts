/**
 * Diagnose API Routes
 */

import { Hono } from 'hono';
import { createSkillRegistry, getRegisteredSkills } from '../../skills';
import { createModelClient } from '../../models';
import { createTools } from '../../tools';
import { createStorage } from '../../storage';
import { createLogger } from '../../utils/logger';
import { SkillContext } from '../../types';
import { loadConfig } from '../../config';
import * as path from 'path';
import * as fs from 'fs/promises';

export const diagnoseRouter = new Hono();

diagnoseRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const projectPath = body.path || process.cwd();
    const skills = body.skills || ['e2e', 'a11y'];

    const logger = createLogger({ level: 'info' });
    const skillRegistry = createSkillRegistry(logger);

    for (const skill of getRegisteredSkills()) {
      skillRegistry.register(skill);
    }

    // Get project info
    const projectInfo = await getProjectInfo(projectPath);

    // Load config and create context
    const config = await loadConfig(projectPath);
    const context: SkillContext = {
      project: projectInfo,
      config: config,
      logger: logger.child('Skill'),
      tools: createTools(projectPath),
      model: createModelClient(),
      storage: createStorage(),
    };

    await skillRegistry.initializeAll(context);

    // Run diagnosis
    const results = await skillRegistry.runDiagnosis(skills, context);

    const issues: any[] = [];
    for (const [skillName, diagnoses] of results) {
      issues.push(...diagnoses);
    }

    await skillRegistry.cleanupAll();

    return c.json({
      success: true,
      project: projectInfo,
      issues,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

diagnoseRouter.get('/skills', async (c) => {
  const logger = createLogger({ level: 'info' });
  const skillRegistry = createSkillRegistry(logger);

  for (const skill of getRegisteredSkills()) {
    skillRegistry.register(skill);
  }

  const skills = skillRegistry.getAllInfo();

  return c.json({
    success: true,
    skills,
  });
});

async function getProjectInfo(projectPath: string) {
  const packageJsonPath = path.join(projectPath, 'package.json');

  let name = path.basename(projectPath);
  let type: 'webapp' | 'library' | 'cli' | 'api' = 'webapp';
  let framework: string | undefined;

  try {
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);
    name = pkg.name || name;

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.react) framework = 'react';
    else if (deps.vue) framework = 'vue';
    else if (deps.angular) framework = 'angular';
    else if (deps.next) framework = 'next';

    if (deps.express || deps.fastify || deps.koa) type = 'api';
    else if (pkg.bin) type = 'cli';
    else if (deps.typescript && !deps.react && !deps.vue) type = 'library';
  } catch {
    // Ignore
  }

  return { name, path: projectPath, type, framework };
}
