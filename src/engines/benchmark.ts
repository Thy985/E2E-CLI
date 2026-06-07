/**
 * Performance Benchmark Engine
 * Measures and reports on QA-Agent's scanning performance for large projects.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger';
import { createTools } from '../tools';
import { loadConfig } from '../config';
import { createSkillRegistry } from '../skills/registry';
import { Skill, SkillContext, Diagnosis } from '../types';
import { createModelClient } from '../models';
import { createStorage } from '../storage';

// Built-in skill constructors (static imports — same pattern as diagnose.ts)
import { A11ySkill } from '../skills/builtin/a11y';
import { E2ESkill } from '../skills/builtin/e2e';
import { PerformanceSkill } from '../skills/builtin/performance';
import { SecuritySkill } from '../skills/builtin/security';
import { UIUXSkill } from '../skills/builtin/uiux';
import { SEOSkill } from '../skills/builtin/seo';
import { APISkill } from '../skills/builtin/api';
import { DependencySkill } from '../skills/builtin/dependency';
import { ComplexitySkill } from '../skills/builtin/complexity';
import { NextJSSkill } from '../skills/builtin/framework/nextjs';
import { NuxtSkill } from '../skills/builtin/framework/nuxt';

// ─────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────

export interface BenchmarkOptions {
  projectPath: string;
  skills?: string[];        // which skills to benchmark (default: all)
  iterations?: number;      // how many times to run (default: 3)
  warmup?: boolean;         // run warmup iteration (default: true)
}

export interface SkillBenchmarkResult {
  skill: string;
  duration: number;          // ms
  filesScanned: number;
  issuesFound: number;
  memoryUsedMB: number;      // peak memory
}

export interface BenchmarkResult {
  timestamp: string;
  projectPath: string;
  totalFiles: number;
  totalFileSizeMB: number;
  iterations: number;
  results: SkillBenchmarkResult[];
  summary: {
    totalDuration: number;
    avgDurationPerSkill: number;
    slowestSkill: string;
    fastestSkill: string;
    filesPerSecond: number;
    memoryPeakMB: number;
  };
}

export interface BenchmarkComparison {
  before: BenchmarkResult;
  after: BenchmarkResult;
  improvements: Array<{
    metric: string;
    before: number;
    after: number;
    change: number;      // percentage
    direction: 'better' | 'worse' | 'same';
  }>;
}

// ─────────────────────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────────────────────

export const BENCHMARK_DIR = '.qa-benchmark';
export const BENCHMARK_FILE = 'benchmarks.json';

// ─────────────────────────────────────────────────────────────
// Standalone utility functions
// ─────────────────────────────────────────────────────────────

export function loadBenchmarks(projectPath: string = process.cwd()): BenchmarkResult[] {
  const filePath = path.join(projectPath, BENCHMARK_DIR, BENCHMARK_FILE);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as BenchmarkResult[];
  } catch {
    return [];
  }
}

export function saveBenchmark(result: BenchmarkResult, projectPath: string = process.cwd()): void {
  const dir = path.join(projectPath, BENCHMARK_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, BENCHMARK_FILE);
  const existing = loadBenchmarks(projectPath);
  existing.push(result);
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
}

export function getBenchmarkTrend(
  results: BenchmarkResult[],
  metric: string,
): Array<{ timestamp: string; value: number }> {
  return results.map((r) => {
    const summary = r.summary as unknown as Record<string, number>;
    const value = summary[metric] ?? 0;
    return { timestamp: r.timestamp, value };
  });
}

// ─────────────────────────────────────────────────────────────
// BenchmarkEngine
// ─────────────────────────────────────────────────────────────

const ALL_BUILTIN_SKILLS: { name: string; ctor: new () => Skill }[] = [
  { name: 'a11y', ctor: A11ySkill },
  { name: 'e2e', ctor: E2ESkill },
  { name: 'performance', ctor: PerformanceSkill },
  { name: 'security', ctor: SecuritySkill },
  { name: 'ui-ux', ctor: UIUXSkill },
  { name: 'seo', ctor: SEOSkill },
  { name: 'api', ctor: APISkill },
  { name: 'dependency', ctor: DependencySkill },
  { name: 'complexity', ctor: ComplexitySkill },
  { name: 'nextjs', ctor: NextJSSkill },
  { name: 'nuxt', ctor: NuxtSkill },
];

export class BenchmarkEngine {
  private logger = createLogger({ level: 'info', prefix: 'Benchmark' });

  // ── Public API ──────────────────────────────────────────

  /**
   * Run benchmark and return result.
   */
  async run(options: BenchmarkOptions): Promise<BenchmarkResult> {
    const {
      projectPath,
      skills: skillsFilter,
      iterations = 3,
      warmup = true,
    } = options;

    this.logger.info(`Starting benchmark: ${projectPath}`);

    // Discover project files
    const { totalFiles, totalFileSizeMB } = await this.discoverFiles(projectPath);

    // Resolve which skills to benchmark
    const skillNames = skillsFilter && skillsFilter.length > 0
      ? skillsFilter
      : ALL_BUILTIN_SKILLS.map((s) => s.name);

    // Build skill context once
    const context = await this.buildContext(projectPath);

    // Build registry and register skills
    const registry = this.buildRegistry();

    // Warmup (discarded — JIT warmup)
    if (warmup) {
      this.logger.info('Running warmup iteration (discarded)...');
      await this.runOnePass(registry, context, skillNames);
      this.logger.info('Warmup complete.');
    }

    // Run iterations
    const perIterationResults: Map<string, SkillBenchmarkResult>[] = [];
    for (let i = 0; i < iterations; i++) {
      this.logger.info(`Running iteration ${i + 1}/${iterations}...`);
      const iterResults = await this.runOnePass(registry, context, skillNames);
      perIterationResults.push(iterResults);
    }

    // Aggregate: median across iterations per skill
    const aggregated = this.aggregateResults(skillNames, perIterationResults);

    // Build summary
    const totalDuration = aggregated.reduce((sum, r) => sum + r.duration, 0);
    const slowest = aggregated.reduce((a, b) => (a.duration > b.duration ? a : b));
    const fastest = aggregated.reduce((a, b) => (a.duration < b.duration ? a : b));
    const totalFilesScanned = aggregated.reduce((sum, r) => sum + r.filesScanned, 0);
    const memoryPeakMB = aggregated.length > 0
      ? Math.max(...aggregated.map((r) => r.memoryUsedMB))
      : 0;

    const result: BenchmarkResult = {
      timestamp: new Date().toISOString(),
      projectPath,
      totalFiles,
      totalFileSizeMB,
      iterations,
      results: aggregated,
      summary: {
        totalDuration,
        avgDurationPerSkill: aggregated.length > 0 ? totalDuration / aggregated.length : 0,
        slowestSkill: slowest.skill,
        fastestSkill: fastest.skill,
        filesPerSecond: totalDuration > 0 ? (totalFilesScanned / totalDuration) * 1000 : 0,
        memoryPeakMB,
      },
    };

    // Cleanup
    await registry.cleanupAll();

    this.logger.info(`Benchmark complete. Total duration: ${totalDuration}ms`);
    return result;
  }

  /**
   * Compare two benchmark results.
   */
  compare(before: BenchmarkResult, after: BenchmarkResult): BenchmarkComparison {
    const comparison: BenchmarkComparison = {
      before,
      after,
      improvements: [],
    };

    const summaryMetrics: Array<{ key: string; lowerIsBetter: boolean }> = [
      { key: 'totalDuration', lowerIsBetter: true },
      { key: 'avgDurationPerSkill', lowerIsBetter: true },
      { key: 'filesPerSecond', lowerIsBetter: false },
      { key: 'memoryPeakMB', lowerIsBetter: true },
    ];

    for (const { key, lowerIsBetter } of summaryMetrics) {
      const beforeVal = (before.summary as unknown as Record<string, number>)[key] ?? 0;
      const afterVal = (after.summary as unknown as Record<string, number>)[key] ?? 0;
      const change = beforeVal !== 0 ? ((afterVal - beforeVal) / beforeVal) * 100 : 0;

      comparison.improvements.push({
        metric: key,
        before: beforeVal,
        after: afterVal,
        change: Math.round(change * 100) / 100,
        direction: this.direction(change, lowerIsBetter),
      });
    }

    // Per-skill duration comparison
    const beforeMap = new Map(before.results.map((r) => [r.skill, r]));
    const afterMap = new Map(after.results.map((r) => [r.skill, r]));

    const allSkills = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    for (const skill of allSkills) {
      const b = beforeMap.get(skill);
      const a = afterMap.get(skill);
      if (!b || !a) continue;

      const change = b.duration !== 0 ? ((a.duration - b.duration) / b.duration) * 100 : 0;
      comparison.improvements.push({
        metric: `skill:${skill}`,
        before: b.duration,
        after: a.duration,
        change: Math.round(change * 100) / 100,
        direction: this.direction(change, true), // lower duration = better
      });
    }

    return comparison;
  }

  /**
   * Generate markdown report.
   */
  generateReport(result: BenchmarkResult): string {
    const lines: string[] = [];

    lines.push('# Performance Benchmark Report');
    lines.push('');
    lines.push(`**Date:** ${result.timestamp}`);
    lines.push(`**Project:** ${result.projectPath}`);
    lines.push(`**Total Files:** ${result.totalFiles}`);
    lines.push(`**Total Size:** ${result.totalFileSizeMB.toFixed(2)} MB`);
    lines.push(`**Iterations:** ${result.iterations}`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('| --- | --- |');
    lines.push(`| Total Duration | ${result.summary.totalDuration.toFixed(0)} ms |`);
    lines.push(`| Avg Duration / Skill | ${result.summary.avgDurationPerSkill.toFixed(0)} ms |`);
    lines.push(`| Slowest Skill | ${result.summary.slowestSkill} |`);
    lines.push(`| Fastest Skill | ${result.summary.fastestSkill} |`);
    lines.push(`| Files / Second | ${result.summary.filesPerSecond.toFixed(2)} |`);
    lines.push(`| Peak Memory | ${result.summary.memoryPeakMB.toFixed(2)} MB |`);
    lines.push('');

    // Per-skill results
    lines.push('## Per-Skill Results');
    lines.push('');
    lines.push('| Skill | Duration (ms) | Files Scanned | Issues Found | Memory (MB) |');
    lines.push('| --- | ---: | ---: | ---: | ---: |');

    const sorted = [...result.results].sort((a, b) => b.duration - a.duration);
    for (const r of sorted) {
      lines.push(
        `| ${r.skill} | ${r.duration.toFixed(0)} | ${r.filesScanned} | ${r.issuesFound} | ${r.memoryUsedMB.toFixed(2)} |`,
      );
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Save result to .qa-benchmark directory.
   */
  saveResult(result: BenchmarkResult, projectPath: string = process.cwd()): void {
    saveBenchmark(result, projectPath);
    this.logger.info(`Benchmark result saved to ${BENCHMARK_DIR}/${BENCHMARK_FILE}`);
  }

  /**
   * Load previous benchmark results.
   */
  loadResults(projectPath: string = process.cwd()): BenchmarkResult[] {
    return loadBenchmarks(projectPath);
  }

  /**
   * Get latest benchmark.
   */
  getLatest(projectPath: string = process.cwd()): BenchmarkResult | null {
    const results = this.loadResults(projectPath);
    if (results.length === 0) return null;
    return results[results.length - 1];
  }

  // ── Private helpers ─────────────────────────────────────

  private async discoverFiles(
    projectPath: string,
  ): Promise<{ totalFiles: number; totalFileSizeMB: number }> {
    const tools = createTools(projectPath);
    const patterns = [
      '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
      '**/*.css', '**/*.scss', '**/*.html', '**/*.vue',
      '**/*.svelte', '**/*.json',
    ];
    const fileSet = new Set<string>();
    for (const p of patterns) {
      try {
        const matches = await tools.fs.glob(p);
        for (const m of matches) fileSet.add(m);
      } catch {
        // glob may fail on some patterns — skip
      }
    }

    let totalBytes = 0;
    for (const f of fileSet) {
      try {
        const stat = await tools.fs.stat(f);
        if (stat.isFile) {
          totalBytes += stat.size;
        }
      } catch {
        // file may have disappeared between glob and stat
      }
    }

    return {
      totalFiles: fileSet.size,
      totalFileSizeMB: totalBytes / (1024 * 1024),
    };
  }

  private async buildContext(projectPath: string): Promise<SkillContext> {
    const logger = createLogger({ level: 'info', prefix: 'Benchmark:Skill' });
    const config = await loadConfig(projectPath);
    const tools = createTools(projectPath);
    const model = createModelClient();
    const storage = createStorage();

    return {
      project: { name: path.basename(projectPath), path: projectPath },
      config,
      logger,
      tools,
      model,
      storage,
    };
  }

  private buildRegistry() {
    const registry = createSkillRegistry(this.logger);

    for (const { ctor } of ALL_BUILTIN_SKILLS) {
      try {
        const instance = new ctor();
        registry.register(instance);
      } catch (e) {
        this.logger.warn(`Failed to register skill: ${e}`);
      }
    }

    return registry;
  }

  private async runOnePass(
    registry: ReturnType<typeof createSkillRegistry>,
    context: SkillContext,
    skillNames: string[],
  ): Promise<Map<string, SkillBenchmarkResult>> {
    // Initialize all skills
    await registry.initializeAll(context);

    const results = new Map<string, SkillBenchmarkResult>();

    for (const name of skillNames) {
      const skill = registry.get(name);
      if (!skill) {
        this.logger.warn(`Skill not found: ${name}`);
        continue;
      }

      const startMemory = this.getHeapUsedMB();
      const start = performance.now();

      let diagnoses: Diagnosis[] = [];
      try {
        diagnoses = await skill.diagnose(context);
      } catch (error) {
        this.logger.error(`Skill ${name} diagnosis failed: ${error}`);
      }

      const duration = performance.now() - start;
      const endMemory = this.getHeapUsedMB();
      const memoryUsedMB = Math.max(endMemory - startMemory, 0);

      // Count unique files scanned from diagnoses
      const filesScanned = this.countUniqueFiles(diagnoses);

      results.set(name, {
        skill: name,
        duration,
        filesScanned,
        issuesFound: diagnoses.length,
        memoryUsedMB,
      });
    }

    return results;
  }

  private countUniqueFiles(diagnoses: Diagnosis[]): number {
    const files = new Set<string>(
      diagnoses.map((d) => d.location.file).filter(Boolean),
    );
    return files.size;
  }

  private aggregateResults(
    skillNames: string[],
    iterations: Map<string, SkillBenchmarkResult>[],
  ): SkillBenchmarkResult[] {
    const aggregated: SkillBenchmarkResult[] = [];

    for (const name of skillNames) {
      const values = iterations
        .map((iter) => iter.get(name))
        .filter((v): v is SkillBenchmarkResult => v != null);

      if (values.length === 0) continue;

      aggregated.push({
        skill: name,
        duration: this.median(values.map((v) => v.duration)),
        filesScanned: Math.round(this.mean(values.map((v) => v.filesScanned))),
        issuesFound: Math.round(this.mean(values.map((v) => v.issuesFound))),
        memoryUsedMB: this.median(values.map((v) => v.memoryUsedMB)),
      });
    }

    return aggregated;
  }

  private getHeapUsedMB(): number {
    const usage = process.memoryUsage();
    return usage.heapUsed / (1024 * 1024);
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private direction(change: number, lowerIsBetter: boolean): 'better' | 'worse' | 'same' {
    if (Math.abs(change) < 0.01) return 'same';
    if (lowerIsBetter) return change < 0 ? 'better' : 'worse';
    return change > 0 ? 'better' : 'worse';
  }
}
