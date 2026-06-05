/**
 * Score and grade calculation for the report engine
 */

export interface IssueLike {
  severity: string;
}

export const SEVERITY_WEIGHTS = {
  critical: 10,
  warning: 3,
  info: 1,
} as const;

export function calculateScore(
  issues: readonly IssueLike[],
  weights: Record<string, number> = SEVERITY_WEIGHTS
): number {
  const deductions = issues.reduce((sum, issue) => {
    return sum + (weights[issue.severity] || 0);
  }, 0);
  return Math.max(0, 100 - deductions);
}

export function getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}
