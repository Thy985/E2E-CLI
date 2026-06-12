/**
 * Performance Skill - 性能诊断与评分
 */

export interface PerformanceDiagnosis {
  type: string
  severity: 'critical' | 'warning' | 'info'
  message: string
}

export const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 5,
  warning: 3,
  info: 1,
}

export function estimatePerformanceScore(diagnoses: PerformanceDiagnosis[]): number {
  let score = 100
  for (const d of diagnoses) {
    score -= SEVERITY_WEIGHT[d.severity] ?? 0
  }
  if (diagnoses.length > 20) {
    score -= 10
  }
  return Math.max(0, score)
}

export function performanceGrade(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 50) return 'D'
  return 'F'
}

export function runLighthouseAudit(url: string): never {
  throw new Error('Lighthouse audit not yet implemented')
}
