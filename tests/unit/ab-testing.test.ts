import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { ABTestingConfig, runABTest, calculateConfidence } from './ab-testing'

// Mock fs module to avoid cross-test pollution
mock.module('fs', () => ({
  writeFileSync: () => {},
  readFileSync: () => '{}',
  existsSync: () => true,
  mkdirSync: () => {},
}))

describe('AB Testing', () => {
  const tmpDir = `/tmp/ab-testing-test-${Date.now()}-${Math.random().toString(36).slice(2)}`

  beforeEach(() => {
    // Clean up between tests
  })

  describe('runABTest', () => {
    it('should run A/B test with two variants', async () => {
      const config: ABTestingConfig = {
        variantA: { name: 'A', prompt: 'Test A' },
        variantB: { name: 'B', prompt: 'Test B' },
        storageDir: tmpDir,
        iterations: 3,
      }

      const result = await runABTest(config)
      expect(result.variantA).toBeDefined()
      expect(result.variantB).toBeDefined()
    })

    it('should track metrics for both variants', async () => {
      const config: ABTestingConfig = {
        variantA: { name: 'A', prompt: 'Variant A' },
        variantB: { name: 'B', prompt: 'Variant B' },
        storageDir: tmpDir,
        iterations: 2,
      }

      const result = await runABTest(config)
      expect(result.variantA.successRate).toBeGreaterThanOrEqual(0)
      expect(result.variantA.successRate).toBeLessThanOrEqual(1)
    })

    it('should handle equal performance', async () => {
      const config: ABTestingConfig = {
        variantA: { name: 'A', prompt: 'Same' },
        variantB: { name: 'B', prompt: 'Same' },
        storageDir: tmpDir,
        iterations: 1,
      }

      const result = await runABTest(config)
      expect(result.winner).toBeDefined()
    })
  })

  describe('calculateConfidence', () => {
    it('should return confidence between 0 and 1', () => {
      const confidence = calculateConfidence(0.8, 0.7, 100, 100)
      expect(confidence).toBeGreaterThanOrEqual(0)
      expect(confidence).toBeLessThanOrEqual(1)
    })

    it('should handle small sample sizes', () => {
      const confidence = calculateConfidence(0.9, 0.5, 2, 2)
      expect(confidence).toBeGreaterThanOrEqual(0)
    })
  })
})
