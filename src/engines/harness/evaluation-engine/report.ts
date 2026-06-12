/**
 * 报告生成 + 质量门禁
 *
 * - generateReport: 人类可读的 OverallEvaluation 报告
 * - checkQualityGate: 通过率 / F1 / 各 skill F1 阈值检查
 */

import type { OverallEvaluation } from '../types';

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
