/**
 * History API Routes
 */

import { Hono } from 'hono';
import * as fs from 'fs/promises';
import * as path from 'path';

export const historyRouter = new Hono();

historyRouter.get('/', async (c) => {
  const projectPath = c.req.query('path') || process.cwd();
  const reportDir = path.join(projectPath, '.qa-agent', 'reports');

  try {
    const files = await fs.readdir(reportDir);
    const jsonReports = files
      .filter(f => f.startsWith('diagnose-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 30);

    const history = [];
    
    for (const file of jsonReports) {
      try {
        const content = await fs.readFile(path.join(reportDir, file), 'utf-8');
        const report = JSON.parse(content);
        
        history.push({
          date: report.timestamp,
          score: report.summary?.score || 0,
          issues: report.summary?.totalIssues || 0,
          critical: report.summary?.critical || 0,
          warning: report.summary?.warning || 0,
          grade: report.summary?.grade || 'F',
        });
      } catch {
        // Skip invalid reports
      }
    }

    // Calculate trend
    let trend = 'stable';
    if (history.length >= 2) {
      const recent = history.slice(0, 5);
      const older = history.slice(5, 10);
      
      if (older.length > 0) {
        const recentAvg = recent.reduce((sum, h) => sum + h.score, 0) / recent.length;
        const olderAvg = older.reduce((sum, h) => sum + h.score, 0) / older.length;
        
        if (recentAvg > olderAvg + 5) trend = 'improving';
        else if (recentAvg < olderAvg - 5) trend = 'declining';
      }
    }

    return c.json({
      success: true,
      history: history.reverse(), // Oldest first for chart
      trend,
    });
  } catch {
    return c.json({
      success: true,
      history: [],
      trend: 'stable',
    });
  }
});

historyRouter.get('/stats', async (c) => {
  const projectPath = c.req.query('path') || process.cwd();
  const reportDir = path.join(projectPath, '.qa-agent', 'reports');

  try {
    const files = await fs.readdir(reportDir);
    const jsonReports = files.filter(f => f.startsWith('diagnose-') && f.endsWith('.json'));

    const stats = {
      totalReports: jsonReports.length,
      averageScore: 0,
      bestScore: 0,
      worstScore: 100,
      totalIssues: 0,
      fixedIssues: 0,
    };

    const scores: number[] = [];

    for (const file of jsonReports) {
      try {
        const content = await fs.readFile(path.join(reportDir, file), 'utf-8');
        const report = JSON.parse(content);
        
        const score = report.summary?.score || 0;
        scores.push(score);
        stats.totalIssues += report.summary?.totalIssues || 0;
        
        if (score > stats.bestScore) stats.bestScore = score;
        if (score < stats.worstScore) stats.worstScore = score;
      } catch {
        // Skip invalid
      }
    }

    if (scores.length > 0) {
      stats.averageScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }

    return c.json({
      success: true,
      stats,
    });
  } catch {
    return c.json({
      success: true,
      stats: {
        totalReports: 0,
        averageScore: 0,
        bestScore: 0,
        worstScore: 100,
        totalIssues: 0,
        fixedIssues: 0,
      },
    });
  }
});
