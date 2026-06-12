/**
 * Verify Engine - 代码修复验证引擎
 *
 * 多层验证：编译 → 测试 → 格式 → AST diff
 * 确保修复不会引入新的问题。
 */

import { spawn } from 'child_process'
import { resolve } from 'path'

export interface VerifyConfig {
  projectRoot: string
  maxRetries: number
  timeoutMs: number
}

export interface VerifyResult {
  success: boolean
  passedLevels: string[]
  failedLevels: string[]
  errors: string[]
}

export interface VerifyLevel {
  name: string
  verify: (config: VerifyConfig) => Promise<boolean>
}

export class VerifyEngine {
  private config: VerifyConfig
  private levels: VerifyLevel[] = []

  constructor(config: VerifyConfig) {
    this.config = config
  }

  registerLevel(level: VerifyLevel) {
    this.levels.push(level)
  }

  async run(): Promise<VerifyResult> {
    const passedLevels: string[] = []
    const failedLevels: string[] = []
    const errors: string[] = []

    for (const level of this.levels) {
      try {
        const passed = await level.verify(this.config)
        if (passed) {
          passedLevels.push(level.name)
        } else {
          failedLevels.push(level.name)
          errors.push(`${level.name} verification failed`)
        }
      } catch (e) {
        failedLevels.push(level.name)
        errors.push(`${level.name} threw: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return {
      success: failedLevels.length === 0,
      passedLevels,
      failedLevels,
      errors,
    }
  }
}

/**
 * Run a shell command and return success status
 */
function runCommand(cmd: string, cwd: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, { shell: true, cwd, stdio: 'ignore' })
    const timer = setTimeout(() => {
      proc.kill()
      resolve(false)
    }, timeoutMs)

    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0)
    })

    proc.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}
