/**
 * Watch Engine
 * Monitors file changes and re-runs diagnosis automatically.
 *
 * Uses fs.watch with recursive option for directory watching,
 * debounces file change events, and re-runs skill diagnosis on changes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';

import { createLogger } from '../utils/logger';
import { createTools } from '../tools';
import { createSkillRegistry } from '../skills/registry';
import { loadConfig } from '../config';
import { createModelClient } from '../models';
import { createStorage } from '../storage';
import type { SkillContext, Diagnosis, ProjectInfo } from '../types';
import type { QAConfig } from '../config';

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

// ============================================
// Interfaces
// ============================================

export interface WatchOptions {
  path: string;
  patterns?: string[];
  ignorePatterns?: string[];
  debounceMs?: number;
  skills?: string[];
  onDiagnostic?: (diagnoses: Diagnosis[]) => void;
  onError?: (error: Error) => void;
}

export interface WatchState {
  isWatching: boolean;
  watchedFiles: number;
  lastScan: Date | null;
  scanCount: number;
  lastDiagnoses: Diagnosis[];
}

// Default glob patterns to watch
const DEFAULT_PATTERNS = [
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
  '**/*.vue',
  '**/*.svelte',
  '**/*.html',
  '**/*.css',
];

// Default config ignore patterns (node_modules, dist, etc.)
const DEFAULT_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/*.min.js',
  '**/*.d.ts',
  '**/__tests__/**',
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/.qa-agent/**',
];

// ============================================
// WatchEngine
// ============================================

export class WatchEngine {
  private state: WatchState;
  private watchers: fs.FSWatcher[];
  private debounceTimer: ReturnType<typeof setTimeout> | null;
  private logger: ReturnType<typeof createLogger>;

  constructor(private options: WatchOptions) {
    this.state = {
      isWatching: false,
      watchedFiles: 0,
      lastScan: null,
      scanCount: 0,
      lastDiagnoses: [],
    };
    this.watchers = [];
    this.debounceTimer = null;
    this.logger = createLogger({ prefix: 'WatchEngine' });
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * Start watching the target path for file changes.
   */
  async start(): Promise<void> {
    if (this.state.isWatching) {
      this.logger.warn('Already watching, call stop() first');
      return;
    }

    const watchPath = path.resolve(this.options.path);
    if (!fs.existsSync(watchPath)) {
      const err = new Error(`Watch path does not exist: ${watchPath}`);
      this.handleError(err);
      return;
    }

    this.logger.info(`Starting file watch on ${watchPath}`);

    // Discover initial files to count
    const files = await this.discoverFiles();
    this.state.watchedFiles = files.length;
    this.logger.info(`Discovered ${files.length} files matching watch patterns`);

    // Set up fs.watch on the root directory with recursive option
    const watcher = fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      const filePath = path.join(watchPath, filename);
      this.handleFileEvent(eventType, filePath);
    });

    watcher.on('error', (err: Error) => {
      this.handleError(err);
    });

    this.watchers.push(watcher);
    this.state.isWatching = true;

    // Run an initial scan
    await this.runScan();
  }

  /**
   * Stop watching and clean up resources.
   */
  stop(): void {
    if (!this.state.isWatching) {
      return;
    }

    // Clear any pending debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Close all watchers
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
    this.state.isWatching = false;

    this.logger.info('File watch stopped');
  }

  /**
   * Get current watch state.
   */
  getState(): WatchState {
    return { ...this.state };
  }

  // ============================================
  // Internal
  // ============================================

  /**
   * Handle a file system event with debouncing.
   */
  private handleFileEvent(eventType: 'rename' | 'change', filePath: string): void {
    // Skip if not watching
    if (!this.state.isWatching) return;

    // Filter out ignored paths
    if (!this.shouldWatchFile(filePath)) return;

    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    const debounceMs = this.options.debounceMs ?? 500;
    this.logger.debug(`File ${eventType}: ${filePath} (debounce: ${debounceMs}ms)`);

    // Set new debounce timer
    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      this.logger.info(`File change detected: ${eventType} ${path.relative(this.options.path, filePath)}`);
      await this.runScan();
    }, debounceMs);
  }

  /**
   * Run a full scan and diagnosis on the current project state.
   */
  private async runScan(): Promise<void> {
    const scanStart = Date.now();
    this.logger.info('Running scan and diagnosis...');

    try {
      // Refresh file count
      const files = await this.discoverFiles();
      this.state.watchedFiles = files.length;

      // Load config
      const config = await loadConfig(this.options.path);

      // Build skill context
      const context = await this.buildSkillContext(config);

      // Set up registry and register built-in skills
      const registry = createSkillRegistry(this.logger);
      registry.register(new A11ySkill());
      registry.register(new E2ESkill());
      registry.register(new PerformanceSkill());
      registry.register(new SecuritySkill());
      registry.register(new UIUXSkill());
      registry.register(new SEOSkill());
      registry.register(new APISkill());
      registry.register(new DependencySkill());
      registry.register(new ComplexitySkill());
      registry.register(new NextJSSkill());
      registry.register(new NuxtSkill());

      // Determine which skills to run
      const disabledSkills = config.skills?.disabled || [];
      const configuredSkills = this.options.skills ?? config.skills?.enabled;
      const skillsToRun =
        configuredSkills?.filter(
          (s: string) => registry.has(s) && !disabledSkills.includes(s)
        ) ?? [];

      if (skillsToRun.length === 0) {
        this.logger.warn('No skills available to run');
        this.state.lastDiagnoses = [];
        return;
      }

      // Initialize skills
      await registry.initializeAll(context);

      // Run diagnosis
      const results = await registry.runDiagnosis(skillsToRun, context);

      // Flatten all diagnoses
      const allDiagnoses: Diagnosis[] = [];
      for (const [, issues] of results) {
        allDiagnoses.push(...issues);
      }

      // Update state
      this.state.lastScan = new Date();
      this.state.scanCount++;
      this.state.lastDiagnoses = allDiagnoses;

      // Cleanup skills
      await registry.cleanupAll();

      const elapsed = Date.now() - scanStart;
      this.logger.info(
        `Scan complete: ${allDiagnoses.length} issues found (${elapsed}ms, scan #${this.state.scanCount})`
      );

      // Notify callback
      if (this.options.onDiagnostic) {
        this.options.onDiagnostic(allDiagnoses);
      }
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Discover files matching the watch patterns.
   */
  private async discoverFiles(): Promise<string[]> {
    const patterns = this.options.patterns ?? DEFAULT_PATTERNS;
    const ignoreList = [...(this.options.ignorePatterns ?? []), ...DEFAULT_IGNORE_PATTERNS];
    const watchPath = path.resolve(this.options.path);

    return this.walkDirectory(watchPath, patterns, ignoreList);
  }

  /**
   * Recursively walk a directory and collect files matching the given patterns.
   */
  private async walkDirectory(
    dir: string,
    patterns: string[],
    ignorePatterns: string[]
  ): Promise<string[]> {
    const results: string[] = [];

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return results;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(this.options.path, fullPath);

      // Check if the path should be ignored
      if (ignorePatterns.some((p) => minimatch(relativePath, p, { dot: true, matchBase: true }))) {
        continue;
      }

      if (entry.isDirectory()) {
        const subFiles = await this.walkDirectory(fullPath, patterns, ignorePatterns);
        results.push(...subFiles);
      } else if (entry.isFile()) {
        // Check if file matches any watch pattern
        if (patterns.some((p) => minimatch(relativePath, p, { dot: true, matchBase: true }))) {
          results.push(fullPath);
        }
      }
    }

    return results;
  }

  /**
   * Determine if a file path should trigger a re-scan.
   */
  private shouldWatchFile(filePath: string): boolean {
    const relativePath = path.relative(path.resolve(this.options.path), filePath);
    if (!relativePath || relativePath.startsWith('..')) return false;

    const patterns = this.options.patterns ?? DEFAULT_PATTERNS;
    const ignoreList = [...(this.options.ignorePatterns ?? []), ...DEFAULT_IGNORE_PATTERNS];

    // Must not be ignored
    if (ignoreList.some((p) => minimatch(relativePath, p, { dot: true, matchBase: true }))) {
      return false;
    }

    // Must match a watch pattern
    return patterns.some((p) => minimatch(relativePath, p, { dot: true, matchBase: true }));
  }

  /**
   * Build a SkillContext for running diagnosis.
   */
  private async buildSkillContext(config: QAConfig): Promise<SkillContext> {
    const projectPath = path.resolve(this.options.path);
    const projectInfo = await this.getProjectInfo(projectPath, config);

    const context: SkillContext = {
      project: projectInfo,
      config,
      logger: this.logger.child('Skill'),
      tools: createTools(projectPath),
      model: createModelClient({
        provider: config.model?.provider as any,
        model: config.model?.model,
        apiKey: config.model?.apiKey,
        baseUrl: config.model?.baseUrl,
      }),
      storage: createStorage(),
    };

    return context;
  }

  /**
   * Derive project info from the project path and config.
   */
  private async getProjectInfo(
    projectPath: string,
    config: QAConfig
  ): Promise<ProjectInfo> {
    const packageJsonPath = path.join(projectPath, 'package.json');

    let name = config?.project?.name || path.basename(projectPath);
    let type: ProjectInfo['type'] = config?.project?.type || 'webapp';
    let framework: string | undefined = config?.project?.framework;

    try {
      const raw = await fs.promises.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(raw);

      if (!config?.project?.name) {
        name = pkg.name || name;
      }

      if (!config?.project?.framework) {
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.react) framework = 'react';
        else if (deps.vue) framework = 'vue';
        else if (deps.angular) framework = 'angular';
        else if (deps.svelte) framework = 'svelte';
        else if (deps.next) framework = 'next';
        else if (deps.nuxt) framework = 'nuxt';
      }

      if (!config?.project?.type) {
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.express || deps.fastify || deps.koa) type = 'api';
        else if (pkg.bin) type = 'cli';
        else if (deps.typescript && !deps.react && !deps.vue) type = 'library';
      }
    } catch {
      // package.json not found, use defaults
    }

    return { name, path: projectPath, type, framework };
  }

  /**
   * Route errors to the onError callback or logger.
   */
  private handleError(error: Error): void {
    if (this.options.onError) {
      this.options.onError(error);
    } else {
      this.logger.error('Watch engine error:', error);
    }
  }
}
