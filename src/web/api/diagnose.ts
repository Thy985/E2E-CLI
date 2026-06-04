/**
 * Diagnose API Routes
 *
 * Thin wrapper over `core/runDiagnose`. HTTP-only concerns live here:
 * body parsing, status codes, JSON response. Business logic is in core/.
 */

import { Hono } from 'hono';
import { runDiagnose, cleanupDiagnose } from '../../core';
import { getRegisteredSkills } from '../../skills';
import { loadConfig } from '../../config';

export const diagnoseRouter = new Hono();

diagnoseRouter.post('/', async (c) => {
  let result: Awaited<ReturnType<typeof runDiagnose>> | null = null;

  try {
    const body = await c.req.json();
    const projectPath = body.path || process.cwd();
    const skills: string[] | undefined = body.skills;

    const config = await loadConfig(projectPath);

    result = await runDiagnose(projectPath, config, {
      skills,
      level: 'info',
    });

    return c.json({
      success: true,
      project: result.project,
      issues: result.issues,
      durationMs: result.durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  } finally {
    if (result) await cleanupDiagnose(result);
  }
});

diagnoseRouter.get('/skills', async (c) => {
  const skills = getRegisteredSkills().map((s: { name: string; version: string; description: string }) => ({
    name: s.name,
    version: s.version,
    description: s.description,
  }));
  return c.json({ success: true, skills });
});
