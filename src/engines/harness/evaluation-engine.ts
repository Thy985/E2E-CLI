/**
 * 评估引擎 — Precision / Recall / F1 计算
 *
 * 将 Golden Set 用例输入到 QA-Agent 的诊断和修复流程中，
 * 对比实际结果与期望结果，计算评估指标。
 */

import type {
  GoldenTestCase,
  EvaluationMetrics,
  CaseEvaluation,
  OverallEvaluation,
  EvalOptions,
} from './types';
import { getAllCases } from './golden-set';
import type { Diagnosis } from '../../types';

// ---------------------------------------------------------------------------
// 评估接口
// ---------------------------------------------------------------------------

/** 运行单条用例评估 */
export async function evaluateCase(
  testCase: GoldenTestCase,
  runDiagnosis: (code: string, filePath: string) => Promise<Diagnosis[]>,
): Promise<CaseEvaluation> {
  const startTime = Date.now();

  // 运行诊断
  const actualDiagnosis = await runDiagnosis(testCase.input.code, testCase.input.filePath);

  // 计算诊断指标
  const diagnosis = evaluateDiagnosis(testCase, actualDiagnosis);

  const duration = Date.now() - startTime;

  return {
    caseId: testCase.id,
    skill: testCase.skill,
    difficulty: testCase.difficulty,
    diagnosis,
    fix: {
      precision: 0,
      recall: 0,
      f1: 0,
      fixedCount: 0,
      expectedFixCount: 0,
    },
    overall: {
      precision: diagnosis.precision,
      recall: diagnosis.recall,
      f1: diagnosis.f1,
      passed: diagnosis.f1 >= 0.8,
    },
    duration,
  };
}

/** 评估诊断结果 */
export function evaluateDiagnosis(
  testCase: GoldenTestCase,
  actualDiagnosis: Diagnosis[],
): EvaluationMetrics['diagnosis'] {
  const expectedTypes = new Set(testCase.expectedDiagnosis.issueTypes);
  const falsePositiveTypes = new Set(testCase.expectedDiagnosis.falsePositives ?? []);

  // 实际发现的 ruleId
  const actualTypes = new Set(
    actualDiagnosis
      .map((d) => d.metadata?.ruleId ?? '')
      .filter(Boolean),
  );

  // True Positives: 期望发现的类型且实际发现了
  const tp = [...expectedTypes].filter((t) => actualTypes.has(t)).length;

  // False Positives: 不应发现的类型但实际发现了
  const fp = [...falsePositiveTypes].filter((t) => actualTypes.has(t)).length;

  // False Negatives: 期望发现但实际没发现的
  const fn = [...expectedTypes].filter((t) => !actualTypes.has(t)).length;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    precision,
    recall,
    f1,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    expectedCount: testCase.expectedDiagnosis.issueCount,
    actualCount: actualDiagnosis.length,
    issueTypes: {
      expected: [...expectedTypes],
      actual: [...actualTypes],
      missed: [...expectedTypes].filter((t) => !actualTypes.has(t)),
      extra: [...actualTypes].filter((t) => !expectedTypes.has(t) && !falsePositiveTypes.has(t)),
    },
  };
}

/** 计算整体评估指标 */
export function computeOverallEvaluation(
  evaluations: CaseEvaluation[],
): OverallEvaluation {
  if (evaluations.length === 0) {
    return {
      totalCases: 0,
      passedCases: 0,
      failedCases: 0,
      avgPrecision: 0,
      avgRecall: 0,
      avgF1: 0,
      passRate: 0,
      bySkill: {},
      byDifficulty: {},
    };
  }

  const totalCases = evaluations.length;
  const passedCases = evaluations.filter((e) => e.overall.passed).length;
  const failedCases = totalCases - passedCases;

  const avgPrecision = evaluations.reduce((s, e) => s + e.diagnosis.precision, 0) / totalCases;
  const avgRecall = evaluations.reduce((s, e) => s + e.diagnosis.recall, 0) / totalCases;
  const avgF1 = evaluations.reduce((s, e) => s + e.diagnosis.f1, 0) / totalCases;
  const passRate = passedCases / totalCases;

  // 按 skill 分组统计
  const bySkill: Record<string, { cases: number; passed: number; f1: number }> = {};
  for (const e of evaluations) {
    if (!bySkill[e.skill]) {
      bySkill[e.skill] = { cases: 0, passed: 0, f1: 0 };
    }
    bySkill[e.skill].cases++;
    if (e.overall.passed) bySkill[e.skill].passed++;
    bySkill[e.skill].f1 += e.diagnosis.f1;
  }
  for (const key of Object.keys(bySkill)) {
    bySkill[key].f1 /= bySkill[key].cases;
  }

  // 按 difficulty 分组统计
  const byDifficulty: Record<string, { cases: number; passed: number; f1: number }> = {};
  for (const e of evaluations) {
    if (!byDifficulty[e.difficulty]) {
      byDifficulty[e.difficulty] = { cases: 0, passed: 0, f1: 0 };
    }
    byDifficulty[e.difficulty].cases++;
    if (e.overall.passed) byDifficulty[e.difficulty].passed++;
    byDifficulty[e.difficulty].f1 += e.diagnosis.f1;
  }
  for (const key of Object.keys(byDifficulty)) {
    byDifficulty[key].f1 /= byDifficulty[key].cases;
  }

  return {
    totalCases,
    passedCases,
    failedCases,
    avgPrecision,
    avgRecall,
    avgF1,
    passRate,
    bySkill,
    byDifficulty,
  };
}

/** 运行批量评估 */
export async function evaluateAll(
  runDiagnosis: (code: string, filePath: string) => Promise<Diagnosis[]>,
  options?: EvalOptions,
): Promise<{
  evaluations: CaseEvaluation[];
  overall: OverallEvaluation;
}> {
  let cases = getAllCases();

  // 过滤 skill
  if (options?.skills && options.skills.length > 0) {
    const skillSet = new Set(options.skills);
    cases = cases.filter((c) => skillSet.has(c.skill));
  }

  // 过滤难度
  if (options?.difficulty) {
    cases = cases.filter((c) => c.difficulty === options.difficulty);
  }

  const evaluations: CaseEvaluation[] = [];

  for (const testCase of cases) {
    const eval_ = await evaluateCase(testCase, runDiagnosis);
    evaluations.push(eval_);
  }

  const overall = computeOverallEvaluation(evaluations);

  return { evaluations, overall };
}

/** 回归检测 — 对比两次评估结果 */
export function detectRegression(
  previous: OverallEvaluation,
  current: OverallEvaluation,
): {
  isRegression: boolean;
  details: string[];
} {
  const details: string[] = [];
  let isRegression = false;

  // 整体 F1 下降
  if (current.avgF1 < previous.avgF1 - 0.05) {
    isRegression = true;
    details.push(
      `Overall F1 dropped from ${previous.avgF1.toFixed(3)} to ${current.avgF1.toFixed(3)}`,
    );
  }

  // 通过率下降
  if (current.passRate < previous.passRate - 0.1) {
    isRegression = true;
    details.push(
      `Pass rate dropped from ${(previous.passRate * 100).toFixed(1)}% to ${(current.passRate * 100).toFixed(1)}%`,
    );
  }

  // 按 skill 回归检测
  for (const skill of Object.keys(current.bySkill)) {
    const prev = previous.bySkill[skill];
    const curr = current.bySkill[skill];
    if (prev && curr.f1 < prev.f1 - 0.1) {
      isRegression = true;
      details.push(
        `${skill} F1 dropped from ${prev.f1.toFixed(3)} to ${curr.f1.toFixed(3)}`,
      );
    }
  }

  // 新增的失败用例
  if (current.failedCases > previous.failedCases) {
    details.push(
      `Failed cases increased from ${previous.failedCases} to ${current.failedCases}`,
    );
  }

  return { isRegression, details };
}

/** 生成人类可读的报告 */
export function generateReport(overall: OverallEvaluation): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('  QA-Agent Evaluation Report');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Total Cases:  ${overall.totalCases}`);
  lines.push(`Passed:       ${overall.passedCases} (${(overall.passRate * 100).toFixed(1)}%)`);
  lines.push(`Failed:       ${overall.failedCases}`);
  lines.push('');
  lines.push(`Precision:    ${overall.avgPrecision.toFixed(3)}`);
  lines.push(`Recall:       ${overall.avgRecall.toFixed(3)}`);
  lines.push(`F1 Score:     ${overall.avgF1.toFixed(3)}`);
  lines.push('');

  // By Skill
  lines.push('--- By Skill ---');
  for (const [skill, stats] of Object.entries(overall.bySkill)) {
    const passRate = (stats.passed / stats.cases * 100).toFixed(0);
    lines.push(
      `  ${skill.padEnd(15)} ${stats.cases} cases  ${stats.passed}/${stats.cases} passed (${passRate}%)  F1=${stats.f1.toFixed(3)}`,
    );
  }
  lines.push('');

  // By Difficulty
  lines.push('--- By Difficulty ---');
  for (const [diff, stats] of Object.entries(overall.byDifficulty)) {
    const passRate = (stats.passed / stats.cases * 100).toFixed(0);
    lines.push(
      `  ${diff.padEnd(15)} ${stats.cases} cases  ${stats.passed}/${stats.cases} passed (${passRate}%)  F1=${stats.f1.toFixed(3)}`,
    );
  }
  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}

/** 质量门禁检查 */
export function checkQualityGate(
  overall: OverallEvaluation,
  threshold: number = 80,
): { passed: boolean; details: string[] } {
  const details: string[] = [];
  let passed = true;

  // 通过率检查
  const passRatePct = overall.passRate * 100;
  if (passRatePct < threshold) {
    passed = false;
    details.push(
      `❌ Pass rate ${passRatePct.toFixed(1)}% < threshold ${threshold}%`,
    );
  } else {
    details.push(
      `✅ Pass rate ${passRatePct.toFixed(1)}% >= threshold ${threshold}%`,
    );
  }

  // F1 分数检查
  const f1Pct = overall.avgF1 * 100;
  if (f1Pct < threshold) {
    passed = false;
    details.push(`❌ F1 score ${f1Pct.toFixed(1)}% < threshold ${threshold}%`);
  } else {
    details.push(`✅ F1 score ${f1Pct.toFixed(1)}% >= threshold ${threshold}%`);
  }

  // 各 skill F1 检查
  for (const [skill, stats] of Object.entries(overall.bySkill)) {
    if (stats.f1 * 100 < threshold) {
      passed = false;
      details.push(`❌ ${skill} F1 ${(stats.f1 * 100).toFixed(1)}% < ${threshold}%`);
    } else {
      details.push(`✅ ${skill} F1 ${(stats.f1 * 100).toFixed(1)}% >= ${threshold}%`);
    }
  }

  return { passed, details };
}
