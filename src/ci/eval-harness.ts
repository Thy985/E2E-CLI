/**
 * CI Entry Point for AI Harness Evaluation
 *
 * Run by GitHub Actions to evaluate Golden Set and check quality gate.
 * Exits with non-zero code if F1 score is below threshold.
 *
 * Usage:
 *   bun run src/ci/eval-harness.ts
 *   bun run src/ci/eval-harness.ts --skill security --threshold 85
 */

import {
  getAllCases,
  getCasesBySkill,
} from '../engines/harness/golden-set';
import {
  evaluateCaseWithSkill,
  computeOverallEvaluation,
  generateReport,
  checkQualityGate,
  detectRegression,
} from '../engines/harness/evaluation-engine';
import type { OverallEvaluation, CaseEvaluation } from '../engines/harness/types';
import { getAllSkillInstances } from '../engines/skill-factory';

import * as fs from 'fs';
import * as path from 'path';

const CACHE_DIR = '.qa-eval-cache';
const CACHE_FILE = 'latest-eval.json';

const skillInstances = getAllSkillInstances();

// ---------------------------------------------------------------------------
// Cache management for regression detection
// ---------------------------------------------------------------------------

function loadCachedEval(): OverallEvaluation | null {
  try {
    const cachePath = path.join(CACHE_DIR, CACHE_FILE);
    if (!fs.existsSync(cachePath)) return null;
    const content = fs.readFileSync(cachePath, 'utf-8');
    return JSON.parse(content) as OverallEvaluation;
  } catch {
    return null;
  }
}

function saveEvalCache(overall: OverallEvaluation): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  const cachePath = path.join(CACHE_DIR, CACHE_FILE);
  fs.writeFileSync(cachePath, JSON.stringify(overall, null, 2));
}

// ---------------------------------------------------------------------------
// Main evaluation runner
// ---------------------------------------------------------------------------

interface EvalOptions {
  skill?: string;
  threshold: number;
  jsonOutput?: string;
}

export async function runEvalHarness(options: EvalOptions = { threshold: 80 }): Promise<{
  success: boolean;
  overall: OverallEvaluation;
  regression?: { isRegression: boolean; details: string[] };
}> {
  // eslint-disable-next-line no-console
  console.log('='.repeat(60));
  console.log('  QA-Agent AI Harness Evaluation (CI Mode)');
  console.log('='.repeat(60));
  console.log('');

  let cases = getAllCases();

  if (options.skill) {
    cases = getCasesBySkill(options.skill);
    if (cases.length === 0) {
      // eslint-disable-next-line no-console
      console.error(`[ERROR] Unknown skill: ${options.skill}`);
      process.exit(1);
    }
  }

  if (cases.length === 0) {
    // eslint-disable-next-line no-console
    console.error('[ERROR] No cases match the filters');
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`Running evaluation on ${cases.length} cases...`);
  console.log('');

  const evaluations: CaseEvaluation[] = [];

  for (const testCase of cases) {
    const result = await evaluateCaseWithSkill(testCase, skillInstances);
    if (!result) {
      // eslint-disable-next-line no-console
      console.warn(`[SKIP] ${testCase.id}: no skill for "${testCase.skill}"`);
      continue;
    }

    // eslint-disable-next-line no-console
    const icon = result.overall.passed ? '✅' : '❌';
    // eslint-disable-next-line no-console
    console.log(
      `${icon} ${result.caseId}  F1=${result.overall.f1.toFixed(3)}  ` +
      `(${result.diagnosis.actualCount} found / ${result.diagnosis.expectedCount} expected)`,
    );

    evaluations.push(result);
  }

  // eslint-disable-next-line no-console
  console.log('');

  const overall = computeOverallEvaluation(evaluations);
  const report = generateReport(overall);
  // eslint-disable-next-line no-console
  console.log(report);
  // eslint-disable-next-line no-console
  console.log('');

  // Quality gate
  const gate = checkQualityGate(overall, options.threshold);
  for (const line of gate.details) {
    // eslint-disable-next-line no-console
    console.log(`  ${line}`);
  }
  // eslint-disable-next-line no-console
  console.log('');

  // Regression detection
  let regressionResult: { isRegression: boolean; details: string[] } | undefined;
  const cached = loadCachedEval();
  if (cached) {
    regressionResult = detectRegression(cached, overall);
    if (regressionResult.isRegression) {
      // eslint-disable-next-line no-console
      console.warn('⚠️  Regression detected:');
      for (const detail of regressionResult.details) {
        // eslint-disable-next-line no-console
        console.warn(`  - ${detail}`);
      }
      // eslint-disable-next-line no-console
      console.log('');
    }
  }

  // Save cache for next regression comparison
  saveEvalCache(overall);

  // Write JSON report if requested
  if (options.jsonOutput) {
    const outputPath = options.jsonOutput;
    const reportData = {
      timestamp: new Date().toISOString(),
      overall,
      regression: regressionResult,
      qualityGate: gate,
    };
    fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2));
    // eslint-disable-next-line no-console
    console.log(`JSON report written to: ${outputPath}`);
    // eslint-disable-next-line no-console
    console.log('');
  }

  if (gate.passed) {
    // eslint-disable-next-line no-console
    console.log('✅ Quality gate PASSED');
    return { success: true, overall, regression: regressionResult };
  } else {
    // eslint-disable-next-line no-console
    console.error('❌ Quality gate FAILED');
    return { success: false, overall, regression: regressionResult };
  }
}

// ---------------------------------------------------------------------------
// CLI entry point (when run directly)
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  let skill: string | undefined;
  let threshold = 80;
  let jsonOutput = 'qa-eval-report.json';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--skill' && i + 1 < args.length) {
      skill = args[++i];
    } else if (args[i] === '--threshold' && i + 1 < args.length) {
      threshold = parseInt(args[++i], 10);
    } else if (args[i] === '--json-output' && i + 1 < args.length) {
      jsonOutput = args[++i];
    }
  }

  const result = await runEvalHarness({ skill, threshold, jsonOutput });

  if (!result.success) {
    process.exit(1);
  }
}

// Run if executed directly (not imported)
if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
