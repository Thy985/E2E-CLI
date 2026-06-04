/**
 * Fix API Routes
 *
 * Thin wrapper over `core/previewFixes` + `core/applyFixes`.
 * All file I/O is in core/; this layer just does HTTP body parsing.
 */

import { Hono } from 'hono';
import { previewFixes, applyFixes, cleanupFixes } from '../../core';
import { loadConfig } from '../../config';

export const fixRouter = new Hono();

fixRouter.post('/preview', async (c) => {
  let result: Awaited<ReturnType<typeof previewFixes>> | null = null;
  try {
    const body = await c.req.json();
    const { issues, projectPath } = body;

    if (!issues || issues.length === 0) {
      return c.json({ success: false, error: 'No issues provided' }, 400);
    }

    const cwd = projectPath || process.cwd();
    const config = await loadConfig(cwd);
    result = await previewFixes(cwd, config, issues);
    return c.json({
      success: true,
      fixes: result.fixes,
      skipped: result.skipped,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  } finally {
    if (result) await cleanupFixes(result);
  }
});

fixRouter.post('/apply', async (c) => {
  try {
    const body = await c.req.json();
    const { fixes, projectPath } = body;

    if (!fixes || fixes.length === 0) {
      return c.json({ success: false, error: 'No fixes provided' }, 400);
    }

    const cwd = projectPath || process.cwd();
    const applyResult = await applyFixes({ fixes, projectPath: cwd });
    return c.json({
      success: true,
      applied: applyResult.applied,
      failed: applyResult.failed,
      errors: applyResult.errors.length > 0 ? applyResult.errors : undefined,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});
