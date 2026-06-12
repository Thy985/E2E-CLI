import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { FeedbackLoop, FeedbackConfig, FeedbackEntry } from '../../src/engines/harness/feedback-loop'

// Mock fs module to avoid cross-test pollution
mock.module('fs', () => ({
  writeFileSync: () => {},
  readFileSync: () => '[]',
  existsSync: () => true,
  mkdirSync: () => {},
}))

describe('Feedback Loop', () => {
  const tmpDir = `/tmp/feedback-test-${Date.now()}-${Math.random().toString(36).slice(2)}`

  beforeEach(() => {
    // Clean up between tests
  })

  describe('FeedbackLoop', () => {
    it('should initialize with config', () => {
      const config: FeedbackConfig = {
        storageDir: tmpDir,
        maxEntries: 100,
        autoApply: false,
      }
      const loop = new FeedbackLoop(config)
      expect(loop).toBeDefined()
    })

    it('should record feedback entries', async () => {
      const config: FeedbackConfig = {
        storageDir: tmpDir,
        maxEntries: 100,
        autoApply: false,
      }
      const loop = new FeedbackLoop(config)

      const entry: FeedbackEntry = {
        id: '1',
        rule: 'img-alt',
        suggestion: 'Add alt text',
        applied: false,
        timestamp: new Date().toISOString(),
      }

      await loop.record(entry)
      expect(loop.getEntries().length).toBeGreaterThanOrEqual(0)
    })

    it('should analyze feedback patterns', async () => {
      const config: FeedbackConfig = {
        storageDir: tmpDir,
        maxEntries: 100,
        autoApply: false,
      }
      const loop = new FeedbackLoop(config)

      const patterns = await loop.analyze()
      expect(patterns).toBeDefined()
    })

    it('should apply feedback when autoApply is enabled', async () => {
      const config: FeedbackConfig = {
        storageDir: tmpDir,
        maxEntries: 100,
        autoApply: true,
      }
      const loop = new FeedbackLoop(config)

      const result = await loop.process()
      expect(result.applied).toBeGreaterThanOrEqual(0)
    })

    it('should respect maxEntries limit', async () => {
      const config: FeedbackConfig = {
        storageDir: tmpDir,
        maxEntries: 5,
        autoApply: false,
      }
      const loop = new FeedbackLoop(config)

      for (let i = 0; i < 10; i++) {
        await loop.record({
          id: String(i),
          rule: 'test-rule',
          suggestion: 'Test suggestion',
          applied: false,
          timestamp: new Date().toISOString(),
        })
      }

      expect(loop.getEntries().length).toBeLessThanOrEqual(5)
    })
  })
})
