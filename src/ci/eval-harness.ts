/**
 * CI/CD Evaluation Harness
 *
 * Orchestrates CI evaluation runs: fetches golden-set, runs evaluation,
 * aggregates results, checks quality gates, and optionally creates PRs.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { EvaluationEngine } from '../engines/harness/evaluation-engine'
import { runA11yEval } from '../engines/harness/evaluation-engine/evaluators'

export interface CIConfig {
  goldenSetPath: string
  threshold: number
  baselineTarget: number
  skillBaseline: number
}

export function loadConfig(path?: string): CIConfig {
  const resolved = resolve(path ?? 'ci-config.json')
  const raw = JSON.parse(readFileSync(resolved, 'utf-8'))
  return {
    goldenSetPath: raw.goldenSetPath ?? 'golden-set/',
    threshold: raw.threshold ?? 0.80,
    baselineTarget: raw.baselineTarget ?? 0.85,
    skillBaseline: raw.skillBaseline ?? 0.75,
  }
}

export async function runCIEvaluation(config: CIConfig) {
  const engine = new EvaluationEngine(config.goldenSetPath)
  const result = await engine.run(config)
  return result
}
