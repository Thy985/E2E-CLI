/**
 * Prompt Tuner - 自动优化 prompt 策略
 */

import { writeFile, readFile } from 'fs/promises'
import { resolve } from 'path'

export interface PromptTunerConfig {
  storageDir: string
  maxIterations: number
}

export interface TuningResult {
  success: boolean
  iterations: number
  bestScore: number
  optimizedPrompt: string
}

export class PromptTuner {
  private storageDir: string
  private maxIterations: number

  constructor(config: PromptTunerConfig) {
    this.storageDir = config.storageDir
    this.maxIterations = config.maxIterations
  }

  async tune(prompt: string, scoreFn: (p: string) => number): Promise<TuningResult> {
    let bestPrompt = prompt
    let bestScore = scoreFn(prompt)
    let iterations = 0

    for (let i = 0; i < this.maxIterations; i++) {
      const candidate = this.mutate(bestPrompt)
      const candidateScore = scoreFn(candidate)

      if (candidateScore > bestScore) {
        bestPrompt = candidate
        bestScore = candidateScore
      }

      iterations++

      if (bestScore >= 0.95) break
    }

    return {
      success: bestScore > scoreFn(prompt),
      iterations,
      bestScore,
      optimizedPrompt: bestPrompt,
    }
  }

  private mutate(prompt: string): string {
    // 简单的 prompt 变异策略
    const variations = [
      prompt + '\n请确保代码质量。',
      prompt.replace(/请/g, '请务必'),
      prompt + '\n注意：需要覆盖所有边界情况。',
    ]
    return variations[Math.floor(Math.random() * variations.length)]
  }

  async saveHistory(result: TuningResult): Promise<void> {
    const historyPath = resolve(this.storageDir, 'tuning-history.json')
    const history = JSON.parse(await readFile(historyPath, 'utf-8').catch(() => '[]'))
    history.push({ ...result, timestamp: new Date().toISOString() })
    await writeFile(historyPath, JSON.stringify(history, null, 2))
  }
}
