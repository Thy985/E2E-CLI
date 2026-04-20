/**
 * Report API Routes
 */

import { Hono } from 'hono';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReportGenerator } from '../../engines/report';

export const reportRouter = new Hono();

reportRouter.get('/latest', async (c) => {
  const projectPath = c.req.query('path') || process.cwd();
  const reportDir = path.join(projectPath, '.qa-agent', 'reports');

  try {
    const files = await fs.readdir(reportDir);
    const jsonReports = files
      .filter(f => f.startsWith('diagnose-') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (jsonReports.length === 0) {
      return c.json({
        success: false,
        error: 'No reports found',
      }, 404);
    }

    const latestReport = jsonReports[0];
    const content = await fs.readFile(path.join(reportDir, latestReport), 'utf-8');
    const report = JSON.parse(content);

    return c.json({
      success: true,
      report,
    });
  } catch {
    return c.json({
      success: false,
      error: 'No reports found',
    }, 404);
  }
});

reportRouter.get('/list', async (c) => {
  const projectPath = c.req.query('path') || process.cwd();
  const reportDir = path.join(projectPath, '.qa-agent', 'reports');

  try {
    const files = await fs.readdir(reportDir);
    const reports = files
      .filter(f => f.startsWith('diagnose-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 20);

    const reportList = [];
    for (const file of reports) {
      try {
        const content = await fs.readFile(path.join(reportDir, file), 'utf-8');
        const report = JSON.parse(content);
        reportList.push({
          filename: file,
          timestamp: report.timestamp,
          score: report.summary?.score,
          issues: report.summary?.totalIssues,
        });
      } catch {
        // Skip invalid reports
      }
    }

    return c.json({
      success: true,
      reports: reportList,
    });
  } catch {
    return c.json({
      success: true,
      reports: [],
    });
  }
});

reportRouter.get('/:filename', async (c) => {
  const projectPath = c.req.query('path') || process.cwd();
  const filename = c.req.param('filename');
  const reportPath = path.join(projectPath, '.qa-agent', 'reports', filename);

  try {
    const content = await fs.readFile(reportPath, 'utf-8');
    const report = JSON.parse(content);

    return c.json({
      success: true,
      report,
    });
  } catch {
    return c.json({
      success: false,
      error: 'Report not found',
    }, 404);
  }
});
