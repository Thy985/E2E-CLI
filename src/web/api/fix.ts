/**
 * Fix API Routes
 */

import { Hono } from 'hono';
import { createSkillRegistry } from '../../skills/registry';
import { A11ySkill } from '../../skills/builtin/a11y';
import { E2ESkill } from '../../skills/builtin/e2e';
import { PerformanceSkill } from '../../skills/builtin/performance';
import { SecuritySkill } from '../../skills/builtin/security';
import { UIUXSkill } from '../../skills/builtin/ui-ux';
import { createModelClient } from '../../models';
import { createTools } from '../../tools';
import { createStorage } from '../../storage';
import { createLogger } from '../../utils/logger';
import { SkillContext, Diagnosis, Fix } from '../../types';
import { loadConfig } from '../../config';
import * as fs from 'fs/promises';
import * as path from 'path';

export const fixRouter = new Hono();

fixRouter.post('/preview', async (c) => {
  try {
    const body = await c.req.json();
    const { issues, projectPath } = body;

    if (!issues || issues.length === 0) {
      return c.json({
        success: false,
        error: 'No issues provided',
      }, 400);
    }

    const cwd = projectPath || process.cwd();
    const logger = createLogger({ level: 'info' });
    const skillRegistry = createSkillRegistry(logger);
    
    skillRegistry.register(new A11ySkill());
    skillRegistry.register(new E2ESkill());
    skillRegistry.register(new PerformanceSkill());
    skillRegistry.register(new SecuritySkill());
    skillRegistry.register(new UIUXSkill());

    const config = await loadConfig(cwd);
    const context: SkillContext = {
      project: { name: '', path: cwd },
      config: config,
      logger: logger.child('Skill'),
      tools: createTools(cwd),
      model: createModelClient(),
      storage: createStorage(),
    };

    await skillRegistry.initializeAll(context);

    const fixes: Array<{ fix: Fix; issue: Diagnosis }> = [];

    for (const issue of issues) {
      const skill = skillRegistry.get(issue.skill);
      if (!skill || !skill.fix) continue;

      try {
        const fix = await skill.fix(issue, context);
        fixes.push({ fix, issue });
      } catch (error: any) {
        console.warn(`Cannot fix ${issue.id}: ${error.message}`);
      }
    }

    await skillRegistry.cleanupAll();

    return c.json({
      success: true,
      fixes,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

fixRouter.post('/apply', async (c) => {
  try {
    const body = await c.req.json();
    const { fixes, projectPath } = body;

    if (!fixes || fixes.length === 0) {
      return c.json({
        success: false,
        error: 'No fixes provided',
      }, 400);
    }

    let applied = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const { fix } of fixes) {
      try {
        await applyFix(fix, projectPath || process.cwd());
        applied++;
      } catch (error: any) {
        failed++;
        errors.push(`${fix.description}: ${error.message}`);
      }
    }

    return c.json({
      success: true,
      applied,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

async function applyFix(fix: Fix, projectPath: string): Promise<void> {
  for (const change of fix.changes) {
    let filePath: string;
    if (path.isAbsolute(change.file)) {
      filePath = change.file;
    } else if (change.file.startsWith(projectPath) || change.file.includes('src/')) {
      filePath = change.file;
    } else {
      filePath = path.join(projectPath, change.file);
    }

    switch (change.type) {
      case 'replace':
        if (change.oldContent && change.content) {
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const newContent = fileContent.replace(change.oldContent, change.content);
          await fs.writeFile(filePath, newContent, 'utf-8');
        }
        break;

      case 'insert':
        if (change.content && change.position) {
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const lines = fileContent.split('\n');
          lines.splice(change.position.line - 1, 0, change.content);
          await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
        }
        break;
    }
  }
}
