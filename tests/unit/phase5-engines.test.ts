/**
 * Phase 5 Engines Tests
 *
 * Tests for WatchEngine, BenchmarkEngine, and DashboardServer.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { WatchEngine } from '../../src/engines/watch';
import {
  BenchmarkEngine,
  saveBenchmark,
  loadBenchmarks,
  getBenchmarkTrend,
  type BenchmarkResult,
} from '../../src/engines/benchmark';
import { createDashboardServer } from '../../src/engines/web-dashboard';
import type { DashboardData } from '../../src/engines/web-dashboard';

// ── Temp directory helpers ──────────────────────────────────────────────────

function createTempDir(prefix: string): string {
  const dir = path.join(
    process.env.TMPDIR || '/tmp',
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── WatchEngine Tests ───────────────────────────────────────────────────────

describe('WatchEngine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir('watch-engine');
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  describe('Constructor & default state', () => {
    it('initializes with correct default state', () => {
      const engine = new WatchEngine({ path: tmpDir });
      const state = engine.getState();

      expect(state.isWatching).toBe(false);
      expect(state.watchedFiles).toBe(0);
      expect(state.lastScan).toBeNull();
      expect(state.scanCount).toBe(0);
      expect(state.lastDiagnoses).toEqual([]);
    });

    it('accepts custom patterns and options', () => {
      const engine = new WatchEngine({
        path: tmpDir,
        patterns: ['**/*.md'],
        debounceMs: 100,
      });
      const state = engine.getState();
      expect(state.isWatching).toBe(false);
    });
  });

  describe('getState()', () => {
    it('returns a valid state structure', () => {
      const engine = new WatchEngine({ path: tmpDir });
      const state = engine.getState();

      expect(typeof state.isWatching).toBe('boolean');
      expect(typeof state.watchedFiles).toBe('number');
      expect(state.lastScan === null || state.lastScan instanceof Date).toBe(true);
      expect(typeof state.scanCount).toBe('number');
      expect(Array.isArray(state.lastDiagnoses)).toBe(true);
    });

    it('returns a copy of state (not the internal reference)', () => {
      const engine = new WatchEngine({ path: tmpDir });
      const state1 = engine.getState();
      const state2 = engine.getState();
      expect(state1).not.toBe(state2);
    });
  });

  describe('start() with non-existent path', () => {
    it('does not set isWatching to true for non-existent path', async () => {
      const nonExistentPath = path.join(tmpDir, 'does-not-exist');
      let errorCaptured: Error | null = null;
      const engine = new WatchEngine({
        path: nonExistentPath,
        onError: (err) => {
          errorCaptured = err;
        },
      });

      await engine.start();

      expect(errorCaptured).not.toBeNull();
      expect(errorCaptured!.message).toContain('Watch path does not exist');
      expect(engine.getState().isWatching).toBe(false);
    });
  });

  describe('stop()', () => {
    it('can be called cleanly when not watching', () => {
      const engine = new WatchEngine({ path: tmpDir });
      // Should not throw
      expect(() => engine.stop()).not.toThrow();
    });

    it('can be called multiple times cleanly', () => {
      const engine = new WatchEngine({ path: tmpDir });
      engine.stop();
      expect(() => engine.stop()).not.toThrow();
    });
  });

  describe('discoverFiles()', () => {
    it('returns files matching default patterns', async () => {
      // Create test files
      fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'const x = 1;');
      fs.writeFileSync(path.join(tmpDir, 'App.tsx'), 'export default function App() {}');
      fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# readme');
      fs.writeFileSync(path.join(tmpDir, 'style.css'), 'body {}');

      const engine = new WatchEngine({
        path: tmpDir,
        patterns: ['**/*.ts', '**/*.tsx', '**/*.css'],
      });

      // discoverFiles is private, but we can check watchedFiles after start
      // We need a minimal .qa-agent config for the scan to not crash
      const configDir = path.join(tmpDir, '.qa-agent');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'qa-agent.yaml'), 'version: 1\n');

      await engine.start();

      const state = engine.getState();
      expect(state.isWatching).toBe(true);
      // Should have found at least the .ts and .tsx files (css too)
      expect(state.watchedFiles).toBeGreaterThanOrEqual(2);

      engine.stop();
    });

    it('filters out ignored patterns', async () => {
      fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'const x = 1;');
      fs.writeFileSync(path.join(tmpDir, 'test.spec.ts'), 'describe("test", () => {});');

      const nodeModules = path.join(tmpDir, 'node_modules');
      fs.mkdirSync(nodeModules, { recursive: true });
      fs.writeFileSync(path.join(nodeModules, 'lib.ts'), 'export const a = 1;');

      const configDir = path.join(tmpDir, '.qa-agent');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'qa-agent.yaml'), 'version: 1\n');

      const engine = new WatchEngine({
        path: tmpDir,
        patterns: ['**/*.ts'],
      });

      await engine.start();

      const state = engine.getState();
      expect(state.isWatching).toBe(true);
      // Should only count index.ts (test.spec.ts and node_modules/lib.ts are ignored)
      expect(state.watchedFiles).toBe(1);

      engine.stop();
    });
  });

  describe('State transitions', () => {
    it('transitions from false → true → false', async () => {
      // Create minimal project structure
      fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'const x = 1;');
      const configDir = path.join(tmpDir, '.qa-agent');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'qa-agent.yaml'), 'version: 1\n');

      const engine = new WatchEngine({ path: tmpDir });

      // Initial: not watching
      expect(engine.getState().isWatching).toBe(false);

      // Start watching
      await engine.start();
      expect(engine.getState().isWatching).toBe(true);

      // Stop watching
      engine.stop();
      expect(engine.getState().isWatching).toBe(false);
    });

    it('start() returns early if already watching', async () => {
      fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'const x = 1;');
      const configDir = path.join(tmpDir, '.qa-agent');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'qa-agent.yaml'), 'version: 1\n');

      const engine = new WatchEngine({ path: tmpDir });

      await engine.start();
      expect(engine.getState().isWatching).toBe(true);
      const scanCountBefore = engine.getState().scanCount;

      // Start again - should be a no-op
      await engine.start();
      expect(engine.getState().isWatching).toBe(true);
      // scanCount should not have increased (no new scan triggered)
      expect(engine.getState().scanCount).toBe(scanCountBefore);

      engine.stop();
    });
  });
});

// ── BenchmarkEngine Tests ───────────────────────────────────────────────────

describe('BenchmarkEngine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir('benchmark-engine');
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  describe('Constructor', () => {
    it('creates with correct defaults', () => {
      const engine = new BenchmarkEngine();
      expect(engine).toBeDefined();
      expect(typeof engine.run).toBe('function');
      expect(typeof engine.compare).toBe('function');
      expect(typeof engine.generateReport).toBe('function');
      expect(typeof engine.saveResult).toBe('function');
      expect(typeof engine.loadResults).toBe('function');
      expect(typeof engine.getLatest).toBe('function');
    });
  });

  describe('compare()', () => {
    function makeResult(overrides: Partial<BenchmarkResult> = {}): BenchmarkResult {
      return {
        timestamp: new Date().toISOString(),
        projectPath: tmpDir,
        totalFiles: 10,
        totalFileSizeMB: 1.5,
        iterations: 3,
        results: [
          { skill: 'a11y', duration: 100, filesScanned: 5, issuesFound: 2, memoryUsedMB: 10 },
          { skill: 'security', duration: 200, filesScanned: 5, issuesFound: 3, memoryUsedMB: 15 },
        ],
        summary: {
          totalDuration: 300,
          avgDurationPerSkill: 150,
          slowestSkill: 'security',
          fastestSkill: 'a11y',
          filesPerSecond: 33.33,
          memoryPeakMB: 15,
        },
        ...overrides,
      };
    }

    it('correctly identifies better metrics (lower duration = better)', () => {
      const engine = new BenchmarkEngine();
      const before = makeResult({
        summary: {
          totalDuration: 300,
          avgDurationPerSkill: 150,
          slowestSkill: 'security',
          fastestSkill: 'a11y',
          filesPerSecond: 33.33,
          memoryPeakMB: 15,
        },
      });
      const after = makeResult({
        summary: {
          totalDuration: 200,
          avgDurationPerSkill: 100,
          slowestSkill: 'security',
          fastestSkill: 'a11y',
          filesPerSecond: 50,
          memoryPeakMB: 10,
        },
      });

      const comparison = engine.compare(before, after);

      const totalDuration = comparison.improvements.find((i) => i.metric === 'totalDuration');
      expect(totalDuration).toBeDefined();
      expect(totalDuration!.direction).toBe('better');
      expect(totalDuration!.change).toBeLessThan(0); // decreased

      const filesPerSec = comparison.improvements.find((i) => i.metric === 'filesPerSecond');
      expect(filesPerSec).toBeDefined();
      expect(filesPerSec!.direction).toBe('better'); // higher is better for filesPerSecond
    });

    it('correctly identifies worse metrics', () => {
      const engine = new BenchmarkEngine();
      const before = makeResult({
        summary: {
          totalDuration: 200,
          avgDurationPerSkill: 100,
          slowestSkill: 'security',
          fastestSkill: 'a11y',
          filesPerSecond: 50,
          memoryPeakMB: 10,
        },
      });
      const after = makeResult({
        summary: {
          totalDuration: 400,
          avgDurationPerSkill: 200,
          slowestSkill: 'security',
          fastestSkill: 'a11y',
          filesPerSecond: 25,
          memoryPeakMB: 20,
        },
      });

      const comparison = engine.compare(before, after);

      const totalDuration = comparison.improvements.find((i) => i.metric === 'totalDuration');
      expect(totalDuration!.direction).toBe('worse');

      const memory = comparison.improvements.find((i) => i.metric === 'memoryPeakMB');
      expect(memory!.direction).toBe('worse');

      const fps = comparison.improvements.find((i) => i.metric === 'filesPerSecond');
      expect(fps!.direction).toBe('worse'); // lower filesPerSecond is worse
    });

    it('identifies same metrics when values are nearly equal', () => {
      const engine = new BenchmarkEngine();
      const before = makeResult({
        summary: {
          totalDuration: 300,
          avgDurationPerSkill: 150,
          slowestSkill: 'security',
          fastestSkill: 'a11y',
          filesPerSecond: 33.33,
          memoryPeakMB: 15,
        },
      });
      const after = makeResult({
        summary: {
          totalDuration: 300,
          avgDurationPerSkill: 150,
          slowestSkill: 'security',
          fastestSkill: 'a11y',
          filesPerSecond: 33.33,
          memoryPeakMB: 15,
        },
      });

      const comparison = engine.compare(before, after);

      for (const imp of comparison.improvements) {
        expect(imp.direction).toBe('same');
        expect(imp.change).toBe(0);
      }
    });

    it('includes per-skill comparisons', () => {
      const engine = new BenchmarkEngine();
      const before = makeResult();
      const after = makeResult({
        results: [
          { skill: 'a11y', duration: 50, filesScanned: 5, issuesFound: 2, memoryUsedMB: 10 },
          { skill: 'security', duration: 300, filesScanned: 5, issuesFound: 3, memoryUsedMB: 15 },
        ],
      });

      const comparison = engine.compare(before, after);

      const a11yComparison = comparison.improvements.find((i) => i.metric === 'skill:a11y');
      expect(a11yComparison).toBeDefined();
      expect(a11yComparison!.direction).toBe('better'); // duration decreased

      const securityComparison = comparison.improvements.find((i) => i.metric === 'skill:security');
      expect(securityComparison).toBeDefined();
      expect(securityComparison!.direction).toBe('worse'); // duration increased
    });
  });

  describe('generateReport()', () => {
    it('returns a markdown string with expected content', () => {
      const engine = new BenchmarkEngine();
      const result: BenchmarkResult = {
        timestamp: '2025-01-15T10:00:00.000Z',
        projectPath: '/test/project',
        totalFiles: 42,
        totalFileSizeMB: 5.5,
        iterations: 3,
        results: [
          { skill: 'a11y', duration: 120, filesScanned: 20, issuesFound: 3, memoryUsedMB: 12.5 },
          { skill: 'security', duration: 250, filesScanned: 22, issuesFound: 5, memoryUsedMB: 18.3 },
        ],
        summary: {
          totalDuration: 370,
          avgDurationPerSkill: 185,
          slowestSkill: 'security',
          fastestSkill: 'a11y',
          filesPerSecond: 113.51,
          memoryPeakMB: 18.3,
        },
      };

      const report = engine.generateReport(result);

      expect(typeof report).toBe('string');
      expect(report).toContain('# Performance Benchmark Report');
      expect(report).toContain('**Date:** 2025-01-15T10:00:00.000Z');
      expect(report).toContain('**Project:** /test/project');
      expect(report).toContain('**Total Files:** 42');
      expect(report).toContain('**Total Size:** 5.50 MB');
      expect(report).toContain('**Iterations:** 3');
      expect(report).toContain('## Summary');
      expect(report).toContain('## Per-Skill Results');
      expect(report).toContain('| Skill | Duration (ms) | Files Scanned | Issues Found | Memory (MB) |');
      expect(report).toContain('security');
      expect(report).toContain('a11y');
      expect(report).toContain('Slowest Skill');
      expect(report).toContain('Fastest Skill');
      expect(report).toContain('Files / Second');
      expect(report).toContain('Peak Memory');
    });

    it('sorts per-skill results by duration descending', () => {
      const engine = new BenchmarkEngine();
      const result: BenchmarkResult = {
        timestamp: '2025-01-15T10:00:00.000Z',
        projectPath: '/test',
        totalFiles: 10,
        totalFileSizeMB: 1,
        iterations: 1,
        results: [
          { skill: 'sk-fast', duration: 10, filesScanned: 5, issuesFound: 0, memoryUsedMB: 1 },
          { skill: 'sk-medium', duration: 50, filesScanned: 5, issuesFound: 1, memoryUsedMB: 2 },
          { skill: 'sk-slow', duration: 100, filesScanned: 5, issuesFound: 2, memoryUsedMB: 3 },
        ],
        summary: {
          totalDuration: 160,
          avgDurationPerSkill: 53.33,
          slowestSkill: 'sk-slow',
          fastestSkill: 'sk-fast',
          filesPerSecond: 31.25,
          memoryPeakMB: 3,
        },
      };

      const report = engine.generateReport(result);

      // Find the "Per-Skill Results" section and check ordering within it
      const sectionStart = report.indexOf('## Per-Skill Results');
      const section = report.slice(sectionStart);

      // In the results table, skills should be sorted by duration descending
      const slowIdx = section.indexOf('sk-slow');
      const mediumIdx = section.indexOf('sk-medium');
      const fastIdx = section.indexOf('sk-fast');

      // slow should appear before medium, which should appear before fast
      expect(slowIdx).toBeLessThan(mediumIdx);
      expect(mediumIdx).toBeLessThan(fastIdx);
    });
  });

  describe('saveBenchmark() / loadBenchmarks()', () => {
    it('saves and loads benchmark results correctly', () => {
      const result: BenchmarkResult = {
        timestamp: '2025-01-15T10:00:00.000Z',
        projectPath: tmpDir,
        totalFiles: 10,
        totalFileSizeMB: 1,
        iterations: 2,
        results: [
          { skill: 'a11y', duration: 100, filesScanned: 5, issuesFound: 1, memoryUsedMB: 5 },
        ],
        summary: {
          totalDuration: 100,
          avgDurationPerSkill: 100,
          slowestSkill: 'a11y',
          fastestSkill: 'a11y',
          filesPerSecond: 50,
          memoryPeakMB: 5,
        },
      };

      saveBenchmark(result, tmpDir);

      const loaded = loadBenchmarks(tmpDir);
      expect(loaded.length).toBe(1);
      expect(loaded[0].timestamp).toBe('2025-01-15T10:00:00.000Z');
      expect(loaded[0].totalFiles).toBe(10);
      expect(loaded[0].results.length).toBe(1);
      expect(loaded[0].results[0].skill).toBe('a11y');
    });

    it('appends to existing results', () => {
      const result1: BenchmarkResult = {
        timestamp: '2025-01-15T10:00:00.000Z',
        projectPath: tmpDir,
        totalFiles: 10,
        totalFileSizeMB: 1,
        iterations: 1,
        results: [],
        summary: { totalDuration: 100, avgDurationPerSkill: 100, slowestSkill: 'a', fastestSkill: 'a', filesPerSecond: 10, memoryPeakMB: 1 },
      };
      const result2: BenchmarkResult = {
        ...result1,
        timestamp: '2025-01-16T10:00:00.000Z',
        totalFiles: 20,
      };

      saveBenchmark(result1, tmpDir);
      saveBenchmark(result2, tmpDir);

      const loaded = loadBenchmarks(tmpDir);
      expect(loaded.length).toBe(2);
      expect(loaded[0].totalFiles).toBe(10);
      expect(loaded[1].totalFiles).toBe(20);
    });

    it('returns empty array when no benchmarks exist', () => {
      const emptyDir = createTempDir('empty-benchmarks');
      try {
        const loaded = loadBenchmarks(emptyDir);
        expect(loaded).toEqual([]);
      } finally {
        cleanupDir(emptyDir);
      }
    });
  });

  describe('getBenchmarkTrend()', () => {
    it('extracts trend data from results', () => {
      const results: BenchmarkResult[] = [
        {
          timestamp: '2025-01-01T00:00:00.000Z',
          projectPath: tmpDir,
          totalFiles: 10,
          totalFileSizeMB: 1,
          iterations: 1,
          results: [],
          summary: { totalDuration: 300, avgDurationPerSkill: 100, slowestSkill: 'a', fastestSkill: 'b', filesPerSecond: 30, memoryPeakMB: 10 },
        },
        {
          timestamp: '2025-01-02T00:00:00.000Z',
          projectPath: tmpDir,
          totalFiles: 10,
          totalFileSizeMB: 1,
          iterations: 1,
          results: [],
          summary: { totalDuration: 250, avgDurationPerSkill: 80, slowestSkill: 'a', fastestSkill: 'b', filesPerSecond: 40, memoryPeakMB: 8 },
        },
        {
          timestamp: '2025-01-03T00:00:00.000Z',
          projectPath: tmpDir,
          totalFiles: 10,
          totalFileSizeMB: 1,
          iterations: 1,
          results: [],
          summary: { totalDuration: 200, avgDurationPerSkill: 70, slowestSkill: 'a', fastestSkill: 'b', filesPerSecond: 50, memoryPeakMB: 6 },
        },
      ];

      const trend = getBenchmarkTrend(results, 'totalDuration');
      expect(trend.length).toBe(3);
      expect(trend[0].timestamp).toBe('2025-01-01T00:00:00.000Z');
      expect(trend[0].value).toBe(300);
      expect(trend[1].value).toBe(250);
      expect(trend[2].value).toBe(200);
    });

    it('extracts filesPerSecond trend', () => {
      const results: BenchmarkResult[] = [
        {
          timestamp: '2025-01-01T00:00:00.000Z',
          projectPath: tmpDir,
          totalFiles: 10,
          totalFileSizeMB: 1,
          iterations: 1,
          results: [],
          summary: { totalDuration: 300, avgDurationPerSkill: 100, slowestSkill: 'a', fastestSkill: 'b', filesPerSecond: 30, memoryPeakMB: 10 },
        },
        {
          timestamp: '2025-01-02T00:00:00.000Z',
          projectPath: tmpDir,
          totalFiles: 10,
          totalFileSizeMB: 1,
          iterations: 1,
          results: [],
          summary: { totalDuration: 200, avgDurationPerSkill: 70, slowestSkill: 'a', fastestSkill: 'b', filesPerSecond: 50, memoryPeakMB: 6 },
        },
      ];

      const trend = getBenchmarkTrend(results, 'filesPerSecond');
      expect(trend.length).toBe(2);
      expect(trend[0].value).toBe(30);
      expect(trend[1].value).toBe(50);
    });

    it('returns 0 for unknown metrics', () => {
      const results: BenchmarkResult[] = [
        {
          timestamp: '2025-01-01T00:00:00.000Z',
          projectPath: tmpDir,
          totalFiles: 10,
          totalFileSizeMB: 1,
          iterations: 1,
          results: [],
          summary: { totalDuration: 100, avgDurationPerSkill: 50, slowestSkill: 'a', fastestSkill: 'a', filesPerSecond: 10, memoryPeakMB: 5 },
        },
      ];

      const trend = getBenchmarkTrend(results, 'nonExistent');
      expect(trend.length).toBe(1);
      expect(trend[0].value).toBe(0);
    });

    it('returns empty array for empty input', () => {
      const trend = getBenchmarkTrend([], 'totalDuration');
      expect(trend).toEqual([]);
    });
  });

  describe('Summary calculations', () => {
    it('correctly identifies slowest and fastest skills', () => {
      const engine = new BenchmarkEngine();
      const before: BenchmarkResult = {
        timestamp: '2025-01-01T00:00:00.000Z',
        projectPath: tmpDir,
        totalFiles: 10,
        totalFileSizeMB: 1,
        iterations: 1,
        results: [
          { skill: 'slow-skill', duration: 500, filesScanned: 10, issuesFound: 5, memoryUsedMB: 20 },
          { skill: 'fast-skill', duration: 50, filesScanned: 10, issuesFound: 1, memoryUsedMB: 5 },
          { skill: 'mid-skill', duration: 200, filesScanned: 10, issuesFound: 3, memoryUsedMB: 10 },
        ],
        summary: {
          totalDuration: 750,
          avgDurationPerSkill: 250,
          slowestSkill: 'slow-skill',
          fastestSkill: 'fast-skill',
          filesPerSecond: 40,
          memoryPeakMB: 20,
        },
      };
      const after: BenchmarkResult = {
        ...before,
        results: [
          { skill: 'slow-skill', duration: 400, filesScanned: 10, issuesFound: 4, memoryUsedMB: 18 },
          { skill: 'fast-skill', duration: 30, filesScanned: 10, issuesFound: 1, memoryUsedMB: 4 },
          { skill: 'mid-skill', duration: 250, filesScanned: 10, issuesFound: 3, memoryUsedMB: 12 },
        ],
        summary: {
          totalDuration: 680,
          avgDurationPerSkill: 226.67,
          slowestSkill: 'slow-skill',
          fastestSkill: 'fast-skill',
          filesPerSecond: 44,
          memoryPeakMB: 18,
        },
      };

      const comparison = engine.compare(before, after);

      const slowSkill = comparison.improvements.find((i) => i.metric === 'skill:slow-skill');
      expect(slowSkill!.direction).toBe('better'); // 500 → 400

      const fastSkill = comparison.improvements.find((i) => i.metric === 'skill:fast-skill');
      expect(fastSkill!.direction).toBe('better'); // 50 → 30

      const midSkill = comparison.improvements.find((i) => i.metric === 'skill:mid-skill');
      expect(midSkill!.direction).toBe('worse'); // 200 → 250
    });

    it('filesPerSecond is calculated correctly in compare', () => {
      const engine = new BenchmarkEngine();
      const before: BenchmarkResult = {
        timestamp: '2025-01-01T00:00:00.000Z',
        projectPath: tmpDir,
        totalFiles: 10,
        totalFileSizeMB: 1,
        iterations: 1,
        results: [],
        summary: {
          totalDuration: 1000,
          avgDurationPerSkill: 1000,
          slowestSkill: 'a',
          fastestSkill: 'a',
          filesPerSecond: 10,
          memoryPeakMB: 5,
        },
      };
      const after: BenchmarkResult = {
        ...before,
        summary: {
          totalDuration: 500,
          avgDurationPerSkill: 500,
          slowestSkill: 'a',
          fastestSkill: 'a',
          filesPerSecond: 20,
          memoryPeakMB: 5,
        },
      };

      const comparison = engine.compare(before, after);
      const fps = comparison.improvements.find((i) => i.metric === 'filesPerSecond');
      expect(fps!.change).toBeCloseTo(100, 0); // doubled = +100%
      expect(fps!.direction).toBe('better');
    });
  });

  describe('BenchmarkEngine saveResult / loadResults', () => {
    it('instance saveResult delegates to saveBenchmark', () => {
      const engine = new BenchmarkEngine();
      const result: BenchmarkResult = {
        timestamp: '2025-01-15T10:00:00.000Z',
        projectPath: tmpDir,
        totalFiles: 5,
        totalFileSizeMB: 0.5,
        iterations: 1,
        results: [],
        summary: { totalDuration: 50, avgDurationPerSkill: 50, slowestSkill: 'a', fastestSkill: 'a', filesPerSecond: 100, memoryPeakMB: 2 },
      };

      engine.saveResult(result, tmpDir);

      const loaded = engine.loadResults(tmpDir);
      expect(loaded.length).toBe(1);
      expect(loaded[0].totalFiles).toBe(5);
    });
  });
});

// ── DashboardServer Tests ───────────────────────────────────────────────────

describe('DashboardServer', () => {
  describe('createDashboardServer()', () => {
    it('returns a valid server object', () => {
      const server = createDashboardServer({
        port: 0, // random port
        projectPath: '/tmp/test-project',
      });

      expect(server).toBeDefined();
      expect(typeof server.start).toBe('function');
      expect(typeof server.stop).toBe('function');
      expect(typeof server.getPort).toBe('function');
      expect(typeof server.updateData).toBe('function');
    });
  });

  describe('start / stop / getPort', () => {
    it('starts and stops cleanly', async () => {
      const server = createDashboardServer({
        port: 0,
        projectPath: '/tmp/test-project',
      });

      const { port, url } = await server.start();
      expect(port).toBeGreaterThan(0);
      expect(url).toContain('http://');

      const actualPort = server.getPort();
      expect(actualPort).toBe(port);

      await server.stop();
      // After stop, getPort should return 0
      expect(server.getPort()).toBe(0);
    });

    it('getPort returns 0 before start', () => {
      const server = createDashboardServer({
        port: 0,
        projectPath: '/tmp/test-project',
      });
      expect(server.getPort()).toBe(0);
    });
  });

  describe('updateData()', () => {
    it('updates dashboard data correctly', async () => {
      const server = createDashboardServer({
        port: 0,
        projectPath: '/tmp/test-project',
      });

      await server.start();

      const testData: DashboardData = {
        summary: { score: 75, totalIssues: 5, critical: 1, warning: 2, info: 2 },
        issues: [
          {
            id: 'issue-1',
            skill: 'a11y',
            severity: 'critical',
            title: 'Missing ARIA label',
            description: 'Button missing aria-label',
            file: 'src/Button.tsx',
            line: 10,
            fixSuggestion: 'Add aria-label="Submit"',
            autoFixable: true,
          },
          {
            id: 'issue-2',
            skill: 'security',
            severity: 'warning',
            title: 'Potential XSS',
            description: 'Unsanitized user input',
            file: 'src/Input.tsx',
          },
        ],
        history: [],
        skills: {
          a11y: { name: 'a11y', version: '1.0.0', enabled: true, issueCount: 1 },
          security: { name: 'security', version: '1.0.0', enabled: true, issueCount: 1 },
        },
      };

      server.updateData(testData);

      // Verify via API
      const port = server.getPort();
      const response = await fetch(`http://localhost:${port}/api/data`);
      const data = await response.json();

      expect(data.summary.totalIssues).toBe(2);
      expect(data.issues.length).toBe(2);
      expect(data.issues[0].id).toBe('issue-1');
      expect(data.skills.a11y.enabled).toBe(true);

      await server.stop();
    });

    it('broadcasts updates to SSE clients', async () => {
      const server = createDashboardServer({
        port: 0,
        projectPath: '/tmp/test-project',
      });

      const { port } = await server.start();

      // Connect SSE client
      const sseResponse = await fetch(`http://localhost:${port}/sse`);
      expect(sseResponse.status).toBe(200);
      expect(sseResponse.headers.get('content-type')).toContain('text/event-stream');

      // Read initial data from SSE stream
      const reader = sseResponse.body!.getReader();
      const decoder = new TextDecoder();

      // Read initial SSE events
      let receivedData: DashboardData | null = null;

      // Read some bytes to get initial data
      const readResult = await reader.read();
      const chunk = decoder.decode(readResult.value);

      // Parse the initial data event
      const dataMatch = chunk.match(/data: ({.*})/s);
      if (dataMatch) {
        receivedData = JSON.parse(dataMatch[1]);
      }

      // Now call updateData and check for broadcast
      const updatePayload: DashboardData = {
        summary: { score: 90, totalIssues: 1, critical: 0, warning: 0, info: 1 },
        issues: [
          {
            id: 'new-issue',
            skill: 'performance',
            severity: 'info',
            title: 'Large bundle size',
            description: 'Bundle exceeds 500KB',
          },
        ],
        history: [],
        skills: {
          performance: { name: 'performance', version: '1.0.0', enabled: true, issueCount: 1 },
        },
      };

      server.updateData(updatePayload);

      // Wait for broadcast
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Read the broadcast data
      const readResult2 = await reader.read();
      const chunk2 = decoder.decode(readResult2.value);
      const dataMatch2 = chunk2.match(/data: ({.*})/s);
      if (dataMatch2) {
        receivedData = JSON.parse(dataMatch2[1]);
      }

      expect(receivedData).not.toBeNull();
      expect(receivedData!.summary.score).toBe(90);
      expect(receivedData!.issues.length).toBe(1);
      expect(receivedData!.issues[0].id).toBe('new-issue');

      // Clean up
      reader.releaseLock();
      await sseResponse.body!.cancel();
      await server.stop();
    });

    it('serves dashboard HTML at root path', async () => {
      const server = createDashboardServer({
        port: 0,
        projectPath: '/tmp/test-project',
      });

      await server.start();

      const response = await fetch(`http://localhost:${server.getPort()}/`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');

      const html = await response.text();
      expect(html).toContain('QA-Agent Dashboard');
      expect(html).toContain('id="statusDot"');
      expect(html).toContain('connectSSE');

      await server.stop();
    });

    it('serves health check endpoint', async () => {
      const server = createDashboardServer({
        port: 0,
        projectPath: '/tmp/test-project',
      });

      await server.start();

      const response = await fetch(`http://localhost:${server.getPort()}/api/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(typeof data.uptime).toBe('number');

      await server.stop();
    });

    it('auto-computes summary from issues when not provided', async () => {
      const server = createDashboardServer({
        port: 0,
        projectPath: '/tmp/test-project',
      });

      await server.start();

      const testData: DashboardData = {
        summary: { score: 0, totalIssues: 0, critical: 0, warning: 0, info: 0 },
        issues: [
          { id: '1', skill: 'a11y', severity: 'critical', title: 'A', description: 'A' },
          { id: '2', skill: 'security', severity: 'warning', title: 'B', description: 'B' },
          { id: '3', skill: 'a11y', severity: 'warning', title: 'C', description: 'C' },
          { id: '4', skill: 'security', severity: 'info', title: 'D', description: 'D' },
        ],
        skills: {},
      };

      server.updateData(testData);

      const response = await fetch(`http://localhost:${server.getPort()}/api/data`);
      const data = await response.json();

      expect(data.summary.critical).toBe(1);
      expect(data.summary.warning).toBe(2);
      expect(data.summary.info).toBe(1);
      expect(data.summary.totalIssues).toBe(4);

      await server.stop();
    });
  });
});
