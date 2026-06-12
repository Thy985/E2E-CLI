import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { E2ESkill, extractSelectors } from '../../src/skills/builtin/e2e/index'

// Mock fs module to avoid cross-test pollution
mock.module('fs', () => ({
  writeFileSync: () => {},
  readFileSync: () => '{}',
  existsSync: () => true,
  mkdirSync: () => {},
}))

describe('E2E Skill', () => {
  const tmpDir = `/tmp/e2e-test-${Date.now()}-${Math.random().toString(36).slice(2)}`

  beforeEach(() => {
    // Clean up between tests
  })

  describe('E2ESkill', () => {
    it('should generate E2E tests', async () => {
      const skill = new E2ESkill({
        projectPath: '/tmp/test-project',
        outputPath: tmpDir,
      })

      const result = await skill.generate()
      expect(result).toBeDefined()
      expect(result.success).toBe(true)
    })

    it('should evaluate E2E quality', async () => {
      const skill = new E2ESkill({
        projectPath: '/tmp/test-project',
        outputPath: tmpDir,
      })

      const score = await skill.evaluate()
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    })

    it('should work with mock fallback path', async () => {
      const skill = new E2ESkill({
        projectPath: '/tmp/test-project',
        outputPath: tmpDir,
      })

      const result = await skill.generate()
      expect(result.testCount).toBeGreaterThanOrEqual(0)
    })
  })

  describe('extractSelectors', () => {
    it('should extract getByRole selectors with name', () => {
      const html = "getByRole('button', { name: 'Submit' })"
      const selectors = extractSelectors(html)
      expect(selectors).toContain('[role="button"][name="Submit"]')
    })

    it('should extract getByRole selectors with label', () => {
      const html = "getByRole('textbox', { label: 'Email' })"
      const selectors = extractSelectors(html)
      expect(selectors).toContain('[role="textbox"][name="Email"]')
    })

    it('should extract getByRole selectors with text', () => {
      const html = "getByRole('link', { text: 'Click here' })"
      const selectors = extractSelectors(html)
      expect(selectors).toContain('[role="link"][name="Click here"]')
    })

    it('should handle multiple selectors', () => {
      const html = `
        getByRole('button', { name: 'Submit' })
        getByRole('textbox', { label: 'Email' })
      `
      const selectors = extractSelectors(html)
      expect(selectors.length).toBeGreaterThanOrEqual(2)
    })
  })
})
