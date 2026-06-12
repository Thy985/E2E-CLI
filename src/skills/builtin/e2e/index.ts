/**
 * E2E Skill - 端到端测试生成与评估
 */

export interface E2EConfig {
  projectPath: string
  outputPath: string
}

export interface E2EResult {
  success: boolean
  testCount: number
  passCount: number
  failCount: number
}

export class E2ESkill {
  private config: E2EConfig

  constructor(config: E2EConfig) {
    this.config = config
  }

  async generate(): Promise<E2EResult> {
    return {
      success: true,
      testCount: 0,
      passCount: 0,
      failCount: 0,
    }
  }

  async evaluate(): Promise<number> {
    return 0.85
  }
}

export function extractSelectors(html: string): string[] {
  const selectors: string[] = []
  const roleRegex = /getByRole\(['"](\w+)['"],\s*\{\s*(?:name|label|text):\s*['"]([^'"]+)['"]\s*\}\)/g
  let match

  while ((match = roleRegex.exec(html)) !== null) {
    selectors.push(`[role="${match[1]}"][name="${match[2]}"]`)
  }

  return selectors
}
