/**
 * Golden Set 聚合入口
 */

import { a11yGoldenCases } from './a11y';
import { securityGoldenCases } from './security';
import { performanceGoldenCases } from './performance';
import { reactGoldenCases } from './react';
import { vueGoldenCases } from './vue';
import type { GoldenTestCase, GoldenSet } from '../types';

/** 全部 Golden Set 用例 */
const allCases: GoldenTestCase[] = [
  ...a11yGoldenCases,
  ...securityGoldenCases,
  ...performanceGoldenCases,
  ...reactGoldenCases,
  ...vueGoldenCases,
];

/** 按 skill 获取用例 */
export function getCasesBySkill(skill: string): GoldenTestCase[] {
  return allCases.filter((c) => c.skill === skill);
}

/** 获取全部用例 */
export function getAllCases(): GoldenTestCase[] {
  return [...allCases];
}

/** 完整的 Golden Set */
export function getGoldenSet(): GoldenSet {
  return {
    version: '1.0.0',
    cases: allCases,
  };
}

/** 统计信息 */
export function getGoldenSetStats(): {
  total: number;
  bySkill: Record<string, number>;
  byDifficulty: Record<string, number>;
} {
  const bySkill: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};

  for (const c of allCases) {
    bySkill[c.skill] = (bySkill[c.skill] || 0) + 1;
    byDifficulty[c.difficulty] = (byDifficulty[c.difficulty] || 0) + 1;
  }

  return {
    total: allCases.length,
    bySkill,
    byDifficulty,
  };
}
