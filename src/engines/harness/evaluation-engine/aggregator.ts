/**
 * 评估聚合：批量运行 + 整体指标 + 回归检测
 *
 * - evaluateAll: 批量运行所有 Golden Set 用例（按 skill/difficulty 过滤）
 * - computeOverallEvaluation: 从 CaseEvaluation[] 聚合 OverallEvaluation
 * - detectRegression: 对比两次评估结果，识别 F1 / passRate 退化
 */

import type { Diagnosis, Fix } from '../../../types';
import type { CaseEvaluation, EvalOptions, OverallEvaluation } from '../types';
import { getAllCases } from '../golden-set';
import { evaluateCase } from './evaluators';

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

/** 批量运行所有 Golden Set 用例评估（按 skill/difficulty 过滤） */
export async function evaluateAll(
  runDiagnosis: (code: string, filePath: string) => Promise<Diagnosis[]>,
  runFix?: (code: string, diagnosis: Diagnosis[]) => Promise<Fix[] | null>,
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
    const eval_ = await evaluateCase(testCase, runDiagnosis, runFix);
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
