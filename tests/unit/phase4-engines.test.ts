/**
 * Phase 4 Engines Tests
 *
 * Comprehensive tests for PromptTuner, ModelRecommender, ABTestRunner, and FeedbackLoopEngine.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { PromptTuner } from '../../src/engines/harness/prompt-tuner';
import { ModelRecommender } from '../../src/engines/harness/model-recommender';
import {
  ABTestRunner,
  loadABHistory,
  saveABHistory,
  ABTestHistoryEntry,
  ABTestResult,
  ABTestConfig,
} from '../../src/engines/harness/ab-testing';
import {
  FeedbackLoopEngine,
  loadFeedback,
  saveFeedback,
  clearFeedback,
  FeedbackEntry,
  FeedbackAction,
} from '../../src/engines/harness/feedback-loop';
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

// ── ABTestRunner Tests ──────────────────────────────────────────────────────

describe('ABTestRunner', () => {
  let runner: ABTestRunner;
  let abHistoryDir: string;
  let originalCwd: string;

  beforeEach(() => {
    runner = new ABTestRunner();
    originalCwd = process.cwd();
    // Use temp dir for AB history
    abHistoryDir = createTempDir('ab-test');
    process.chdir(abHistoryDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanupDir(abHistoryDir);
  });

  describe('determineWinner', () => {
    it('identifies winner A when F1 difference is large', () => {
      const result = runner.determineWinner(
        { f1: 0.85, passedCases: 8, totalCases: 10 },
        { f1: 0.65, passedCases: 6, totalCases: 10 },
      );
      expect(result.winner).toBe('A');
      expect(result.significance).toBeGreaterThan(0.5);
    });

    it('identifies winner B when F1 difference is large', () => {
      const result = runner.determineWinner(
        { f1: 0.60, passedCases: 5, totalCases: 10 },
        { f1: 0.88, passedCases: 9, totalCases: 10 },
      );
      expect(result.winner).toBe('B');
      expect(result.significance).toBeGreaterThan(0.5);
    });

    it('returns tie when F1 difference is small', () => {
      const result = runner.determineWinner(
        { f1: 0.75, passedCases: 7, totalCases: 10 },
        { f1: 0.74, passedCases: 7, totalCases: 10 },
      );
      expect(result.winner).toBe('tie');
    });

    it('returns tie when F1 difference is zero', () => {
      const result = runner.determineWinner(
        { f1: 0.80, passedCases: 8, totalCases: 10 },
        { f1: 0.80, passedCases: 8, totalCases: 10 },
      );
      expect(result.winner).toBe('tie');
    });

    it('returns tie for marginal differences (0.02 <= diff <= 0.05)', () => {
      const result = runner.determineWinner(
        { f1: 0.75, passedCases: 7, totalCases: 10 },
        { f1: 0.72, passedCases: 7, totalCases: 10 },
      );
      expect(result.winner).toBe('tie');
    });

    it('significance increases with larger F1 difference', () => {
      const small = runner.determineWinner(
        { f1: 0.80, passedCases: 8, totalCases: 10 },
        { f1: 0.70, passedCases: 7, totalCases: 10 },
      );
      const large = runner.determineWinner(
        { f1: 0.90, passedCases: 9, totalCases: 10 },
        { f1: 0.60, passedCases: 6, totalCases: 10 },
      );
      // Both may hit cap=1.0, so at minimum verify large is >= small
      expect(large.significance).toBeGreaterThanOrEqual(small.significance);
      expect(large.significance).toBeGreaterThan(0);
    });
  });

  describe('getBestConfigurations', () => {
    it('returns correct summary with decisive tests', () => {
      const history: ABTestHistoryEntry[] = [
        {
          id: '1',
          config: {
            name: 'test1',
            description: 'Test 1',
            skill: 'a11y',
            variantA: { label: 'prompt-v1' },
            variantB: { label: 'prompt-v2' },
          },
          timestamp: new Date().toISOString(),
          variantA: { label: 'prompt-v1', f1: 0.80, precision: 0.8, recall: 0.8, passedCases: 8, totalCases: 10, avgDuration: 100 },
          variantB: { label: 'prompt-v2', f1: 0.65, precision: 0.65, recall: 0.65, passedCases: 6, totalCases: 10, avgDuration: 120 },
          winner: 'A',
          significance: 0.8,
        },
        {
          id: '2',
          config: {
            name: 'test2',
            description: 'Test 2',
            skill: 'security',
            variantA: { label: 'model-A' },
            variantB: { label: 'model-B' },
          },
          timestamp: new Date().toISOString(),
          variantA: { label: 'model-A', f1: 0.70, precision: 0.7, recall: 0.7, passedCases: 7, totalCases: 10, avgDuration: 150 },
          variantB: { label: 'model-B', f1: 0.90, precision: 0.9, recall: 0.9, passedCases: 9, totalCases: 10, avgDuration: 200 },
          winner: 'B',
          significance: 0.9,
        },
      ];

      const best = runner.getBestConfigurations(history);
      expect(best.length).toBe(2);
      expect(best.map(b => b.skill)).toContain('a11y');
      expect(best.map(b => b.skill)).toContain('security');

      const a11yBest = best.find(b => b.skill === 'a11y');
      expect(a11yBest?.bestVariant.label).toBe('prompt-v1');

      const securityBest = best.find(b => b.skill === 'security');
      expect(securityBest?.bestVariant.label).toBe('model-B');
    });

    it('skips tests with tie results', () => {
      const history: ABTestHistoryEntry[] = [
        {
          id: '1',
          config: {
            name: 'test1',
            description: 'Test 1',
            skill: 'a11y',
            variantA: { label: 'v1' },
            variantB: { label: 'v2' },
          },
          timestamp: new Date().toISOString(),
          variantA: { label: 'v1', f1: 0.75, precision: 0.75, recall: 0.75, passedCases: 7, totalCases: 10, avgDuration: 100 },
          variantB: { label: 'v2', f1: 0.74, precision: 0.74, recall: 0.74, passedCases: 7, totalCases: 10, avgDuration: 110 },
          winner: 'tie',
          significance: 0.3,
        },
      ];

      const best = runner.getBestConfigurations(history);
      expect(best.length).toBe(0);
    });

    it('sorts by improvement descending', () => {
      const history: ABTestHistoryEntry[] = [
        {
          id: '1',
          config: { name: 't1', description: '', skill: 'a11y', variantA: { label: 'a' }, variantB: { label: 'b' } },
          timestamp: new Date().toISOString(),
          variantA: { label: 'a', f1: 0.60, precision: 0.6, recall: 0.6, passedCases: 6, totalCases: 10, avgDuration: 100 },
          variantB: { label: 'b', f1: 0.80, precision: 0.8, recall: 0.8, passedCases: 8, totalCases: 10, avgDuration: 120 },
          winner: 'B',
          significance: 0.9,
        },
        {
          id: '2',
          config: { name: 't2', description: '', skill: 'security', variantA: { label: 'a' }, variantB: { label: 'b' } },
          timestamp: new Date().toISOString(),
          variantA: { label: 'a', f1: 0.75, precision: 0.75, recall: 0.75, passedCases: 7, totalCases: 10, avgDuration: 100 },
          variantB: { label: 'b', f1: 0.78, precision: 0.78, recall: 0.78, passedCases: 8, totalCases: 10, avgDuration: 120 },
          winner: 'B',
          significance: 0.6,
        },
      ];

      const best = runner.getBestConfigurations(history);
      expect(best.length).toBe(2);
      expect(best[0].skill).toBe('a11y'); // Higher improvement first
      expect(best[1].skill).toBe('security');
    });

    it('returns empty array for empty history', () => {
      const best = runner.getBestConfigurations([]);
      expect(best.length).toBe(0);
    });
  });

  describe('loadABHistory / saveABHistory', () => {
    it('saves and loads history correctly', () => {
      // Clean slate
      const histPath = path.join(abHistoryDir, '.qa-ab-history', 'ab-test-history.json');
      if (fs.existsSync(histPath)) fs.unlinkSync(histPath);

      const result: ABTestResult = {
        config: {
          name: 'test-save',
          description: 'Save test',
          skill: 'a11y',
          variantA: { label: 'v1' },
          variantB: { label: 'v2' },
        },
        timestamp: new Date().toISOString(),
        variantA: { label: 'v1', f1: 0.80, precision: 0.8, recall: 0.8, passedCases: 8, totalCases: 10, avgDuration: 100 },
        variantB: { label: 'v2', f1: 0.65, precision: 0.65, recall: 0.65, passedCases: 6, totalCases: 10, avgDuration: 120 },
        winner: 'A',
        significance: 0.8,
      };

      saveABHistory(result);

      const history = loadABHistory();
      expect(history.length).toBe(1);
      expect(history[0].config.skill).toBe('a11y');
      expect(history[0].winner).toBe('A');
      expect(history[0].id).toBeDefined();
    });

    it('appends to existing history', () => {
      const histPath = path.join(abHistoryDir, '.qa-ab-history', 'ab-test-history.json');
      if (fs.existsSync(histPath)) fs.unlinkSync(histPath);

      const baseResult: ABTestResult = {
        config: { name: 't', description: '', skill: 'a11y', variantA: { label: 'a' }, variantB: { label: 'b' } },
        timestamp: new Date().toISOString(),
        variantA: { label: 'a', f1: 0.70, precision: 0.7, recall: 0.7, passedCases: 7, totalCases: 10, avgDuration: 100 },
        variantB: { label: 'b', f1: 0.60, precision: 0.6, recall: 0.6, passedCases: 6, totalCases: 10, avgDuration: 120 },
        winner: 'A',
        significance: 0.5,
      };

      saveABHistory(baseResult);
      saveABHistory({ ...baseResult, config: { ...baseResult.config, skill: 'security' } });

      const history = loadABHistory();
      expect(history.length).toBe(2);
    });

    it('returns empty array when no history file exists', () => {
      const histPath = path.join(abHistoryDir, '.qa-ab-history', 'ab-test-history.json');
      if (fs.existsSync(histPath)) fs.unlinkSync(histPath);

      const history = loadABHistory();
      expect(history).toEqual([]);
    });
  });

  describe('saveResult / loadHistory (instance methods)', () => {
    it('saves result via instance method', () => {
      const histPath = path.join(abHistoryDir, '.qa-ab-history', 'ab-test-history.json');
      if (fs.existsSync(histPath)) fs.unlinkSync(histPath);

      const result: ABTestResult = {
        config: { name: 't', description: '', skill: 'a11y', variantA: { label: 'a' }, variantB: { label: 'b' } },
        timestamp: new Date().toISOString(),
        variantA: { label: 'a', f1: 0.75, precision: 0.75, recall: 0.75, passedCases: 7, totalCases: 10, avgDuration: 100 },
        variantB: { label: 'b', f1: 0.65, precision: 0.65, recall: 0.65, passedCases: 6, totalCases: 10, avgDuration: 120 },
        winner: 'A',
        significance: 0.6,
      };

      runner.saveResult(result);
      const loaded = runner.loadHistory();
      expect(loaded.length).toBe(1);
      expect(loaded[0].config.skill).toBe('a11y');
    });
  });
});

// ── FeedbackLoopEngine Tests ────────────────────────────────────────────────

describe('FeedbackLoopEngine', () => {
  let engine: FeedbackLoopEngine;
  let feedbackDir: string;
  let originalCwd: string;

  beforeEach(() => {
    engine = new FeedbackLoopEngine();
    originalCwd = process.cwd();
    feedbackDir = createTempDir('feedback');
    process.chdir(feedbackDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanupDir(feedbackDir);
  });

  describe('collectFeedback', () => {
    it('creates and saves feedback entry', () => {
      const entry = engine.collectFeedback(
        'a11y',
        'aria-label-missing',
        'accept',
        { notes: 'Good rule', severity: 'critical' },
      );

      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeDefined();
      expect(entry.skill).toBe('a11y');
      expect(entry.ruleId).toBe('aria-label-missing');
      expect(entry.action).toBe('accept');
      expect(entry.notes).toBe('Good rule');
      expect(entry.severity).toBe('critical');

      // Verify it was saved
      const allFeedback = loadFeedback();
      expect(allFeedback.length).toBe(1);
      expect(allFeedback[0].id).toBe(entry.id);
    });

    it('creates entry without optional context', () => {
      const entry = engine.collectFeedback('security', 'xss-check', 'reject');

      expect(entry.skill).toBe('security');
      expect(entry.ruleId).toBe('xss-check');
      expect(entry.action).toBe('reject');
      expect(entry.diagnosisId).toBeUndefined();
      expect(entry.fixId).toBeUndefined();
      expect(entry.notes).toBeUndefined();
    });

    it('creates entries with all action types', () => {
      const actions: FeedbackAction[] = ['accept', 'reject', 'partial', 'ignore'];
      for (const action of actions) {
        const entry = engine.collectFeedback('performance', 'redundant-render', action);
        expect(entry.action).toBe(action);
      }

      const allFeedback = loadFeedback();
      expect(allFeedback.length).toBe(4);
    });
  });

  describe('analyzeFeedback', () => {
    it('returns correct stats for mixed feedback', () => {
      engine.collectFeedback('a11y', 'rule1', 'accept');
      engine.collectFeedback('a11y', 'rule1', 'accept');
      engine.collectFeedback('a11y', 'rule2', 'reject');
      engine.collectFeedback('security', 'rule3', 'accept');
      engine.collectFeedback('security', 'rule3', 'partial');

      const stats = engine.analyzeFeedback();

      expect(stats.totalFeedbacks).toBe(5);
      expect(stats.byAction.accept).toBe(3);
      expect(stats.byAction.reject).toBe(1);
      expect(stats.byAction.partial).toBe(1);
      expect(stats.byAction.ignore).toBe(0);
      expect(stats.acceptRate).toBe(0.6);
      expect(stats.rejectRate).toBe(0.2);
    });

    it('groups stats by skill correctly', () => {
      engine.collectFeedback('a11y', 'rule1', 'accept');
      engine.collectFeedback('a11y', 'rule2', 'reject');
      engine.collectFeedback('security', 'rule3', 'accept');

      const stats = engine.analyzeFeedback();

      expect(stats.bySkill['a11y']).toBeDefined();
      expect(stats.bySkill['a11y'].total).toBe(2);
      expect(stats.bySkill['a11y'].accept).toBe(1);
      expect(stats.bySkill['a11y'].reject).toBe(1);
      expect(stats.bySkill['security'].total).toBe(1);
    });

    it('returns zero stats when no feedback', () => {
      clearFeedback();
      const stats = engine.analyzeFeedback();
      expect(stats.totalFeedbacks).toBe(0);
      expect(stats.acceptRate).toBe(0);
      expect(stats.rejectRate).toBe(0);
    });
  });

  describe('getInsights', () => {
    it('returns per-rule insights', () => {
      // Add feedback for same rule multiple times
      for (let i = 0; i < 5; i++) {
        engine.collectFeedback('a11y', 'aria-label-missing', 'accept');
      }
      for (let i = 0; i < 3; i++) {
        engine.collectFeedback('a11y', 'color-contrast', 'reject');
      }

      const insights = engine.getInsights();

      expect(insights.length).toBe(2);
      const ariaInsight = insights.find(i => i.ruleId === 'aria-label-missing');
      expect(ariaInsight).toBeDefined();
      expect(ariaInsight?.acceptRate).toBe(1.0);
      expect(ariaInsight?.confidence).toBe('medium');
      expect(ariaInsight?.totalFeedbacks).toBe(5);

      const colorInsight = insights.find(i => i.ruleId === 'color-contrast');
      expect(colorInsight).toBeDefined();
      expect(colorInsight?.acceptRate).toBe(0);
    });

    it('returns sorted by acceptRate ascending', () => {
      for (let i = 0; i < 3; i++) {
        engine.collectFeedback('a11y', 'good-rule', 'accept');
      }
      for (let i = 0; i < 3; i++) {
        engine.collectFeedback('a11y', 'bad-rule', 'reject');
      }
      for (let i = 0; i < 3; i++) {
        engine.collectFeedback('a11y', 'mixed-rule', i % 2 === 0 ? 'accept' : 'reject');
      }

      const insights = engine.getInsights();
      expect(insights.length).toBe(3);
      expect(insights[0].acceptRate).toBeLessThanOrEqual(insights[1].acceptRate);
      expect(insights[1].acceptRate).toBeLessThanOrEqual(insights[2].acceptRate);
    });

    it('assigns correct confidence based on sample size', () => {
      // 1 feedback -> low
      engine.collectFeedback('a11y', 'low-sample', 'accept');
      // 3 feedback -> medium
      for (let i = 0; i < 3; i++) {
        engine.collectFeedback('a11y', 'medium-sample', 'accept');
      }
      // 10 feedback -> high
      for (let i = 0; i < 10; i++) {
        engine.collectFeedback('a11y', 'high-sample', 'accept');
      }

      const insights = engine.getInsights();
      const lowInsight = insights.find(i => i.ruleId === 'low-sample');
      const mediumInsight = insights.find(i => i.ruleId === 'medium-sample');
      const highInsight = insights.find(i => i.ruleId === 'high-sample');

      expect(lowInsight?.confidence).toBe('low');
      expect(mediumInsight?.confidence).toBe('medium');
      expect(highInsight?.confidence).toBe('high');
    });
  });

  describe('generateRecommendations', () => {
    it('recommends disable for rules with >80% reject rate and >5 feedbacks', () => {
      // 6 rejections, 1 accept = 85.7% reject
      for (let i = 0; i < 6; i++) {
        engine.collectFeedback('a11y', 'bad-rule', 'reject');
      }
      engine.collectFeedback('a11y', 'bad-rule', 'accept');

      const recs = engine.generateRecommendations();
      const disableRec = recs.find(r => r.type === 'disable' && r.ruleId === 'bad-rule');
      expect(disableRec).toBeDefined();
      expect(disableRec?.priority).toBe('high');
    });

    it('recommends promote for rules with >90% accept rate', () => {
      for (let i = 0; i < 5; i++) {
        engine.collectFeedback('a11y', 'good-rule', 'accept');
      }

      const recs = engine.generateRecommendations();
      const promoteRec = recs.find(r => r.type === 'promote' && r.ruleId === 'good-rule');
      expect(promoteRec).toBeDefined();
      expect(promoteRec?.priority).toBe('medium');
    });

    it('recommends tune for rules with 40-60% accept rate', () => {
      // 3 accept, 3 reject = 50% accept
      for (let i = 0; i < 3; i++) {
        engine.collectFeedback('a11y', 'mixed-rule', 'accept');
        engine.collectFeedback('a11y', 'mixed-rule', 'reject');
      }

      const recs = engine.generateRecommendations();
      const tuneRec = recs.find(r => r.type === 'tune' && r.ruleId === 'mixed-rule');
      expect(tuneRec).toBeDefined();
      expect(tuneRec?.priority).toBe('medium');
    });

    it('recommends investigate for rules with mixed feedback', () => {
      // 2 accept, 3 reject, 1 partial = 33.3% accept (not in 40-60% tune range)
      // rejectRate=50% (not >80% so not disable), total=6
      for (let i = 0; i < 2; i++) {
        engine.collectFeedback('a11y', 'mixed-rule', 'accept');
      }
      for (let i = 0; i < 3; i++) {
        engine.collectFeedback('a11y', 'mixed-rule', 'reject');
      }
      engine.collectFeedback('a11y', 'mixed-rule', 'partial');

      const recs = engine.generateRecommendations();
      const investigateRec = recs.find(r => r.type === 'investigate' && r.ruleId === 'mixed-rule');
      expect(investigateRec).toBeDefined();
      expect(investigateRec?.priority).toBe('low');
    });

    it('returns empty recommendations when no feedback', () => {
      clearFeedback();
      const recs = engine.generateRecommendations();
      expect(recs.length).toBe(0);
    });

    it('sorts recommendations by priority', () => {
      // High priority (disable)
      for (let i = 0; i < 6; i++) {
        engine.collectFeedback('a11y', 'bad-rule', 'reject');
      }
      engine.collectFeedback('a11y', 'bad-rule', 'accept');

      // Medium priority (promote)
      for (let i = 0; i < 5; i++) {
        engine.collectFeedback('a11y', 'good-rule', 'accept');
      }

      // Low priority (investigate)
      for (let i = 0; i < 2; i++) {
        engine.collectFeedback('a11y', 'mixed-rule', 'accept');
        engine.collectFeedback('a11y', 'mixed-rule', 'reject');
      }
      engine.collectFeedback('a11y', 'mixed-rule', 'partial');

      const recs = engine.generateRecommendations();
      expect(recs.length).toBeGreaterThan(0);

      const priorities = recs.map(r => r.priority);
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < priorities.length; i++) {
        expect(order[priorities[i]]).toBeGreaterThanOrEqual(order[priorities[i - 1]]);
      }
    });

    it('returns different recommendations based on different patterns', () => {
      clearFeedback();

      // Pattern A: High reject -> disable
      for (let i = 0; i < 7; i++) {
        engine.collectFeedback('a11y', 'rule-a', 'reject');
      }
      const recsA = engine.generateRecommendations();
      expect(recsA.some(r => r.type === 'disable' && r.ruleId === 'rule-a')).toBe(true);

      // Pattern B: High accept -> promote
      for (let i = 0; i < 5; i++) {
        engine.collectFeedback('security', 'rule-b', 'accept');
      }
      const recsB = engine.generateRecommendations();
      expect(recsB.some(r => r.type === 'promote' && r.ruleId === 'rule-b')).toBe(true);
    });
  });

  describe('loadFeedback / saveFeedback / clearFeedback', () => {
    it('saveFeedback saves entries that loadFeedback can retrieve', () => {
      clearFeedback();

      const entry: FeedbackEntry = {
        id: 'test-123',
        timestamp: new Date().toISOString(),
        skill: 'a11y',
        ruleId: 'test-rule',
        action: 'accept',
        notes: 'test note',
      };

      saveFeedback(entry);

      const loaded = loadFeedback();
      expect(loaded.length).toBe(1);
      expect(loaded[0].id).toBe('test-123');
      expect(loaded[0].skill).toBe('a11y');
    });

    it('clearFeedback removes all entries', () => {
      engine.collectFeedback('a11y', 'rule1', 'accept');
      engine.collectFeedback('a11y', 'rule2', 'reject');

      expect(loadFeedback().length).toBe(2);

      clearFeedback();

      expect(loadFeedback().length).toBe(0);
    });

    it('loadFeedback returns empty array when no file exists', () => {
      clearFeedback();
      const loaded = loadFeedback();
      expect(loaded).toEqual([]);
    });

    it('saveFeedback prepends entries (most recent first)', () => {
      clearFeedback();

      saveFeedback({
        id: 'first',
        timestamp: new Date().toISOString(),
        skill: 'a11y',
        ruleId: 'rule',
        action: 'accept',
      });
      saveFeedback({
        id: 'second',
        timestamp: new Date().toISOString(),
        skill: 'a11y',
        ruleId: 'rule',
        action: 'reject',
      });

      const loaded = loadFeedback();
      expect(loaded[0].id).toBe('second');
      expect(loaded[1].id).toBe('first');
    });
  });

  describe('getSkillStats', () => {
    it('returns correct skill-level summary', () => {
      engine.collectFeedback('a11y', 'rule1', 'accept');
      engine.collectFeedback('a11y', 'rule1', 'accept');
      engine.collectFeedback('a11y', 'rule2', 'reject');
      engine.collectFeedback('security', 'rule3', 'reject');

      const stats = engine.getSkillStats('a11y');

      expect(stats.totalFeedbacks).toBe(3);
      expect(stats.acceptRate).toBe(2 / 3);
      expect(stats.topRejectedRules.length).toBe(1);
      expect(stats.topRejectedRules[0].ruleId).toBe('rule2');
    });

    it('returns zero stats for skill with no feedback', () => {
      engine.collectFeedback('security', 'rule1', 'accept');

      const stats = engine.getSkillStats('a11y');
      expect(stats.totalFeedbacks).toBe(0);
      expect(stats.acceptRate).toBe(0);
      expect(stats.topRejectedRules.length).toBe(0);
    });
  });
});
