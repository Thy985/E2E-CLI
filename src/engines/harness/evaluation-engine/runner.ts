/**
 * 批量评估入口
 *
 * - runEval: 批量运行 + 聚合 + 报告（含 skill 注入 + 进度回调）
 */

import { getAllSkillInstances } from '../../skill-factory';
import type { CaseEvaluation, EvalOptions, OverallEvaluation } from '../types';
import { getAllCases } from '../golden-set';
import { evaluateCaseWithSkill } from './evaluators';
import { computeOverallEvaluation } from './aggregator';

/** 批量运行评估，返回整体评估结果 */
export async function runEval(
  options: EvalOptions & {
    skill?: string;
    onProgress?: (evaluation: CaseEvaluation) => void;
    onLog?: (line: string) => void;
    verbose?: boolean;
  } = { threshold: 80 },
): Promise<{
  evaluations: CaseEvaluation[];
  overall: OverallEvaluation;
  skipped: number;
}> {
  let cases = getAllCases();

  if (options.skill) {
    const skillCases = cases.filter((c) => c.skill === options.skill);
    if (skillCases.length === 0) {
      throw new Error(`Unknown skill: ${options.skill}`);
    }
    cases = skillCases;
  }

  if (options.difficulty) {
    cases = cases.filter((c) => c.difficulty === options.difficulty);
  }

  if (cases.length === 0) {
    throw new Error('No cases match the filters');
  }

  const skillInstances = getAllSkillInstances();
  const evaluations: CaseEvaluation[] = [];
  let skipped = 0;

  for (const testCase of cases) {
    const result = await evaluateCaseWithSkill(testCase, skillInstances, { onLog: options.onLog });
    if (!result) {
      skipped++;
      continue;
    }

    if (options.onProgress) {
      options.onProgress(result);
    }

    evaluations.push(result);
  }

  const overall = computeOverallEvaluation(evaluations);

  return { evaluations, overall, skipped };
}
