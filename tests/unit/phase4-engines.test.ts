/**
 * Phase 4 Engines Tests
 *
 * Comprehensive tests for PromptTuner and ModelRecommender.
 * (ABTestRunner and FeedbackLoopEngine tests are in their dedicated files:
 *  ab-testing.test.ts and feedback-loop.test.ts, which use fs mocks for CI compatibility.)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { PromptTuner } from '../../src/engines/harness/prompt-tuner';
import { ModelRecommender } from '../../src/engines/harness/model-recommender';
import { EvalHistoryEntry } from '../../src/engines/harness/eval-history';

// ── Helpers for temp directory management ───────────────────────────────────

function createTempDir(prefix: string): string {
  const dir = path.join(
    process.env.TMPDIR || '/tmp',
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── PromptTuner Tests ───────────────────────────────────────────────────────

describe('PromptTuner', () => {
  let tmpDir: string;
  let tuner: PromptTuner;

  beforeEach(() => {
    tmpDir = createTempDir('prompt-tuner');
    tuner = new PromptTuner({ historyDir: tmpDir });
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  function writeHistory(entries: EvalHistoryEntry[]): void {
    const historyFile = path.join(tmpDir, '.qa-history', 'eval-history.json');
    const dir = path.dirname(historyFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(historyFile, JSON.stringify(entries, null, 2));
  }

  describe('analyzeSkillPerformance', () => {
    it('returns needsTuning=false for empty history', () => {
      const result = tuner.analyzeSkillPerformance('a11y', []);
      expect(result.needsTuning).toBe(false);
      expect(result.currentF1).toBe(0);
      expect(result.weakCases).toEqual([]);
      expect(result.failurePatterns).toEqual([]);
    });

    it('returns needsTuning=false when skill not in history', () => {
      const history: EvalHistoryEntry[] = [
        {
          timestamp: new Date().toISOString(),
          totalCases: 10,
          passedCases: 8,
          failedCases: 2,
          avgPrecision: 0.8,
          avgRecall: 0.8,
          avgF1: 0.8,
          passRate: 0.8,
          bySkill: {
            security: { cases: 5, passed: 4, f1: 0.85 },
          },
          byDifficulty: { easy: { cases: 5, passed: 4, f1: 0.8 } },
          qualityGatePassed: true,
        },
      ];
      const result = tuner.analyzeSkillPerformance('a11y', history);
      expect(result.needsTuning).toBe(false);
      expect(result.currentF1).toBe(0);
    });

    it('returns needsTuning=true for low-performing skill', () => {
      const history: EvalHistoryEntry[] = [
        {
          timestamp: new Date().toISOString(),
          totalCases: 10,
          passedCases: 3,
          failedCases: 7,
          avgPrecision: 0.5,
          avgRecall: 0.5,
          avgF1: 0.5,
          passRate: 0.3,
          bySkill: {
            a11y: { cases: 5, passed: 1, f1: 0.4 },
          },
          byDifficulty: { easy: { cases: 5, passed: 1, f1: 0.4 } },
          qualityGatePassed: false,
        },
      ];
      writeHistory(history);
      const result = tuner.analyzeSkillPerformance('a11y', history);
      expect(result.needsTuning).toBe(true);
      expect(result.currentF1).toBeLessThan(0.75);
    });

    it('returns needsTuning=false for high-performing skill', () => {
      const history: EvalHistoryEntry[] = [
        {
          timestamp: new Date().toISOString(),
          totalCases: 10,
          passedCases: 9,
          failedCases: 1,
          avgPrecision: 0.9,
          avgRecall: 0.9,
          avgF1: 0.9,
          passRate: 0.9,
          bySkill: {
            a11y: { cases: 5, passed: 5, f1: 0.95 },
          },
          byDifficulty: { easy: { cases: 5, passed: 5, f1: 0.95 } },
          qualityGatePassed: true,
        },
      ];
      writeHistory(history);
      const result = tuner.analyzeSkillPerformance('a11y', history);
      expect(result.needsTuning).toBe(false);
      expect(result.currentF1).toBeGreaterThan(0.75);
    });

    it('collects failure patterns for low recall and precision', () => {
      const history: EvalHistoryEntry[] = [
        {
          timestamp: new Date().toISOString(),
          totalCases: 10,
          passedCases: 2,
          failedCases: 8,
          avgPrecision: 0.5,
          avgRecall: 0.4,
          avgF1: 0.45,
          passRate: 0.2,
          bySkill: {
            security: { cases: 5, passed: 1, f1: 0.35 },
          },
          byDifficulty: { hard: { cases: 5, passed: 1, f1: 0.35 } },
          qualityGatePassed: false,
        },
      ];
      writeHistory(history);
      const result = tuner.analyzeSkillPerformance('security', history);
      expect(result.needsTuning).toBe(true);
      expect(result.failurePatterns.length).toBeGreaterThan(0);
      expect(result.failurePatterns.some(p => p.includes('low recall'))).toBe(true);
      expect(result.failurePatterns.some(p => p.includes('low precision'))).toBe(true);
      expect(result.failurePatterns.some(p => p.includes('quality gate'))).toBe(true);
    });
  });

  describe('tunePrompt', () => {
    it('generates tuned prompt with enhanced detection for false negatives', () => {
      const result = tuner.tunePrompt(
        'a11y',
        'You are an accessibility checker.',
        ['missed', 'not detected', 'recall'],
      );
      expect(result.skill).toBe('a11y');
      expect(result.originalPrompt).toBe('You are an accessibility checker.');
      expect(result.tunedPrompt).toContain('Enhanced Detection Rules');
      expect(result.tunedPrompt).toContain('Tuned Sections');
      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.improvement.predictedAfterF1).toBeGreaterThan(result.improvement.beforeF1);
    });

    it('generates different prompt for false positives', () => {
      const result = tuner.tunePrompt(
        'security',
        'You are a security checker.',
        ['false positive', 'wrong detection', 'precision'],
      );
      expect(result.tunedPrompt).toContain('Exclusion Rules');
      expect(result.tunedPrompt).toContain('Confidence Threshold');
      expect(result.tunedPrompt).not.toContain('Enhanced Detection Rules');
    });

    it('generates different prompt for fix failures', () => {
      const result = tuner.tunePrompt(
        'performance',
        'You are a performance checker.',
        ['fix failed', 'fix incomplete', 'incomplete fix'],
      );
      expect(result.tunedPrompt).toContain('Fix Instructions');
      expect(result.tunedPrompt).toContain('Fix Validation');
    });

    it('generates general improvements when no specific patterns detected', () => {
      const result = tuner.tunePrompt(
        'react',
        'You are a React checker.',
        ['some unknown pattern'],
      );
      expect(result.tunedPrompt).toContain('General Improvements');
    });

    it('applies accessibility-specific checks for a11y skill', () => {
      const result = tuner.tunePrompt(
        'a11y',
        'You are an accessibility checker.',
        ['missed', 'false negative'],
      );
      expect(result.tunedPrompt).toContain('Accessibility Checks');
      expect(result.tunedPrompt).toContain('ARIA attributes');
    });

    it('applies security-specific checks for security skill', () => {
      const result = tuner.tunePrompt(
        'security',
        'You are a security checker.',
        ['missed', 'false negative'],
      );
      expect(result.tunedPrompt).toContain('Security Checks');
      expect(result.tunedPrompt).toContain('XSS vectors');
    });

    it('applies performance-specific checks for performance skill', () => {
      const result = tuner.tunePrompt(
        'performance',
        'You are a performance checker.',
        ['missed', 'false negative'],
      );
      expect(result.tunedPrompt).toContain('Performance Checks');
      expect(result.tunedPrompt).toContain('re-renders');
    });

    it('generates different prompts for different failure patterns', () => {
      const fnResult = tuner.tunePrompt('a11y', 'Base prompt', ['missed', 'not detected']);
      const fpResult = tuner.tunePrompt('a11y', 'Base prompt', ['false positive', 'incorrect']);

      expect(fnResult.tunedPrompt).not.toBe(fpResult.tunedPrompt);
      expect(fnResult.changes).not.toEqual(fpResult.changes);
    });

    it('handles mixed failure patterns', () => {
      const result = tuner.tunePrompt(
        'a11y',
        'Base prompt',
        ['missed', 'false positive', 'fix failed'],
      );
      expect(result.tunedPrompt).toContain('Enhanced Detection Rules');
      expect(result.tunedPrompt).toContain('Exclusion Rules');
      expect(result.tunedPrompt).toContain('Fix Instructions');
      expect(result.changes.length).toBe(3);
    });
  });

  describe('tuneAllSkills', () => {
    it('only tunes skills that need tuning', () => {
      // Write history where a11y performs poorly, security performs well
      const history: EvalHistoryEntry[] = [
        {
          timestamp: new Date().toISOString(),
          totalCases: 10,
          passedCases: 3,
          failedCases: 7,
          avgPrecision: 0.5,
          avgRecall: 0.4,
          avgF1: 0.45,
          passRate: 0.3,
          bySkill: {
            a11y: { cases: 5, passed: 1, f1: 0.3 },
            security: { cases: 5, passed: 5, f1: 0.95 },
          },
          byDifficulty: { easy: { cases: 5, passed: 1, f1: 0.3 } },
          qualityGatePassed: false,
        },
      ];
      writeHistory(history);

      const results = tuner.tuneAllSkills({
        a11y: 'Accessibility prompt',
        security: 'Security prompt',
      });

      expect(results.length).toBe(1);
      expect(results[0].skill).toBe('a11y');
      expect(results.map(r => r.skill)).not.toContain('security');
    });

    it('tunes multiple skills when all perform poorly', () => {
      const history: EvalHistoryEntry[] = [
        {
          timestamp: new Date().toISOString(),
          totalCases: 10,
          passedCases: 2,
          failedCases: 8,
          avgPrecision: 0.4,
          avgRecall: 0.3,
          avgF1: 0.35,
          passRate: 0.2,
          bySkill: {
            a11y: { cases: 5, passed: 1, f1: 0.3 },
            security: { cases: 5, passed: 1, f1: 0.25 },
          },
          byDifficulty: { hard: { cases: 10, passed: 2, f1: 0.35 } },
          qualityGatePassed: false,
        },
      ];
      writeHistory(history);

      const results = tuner.tuneAllSkills({
        a11y: 'Accessibility prompt',
        security: 'Security prompt',
      });

      expect(results.length).toBe(2);
      expect(results.map(r => r.skill)).toContain('a11y');
      expect(results.map(r => r.skill)).toContain('security');
    });

    it('returns empty array when no skills need tuning', () => {
      const history: EvalHistoryEntry[] = [
        {
          timestamp: new Date().toISOString(),
          totalCases: 10,
          passedCases: 9,
          failedCases: 1,
          avgPrecision: 0.95,
          avgRecall: 0.9,
          avgF1: 0.92,
          passRate: 0.9,
          bySkill: {
            a11y: { cases: 5, passed: 5, f1: 0.95 },
            security: { cases: 5, passed: 4, f1: 0.9 },
          },
          byDifficulty: { easy: { cases: 10, passed: 9, f1: 0.92 } },
          qualityGatePassed: true,
        },
      ];
      writeHistory(history);

      const results = tuner.tuneAllSkills({
        a11y: 'Accessibility prompt',
        security: 'Security prompt',
      });

      expect(results.length).toBe(0);
    });

    it('returns empty array when history is empty', () => {
      const results = tuner.tuneAllSkills({
        a11y: 'Accessibility prompt',
      });
      expect(results.length).toBe(0);
    });
  });

  describe('saveTunedConfig / loadTunedConfig', () => {
    it('saves and loads tuned config correctly', () => {
      const results = tuner.tunePrompt('a11y', 'Original prompt', ['missed', 'recall']);
      const outputPath = path.join(tmpDir, 'test-config.json');

      const savedPath = tuner.saveTunedConfig([results], outputPath);
      expect(fs.existsSync(savedPath)).toBe(true);

      const loaded = tuner.loadTunedConfig(outputPath);
      expect(loaded['a11y']).toBeDefined();
      expect(loaded['a11y']).toContain('Original prompt');
      expect(loaded['a11y']).toContain('Enhanced Detection Rules');
    });

    it('returns empty object for non-existent config file', () => {
      const loaded = tuner.loadTunedConfig(path.join(tmpDir, 'non-existent.json'));
      expect(loaded).toEqual({});
    });
  });
});

// ── ModelRecommender Tests ──────────────────────────────────────────────────

describe('ModelRecommender', () => {
  let recommender: ModelRecommender;

  beforeEach(() => {
    recommender = new ModelRecommender();
  });

  describe('recommendForSkill', () => {
    it('returns valid recommendation with alternatives for known skill', () => {
      const rec = recommender.recommendForSkill('a11y', 'balanced');
      expect(rec.skill).toBe('a11y');
      expect(rec.recommendedModel).toBeDefined();
      expect(rec.provider).toBeDefined();
      expect(rec.reason).toBeDefined();
      expect(rec.alternatives.length).toBe(3);
      expect(rec.alternatives[0].model).toBeDefined();
      expect(rec.alternatives[0].provider).toBeDefined();
      expect(rec.alternatives[0].reason).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(rec.costEstimate);
      expect(['good', 'excellent', 'best']).toContain(rec.qualityEstimate);
    });

    it('returns different models for different priorities', () => {
      const costRec = recommender.recommendForSkill('security', 'cost');
      const qualityRec = recommender.recommendForSkill('security', 'quality');

      // With different priorities, the recommended models should differ
      expect(costRec.recommendedModel).not.toBe(qualityRec.recommendedModel);
      expect(costRec.costEstimate).toBe('low');
      expect(qualityRec.qualityEstimate).toBe('best' || 'excellent');
    });

    it('returns fallback recommendation for unknown skill', () => {
      const rec = recommender.recommendForSkill('unknown-skill', 'balanced');
      expect(rec.skill).toBe('unknown-skill');
      expect(rec.recommendedModel).toBeDefined();
      expect(rec.alternatives.length).toBe(3);
    });

    it('returns consistent results for same inputs', () => {
      const rec1 = recommender.recommendForSkill('performance', 'balanced');
      const rec2 = recommender.recommendForSkill('performance', 'balanced');
      expect(rec1.recommendedModel).toBe(rec2.recommendedModel);
    });

    it('cost-priority recommends cheaper model than quality-priority', () => {
      const costRec = recommender.recommendForSkill('react', 'cost');
      const qualityRec = recommender.recommendForSkill('react', 'quality');
      const costCap = costRec.recommendedModel;
      const qualityCap = qualityRec.recommendedModel;
      // The cost-optimized should have lower cost index than quality-optimized
      expect(costRec.costEstimate).toBe('low');
      expect(qualityRec.costEstimate).not.toBe('low');
    });
  });

  describe('recommendAll', () => {
    it('returns recommendations for all skills', () => {
      const recs = recommender.recommendAll('balanced');
      expect(recs.length).toBeGreaterThan(0);
      // Should cover all known skills
      const skills = recs.map(r => r.skill);
      expect(skills).toContain('a11y');
      expect(skills).toContain('security');
      expect(skills).toContain('performance');
      expect(skills).toContain('react');
      expect(skills).toContain('vue');
      expect(skills).toContain('nextjs');
      expect(skills).toContain('nuxt');
    });

    it('returns different recommendations for different priorities', () => {
      const costRecs = recommender.recommendAll('cost');
      const qualityRecs = recommender.recommendAll('quality');

      const costModels = costRecs.map(r => r.recommendedModel);
      const qualityModels = qualityRecs.map(r => r.recommendedModel);

      expect(costModels).not.toEqual(qualityModels);
    });

    it('all recommendations have valid alternatives', () => {
      const recs = recommender.recommendAll('balanced');
      for (const rec of recs) {
        expect(rec.alternatives.length).toBe(3);
        expect(rec.reason.length).toBeGreaterThan(0);
      }
    });
  });

  describe('estimateCost', () => {
    it('returns reasonable cost estimates', () => {
      const cost = recommender.estimateCost(7, 'balanced');
      expect(cost.total).toBeGreaterThan(0);
      expect(Object.keys(cost.perSkill).length).toBeGreaterThan(0);
    });

    it('cost-priority returns lower total than quality-priority', () => {
      const costEstimate = recommender.estimateCost(7, 'cost');
      const qualityEstimate = recommender.estimateCost(7, 'quality');
      expect(costEstimate.total).toBeLessThan(qualityEstimate.total);
    });

    it('scales cost by skillCount', () => {
      const cost1 = recommender.estimateCost(1, 'balanced');
      const cost7 = recommender.estimateCost(7, 'balanced');
      expect(cost7.total).toBeGreaterThan(cost1.total);
    });

    it('perSkill costs are positive integers', () => {
      const cost = recommender.estimateCost(7, 'balanced');
      for (const [skill, value] of Object.entries(cost.perSkill)) {
        expect(value).toBeGreaterThan(0);
        expect(Number.isInteger(value)).toBe(true);
      }
    });
  });
});