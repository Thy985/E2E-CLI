/**
 * Web UI Server
 * Serves the QA-Agent dashboard
 */

import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

// API routes
import { diagnoseRouter } from './api/diagnose';
import { reportRouter } from './api/report';
import { fixRouter } from './api/fix';
import { historyRouter } from './api/history';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// API routes
app.route('/api/diagnose', diagnoseRouter);
app.route('/api/report', reportRouter);
app.route('/api/fix', fixRouter);
app.route('/api/history', historyRouter);

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Project info
app.get('/api/project', async (c) => {
  const projectPath = c.req.query('path') || process.cwd();
  
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);
    
    return c.json({
      name: pkg.name || path.basename(projectPath),
      version: pkg.version || '0.0.0',
      description: pkg.description || '',
      path: projectPath,
    });
  } catch {
    return c.json({
      name: path.basename(projectPath),
      version: '0.0.0',
      description: '',
      path: projectPath,
    });
  }
});

// Serve static files in production
app.use('/*', serveStatic({ root: './dist/web' }));

// SPA fallback
app.get('*', async (c) => {
  try {
    const html = await fs.readFile(path.join(process.cwd(), 'dist/web/index.html'), 'utf-8');
    return c.html(html);
  } catch {
    // Development mode - return dev HTML
    return c.html(getDevHTML());
  }
});

function getDevHTML(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QA-Agent Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/web/main.tsx"></script>
</body>
</html>`;
}

export function createWebServer(port: number = 3000) {
  return {
    start: () => {
      console.log(`🌐 QA-Agent Dashboard: http://localhost:${port}`);
      return Bun.serve({
        port,
        fetch: app.fetch,
      });
    },
    app,
  };
}

export { app };
