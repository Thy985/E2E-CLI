/**
 * A/B Testing Framework — 对比不同 prompt 或模型在 Golden Set 上的表现
 *
 * 允许对同一 skill 的两个变体（不同 prompt / 不同模型）进行对比测试，
 * 收集 F1、precision、recall、pass rate、duration 等指标，
 * 并基于统计比较确定优胜者。
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GoldenTestCase } from './types';
import type { Diagnosis } from '../../types';
import { generateId } from '../../utils';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface ABTestConfig {
  name: string;
  description: string;
  skill: string;
  variantA: {
    label: string;
    prompt?: string;
    model?: string;
  };
  variantB: {
    label: string;
    prompt?: string;
    model?: string;
  };
}

export interface ABTestResult {
  config: ABTestConfig;
  timestamp: string;
  variantA: {
    label: string;
    f1: number;
    precision: number;
    recall: number;
    passedCases: number;
    totalCases: number;
    avgDuration: number;
  };
  variantB: {
    label: string;
    f1: number;
    precision: number;
    recall: number;
    passedCases: number;
    totalCases: number;
    avgDuration: number;
  };
  winner: 'A' | 'B' | 'tie';
  significance: number; // 0-1, how confident we are in the result
}

export interface ABTestHistoryEntry extends ABTestResult {
  id: string;
}

// ---------------------------------------------------------------------------
// 存储
// ---------------------------------------------------------------------------

const AB_HISTORY_DIR = '.qa-ab-history';
const AB_HISTORY_FILE = 'ab-test-history.json';

function resolveStorage(basePath?: string): { dir: string; file: string } {
  const root = basePath || process.cwd();
  const dir = path.join(root, AB_HISTORY_DIR);
  const file = path.join(dir, AB_HISTORY_FILE);
  return { dir, file };
}

export function loadABHistory(basePath?: string): ABTestHistoryEntry[] {
  const { file: filePath } = resolveStorage(basePath);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as ABTestHistoryEntry[];
  } catch {
    return [];
  }
}

export function saveABHistory(result: ABTestResult, basePath?: string): void {
  const history = loadABHistory(basePath);
  const entry: ABTestHistoryEntry = {
    ...result,
    id: generateId(),
  };
  history.push(entry);
  const { dir, file: filePath } = resolveStorage(basePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf-8');
}

export function getRecentABTests(count = 10, basePath?: string): ABTestHistoryEntry[] {
  const history = loadABHistory(basePath);
  return history.slice(-count).reverse();
}

// ---------------------------------------------------------------------------
// 统计比较
// ---------------------------------------------------------------------------

/**
 * 比较两个变体并确定优胜者。
 * 规则：
 *   - F1 差异 > 0.05 → 判定优胜者
 *   - F1 差异 < 0.02 → 平局
 *   - 介于两者之间 → 按 pass rate 辅助判定
 * significance 基于 F1 差异和样本量计算。
 */
export function determineWinner(
  variantA: { f1: number; passedCases: number; totalCases: number },
  variantB: { f1: number; passedCases: number; totalCases: number },
): { winner: 'A' | 'B' | 'tie'; significance: number } {
  const f1Diff = Math.abs(variantA.f1 - variantB.f1);
  const totalSamples = variantA.totalCases + variantB.totalCases;

  // Base significance from F1 difference (capped at 1.0)
  // 0.05 diff → ~0.5 significance, 0.10 diff → ~1.0
  let significance = Math.min(1, f1Diff / 0.1);

  // Boost significance with more samples (up to +0.2)
  const sampleBoost = Math.min(0.2, (totalSamples / 100) * 0.2);
  significance = Math.min(1, significance + sampleBoost);

  if (f1Diff > 0.05) {
    const winner = variantA.f1 > variantB.f1 ? 'A' : 'B';
    return { winner, significance: Math.round(significance * 1000) / 1000 };
  }

  if (f1Diff < 0.02) {
    // Tie confidence: 1.0 at perfect equality, tapering to ~0 near threshold
    return { winner: 'tie', significance: Math.round((1 - f1Diff / 0.02) * 1000) / 1000 };
  }

  // 0.02 <= diff <= 0.05 → tie but low confidence
  return { winner: 'tie', significance: Math.round(significance * 0.5 * 1000) / 1000 };
}

// ---------------------------------------------------------------------------
// 聚合单变体指标
// ---------------------------------------------------------------------------

interface VariantMetrics {
  label: string;
  f1: number;
  precision: number;
  recall: number;
  passedCases: number;
  totalCases: number;
  avgDuration: number;
}

function aggregateMetrics(
  caseResults: Array<{
    precision: number;
    recall: number;
    f1: number;
    passed: boolean;
    duration: number;
  }>,
  label: string,
): VariantMetrics {
  const n = caseResults.length;
  if (n === 0) {
    return { label, f1: 0, precision: 0, recall: 0, passedCases: 0, totalCases: 0, avgDuration: 0 };
  }

  const avgPrecision = caseResults.reduce((s, r) => s + r.precision, 0) / n;
  const avgRecall = caseResults.reduce((s, r) => s + r.recall, 0) / n;
  // F1 computed from macro-averaged precision and recall: 2*P*R/(P+R)
  const f1 = avgPrecision + avgRecall > 0
    ? (2 * avgPrecision * avgRecall) / (avgPrecision + avgRecall)
    : 0;
  const passedCases = caseResults.filter((r) => r.passed).length;
  const sumDuration = caseResults.reduce((s, r) => s + r.duration, 0);

  return {
    label,
    f1: Math.round(f1 * 1000) / 1000,
    precision: Math.round(avgPrecision * 1000) / 1000,
    recall: Math.round(avgRecall * 1000) / 1000,
    passedCases,
    totalCases: n,
    avgDuration: Math.round(sumDuration / n),
  };
}

// ---------------------------------------------------------------------------
// A/B Test Runner
// ---------------------------------------------------------------------------

export class ABTestRunner {
  // ---------------------------------------------------------------------------
  // Run a single A/B test for a skill
  // ---------------------------------------------------------------------------
  async runTest(
    config: ABTestConfig,
    cases: GoldenTestCase[],
    diagnoseFn?: (
      skill: string,
      variant: { prompt?: string; model?: string },
      testCase: GoldenTestCase,
    ) => Promise<Diagnosis[]>,
  ): Promise<ABTestResult> {
    const filteredCases = cases.filter((c) => c.skill === config.skill);

    // Run Variant A
    const resultsA = await this.runVariant(
      config.variantA,
      config.skill,
      filteredCases,
      diagnoseFn,
    );

    // Run Variant B
    const resultsB = await this.runVariant(
      config.variantB,
      config.skill,
      filteredCases,
      diagnoseFn,
    );

    // Aggregate
    const variantAMetrics = aggregateMetrics(resultsA, config.variantA.label);
    const variantBMetrics = aggregateMetrics(resultsB, config.variantB.label);

    // Determine winner
    const { winner, significance } = determineWinner(variantAMetrics, variantBMetrics);

    return {
      config,
      timestamp: new Date().toISOString(),
      variantA: variantAMetrics,
      variantB: variantBMetrics,
      winner,
      significance,
    };
  }

  // ---------------------------------------------------------------------------
  // Run multiple A/B tests and collect results
  // ---------------------------------------------------------------------------
  async runTests(
    configs: ABTestConfig[],
    allCases: GoldenTestCase[],
    diagnoseFn?: (
      skill: string,
      variant: { prompt?: string; model?: string },
      testCase: GoldenTestCase,
    ) => Promise<Diagnosis[]>,
  ): Promise<ABTestResult[]> {
    const results: ABTestResult[] = [];
    for (const config of configs) {
      const result = await this.runTest(config, allCases, diagnoseFn);
      results.push(result);
    }
    return results;
  }

  private storageDir: string | undefined;

  constructor(opts?: { storageDir?: string }) {
    this.storageDir = opts?.storageDir;
  }

  // ---------------------------------------------------------------------------
  // Save test result to history
  // ---------------------------------------------------------------------------
  saveResult(result: ABTestResult): void {
    saveABHistory(result, this.storageDir);
  }

  // ---------------------------------------------------------------------------
  // Load test history
  // ---------------------------------------------------------------------------
  loadHistory(): ABTestHistoryEntry[] {
    return loadABHistory(this.storageDir);
  }

  // ---------------------------------------------------------------------------
  // Compare two variants and determine winner with statistical significance
  // ---------------------------------------------------------------------------
  determineWinner(
    variantA: { f1: number; passedCases: number; totalCases: number },
    variantB: { f1: number; passedCases: number; totalCases: number },
  ): { winner: 'A' | 'B' | 'tie'; significance: number } {
    return determineWinner(variantA, variantB);
  }

  // ---------------------------------------------------------------------------
  // Get summary of best-performing configurations per skill
  // ---------------------------------------------------------------------------
  getBestConfigurations(
    history: ABTestHistoryEntry[],
  ): Array<{
    skill: string;
    bestVariant: { label: string; f1: number };
    improvement: number;
  }> {
    // Group by skill
    const bySkill = new Map<string, ABTestHistoryEntry[]>();
    for (const entry of history) {
      const skill = entry.config.skill;
      if (!bySkill.has(skill)) {
        bySkill.set(skill, []);
      }
      bySkill.get(skill)!.push(entry);
    }

    const results: Array<{
      skill: string;
      bestVariant: { label: string; f1: number };
      improvement: number;
    }> = [];

    for (const [skill, entries] of bySkill) {
      // Pick the most recent test that has a clear winner
      const decisive = [...entries].reverse().find((e) => e.winner !== 'tie');
      if (!decisive) continue;

      const winnerMetrics = decisive.winner === 'A' ? decisive.variantA : decisive.variantB;
      const loserMetrics = decisive.winner === 'A' ? decisive.variantB : decisive.variantA;

      const improvement =
        loserMetrics.f1 > 0
          ? Math.round(((winnerMetrics.f1 - loserMetrics.f1) / loserMetrics.f1) * 1000) / 1000
          : Math.round(winnerMetrics.f1 * 1000) / 1000;

      results.push({
        skill,
        bestVariant: {
          label: winnerMetrics.label,
          f1: winnerMetrics.f1,
        },
        improvement,
      });
    }

    // Sort by improvement descending
    return results.sort((a, b) => b.improvement - a.improvement);
  }

  // ---------------------------------------------------------------------------
  // Internal: run diagnosis for one variant across all cases
  // ---------------------------------------------------------------------------
  private async runVariant(
    variant: { label: string; prompt?: string; model?: string },
    skill: string,
    cases: GoldenTestCase[],
    diagnoseFn?: (
      skill: string,
      variant: { prompt?: string; model?: string },
      testCase: GoldenTestCase,
    ) => Promise<Diagnosis[]>,
  ): Promise<
    Array<{
      precision: number;
      recall: number;
      f1: number;
      passed: boolean;
      duration: number;
    }>
  > {
    const results: Array<{
      precision: number;
      recall: number;
      f1: number;
      passed: boolean;
      duration: number;
    }> = [];

    for (const testCase of cases) {
      const start = Date.now();

      if (!diagnoseFn) {
        // No diagnose function provided — return zero metrics
        results.push({
          precision: 0,
          recall: 0,
          f1: 0,
          passed: false,
          duration: Date.now() - start,
        });
        continue;
      }

      const diagnosis = await diagnoseFn(skill, variant, testCase);

      // Compute simple metrics from the diagnosis
      const expectedTypes = new Set(testCase.expectedDiagnosis.issueTypes);
      const actualTypes = new Set(
        diagnosis.map((d) => d.metadata?.ruleId ?? '').filter(Boolean),
      );

      const tp = [...expectedTypes].filter((t) => actualTypes.has(t)).length;
      const fp = [...actualTypes].filter((t) => !expectedTypes.has(t)).length;
      const fn = [...expectedTypes].filter((t) => !actualTypes.has(t)).length;

      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

      results.push({
        precision,
        recall,
        f1,
        passed: f1 >= 0.8,
        duration: Date.now() - start,
      });
    }

    return results;
  }
}
