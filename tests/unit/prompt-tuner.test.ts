/**
 * PromptTuner Unit Tests
 *
 * Comprehensive tests for the PromptTuning engine covering:
 * - Constructor
 * - analyzeSkillPerformance
 * - analyzeFailurePatterns
 * - tunePrompt
 * - tuneAllSkills
 * - saveTunedConfig
 * - loadTunedConfig
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { PromptTuner, type PromptTuningResult } from '../../src/engines/harness/prompt-tuner';
import type { EvalHistoryEntry } from '../../src/engines/harness/eval-history';

// ── Temp directory helpers ──────────────────────────────────────────────────

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

// ── History builder helper ─────────────────────────────────────────────────

function makeHistoryEntry(overrides: Partial<EvalHistoryEntry> = {}): EvalHistoryEntry {
  return {
    timestamp: '2025-01-01T00:00:00.000Z',
    totalCases: 10,
    passedCases: 5,
    failedCases: 5,
    avgPrecision: 0.6,
    avgRecall: 0.6,
    avgF1: 0.6,
    passRate: 0.5,
    bySkill: {},
    byDifficulty: {},
    qualityGatePassed: true,
    ...overrides,
  };
}

function makeSkillData(overrides: Partial<{ cases: number; passed: number; f1: number }> = {}) {
  return {
    cases: 10,
    passed: 5,
    f1: 0.5,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('PromptTuner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir('prompt-tuner');
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Constructor Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('Constructor', () => {
    it('creates instance without options', () => {
      const tuner = new PromptTuner();
      expect(tuner).toBeInstanceOf(PromptTuner);
    });

    it('creates instance with options', () => {
      const tuner = new PromptTuner({ historyDir: '/some/path' });
      expect(tuner).toBeInstanceOf(PromptTuner);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // analyzeSkillPerformance Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('analyzeSkillPerformance', () => {
    it('returns needsTuning=false when history is empty', () => {
      const tuner = new PromptTuner();
      const result = tuner.analyzeSkillPerformance('test-skill', []);

      expect(result.needsTuning).toBe(false);
      expect(result.currentF1).toBe(0);
      expect(result.weakCases).toEqual([]);
      expect(result.failurePatterns).toEqual([]);
    });

    it('returns needsTuning=false when no skill entries in history', () => {
      const tuner = new PromptTuner();
      const history = [
        makeHistoryEntry({
          bySkill: { 'other-skill': makeSkillData() },
        }),
      ];
      const result = tuner.analyzeSkillPerformance('test-skill', history);

      expect(result.needsTuning).toBe(false);
      expect(result.currentF1).toBe(0);
      expect(result.weakCases).toEqual([]);
      expect(result.failurePatterns).toEqual([]);
    });

    it('identifies skills needing tuning when avg F1 < 0.75', () => {
      const tuner = new PromptTuner();
      const history = [
        makeHistoryEntry({
          timestamp: '2025-01-01T00:00:00.000Z',
          failedCases: 4,
          avgRecall: 0.6,
          avgPrecision: 0.6,
          avgF1: 0.6,
          qualityGatePassed: false,
          bySkill: {
            'accessibility-check': makeSkillData({ cases: 10, passed: 4, f1: 0.4 }),
          },
        }),
        makeHistoryEntry({
          timestamp: '2025-01-02T00:00:00.000Z',
          failedCases: 5,
          avgRecall: 0.5,
          avgPrecision: 0.5,
          avgF1: 0.5,
          qualityGatePassed: false,
          bySkill: {
            'accessibility-check': makeSkillData({ cases: 10, passed: 3, f1: 0.3 }),
          },
        }),
      ];

      const result = tuner.analyzeSkillPerformance('accessibility-check', history);

      expect(result.needsTuning).toBe(true);
      expect(result.currentF1).toBeCloseTo(0.35, 2);
    });

    it('does not need tuning when avg F1 >= 0.75', () => {
      const tuner = new PromptTuner();
      const history = [
        makeHistoryEntry({
          bySkill: {
            'good-skill': makeSkillData({ cases: 10, passed: 9, f1: 0.85 }),
          },
          failedCases: 1,
        }),
      ];

      const result = tuner.analyzeSkillPerformance('good-skill', history);

      expect(result.needsTuning).toBe(false);
      expect(result.currentF1).toBeCloseTo(0.85, 2);
    });

    it('identifies weak cases and failure patterns', () => {
      const tuner = new PromptTuner();
      const history = [
        makeHistoryEntry({
          timestamp: '2025-01-01T00:00:00.000Z',
          failedCases: 6,
          avgRecall: 0.5,
          avgPrecision: 0.5,
          avgF1: 0.5,
          qualityGatePassed: false,
          bySkill: {
            'security-check': makeSkillData({ cases: 10, passed: 2, f1: 0.2 }),
          },
        }),
      ];

      const result = tuner.analyzeSkillPerformance('security-check', history);

      expect(result.needsTuning).toBe(true);
      expect(result.weakCases.length).toBeGreaterThan(0);
      expect(result.failurePatterns.length).toBeGreaterThan(0);
      expect(result.failurePatterns.some((p) => p.includes('recall'))).toBe(true);
      expect(result.failurePatterns.some((p) => p.includes('quality'))).toBe(true);
      expect(result.failurePatterns.some((p) => p.includes('quality gate'))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // tunePrompt Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('tunePrompt', () => {
    it('generates tuned prompt for false negative scenario', () => {
      const tuner = new PromptTuner();
      const originalPrompt = 'Check for accessibility issues in the code.';
      const failurePatterns = ['missed', 'not detected', 'false negative'];

      const result = tuner.tunePrompt('a11y-check', originalPrompt, failurePatterns);

      expect(result.skill).toBe('a11y-check');
      expect(result.originalPrompt).toBe(originalPrompt);
      expect(result.tunedPrompt).toContain(originalPrompt);
      expect(result.tunedPrompt).toContain('Enhanced Detection Rules');
      expect(result.tunedPrompt).toContain('Accessibility Checks');
      expect(result.improvement.beforeF1).toBeGreaterThanOrEqual(0);
      expect(result.improvement.predictedAfterF1).toBeGreaterThan(result.improvement.beforeF1);
      expect(result.changes.length).toBeGreaterThan(0);
    });

    it('generates tuned prompt for false positive scenario', () => {
      const tuner = new PromptTuner();
      const originalPrompt = 'Scan for security vulnerabilities.';
      const failurePatterns = ['false positive', 'wrong detection', 'incorrect'];

      const result = tuner.tunePrompt('security-scan', originalPrompt, failurePatterns);

      expect(result.skill).toBe('security-scan');
      expect(result.tunedPrompt).toContain(originalPrompt);
      expect(result.tunedPrompt).toContain('Exclusion Rules');
      expect(result.tunedPrompt).toContain('Confidence Threshold');
      expect(result.improvement.predictedAfterF1).toBeGreaterThan(result.improvement.beforeF1);
      expect(result.changes.some((c) => c.includes('exclusion'))).toBe(true);
    });

    it('generates tuned prompt for fix failure scenario', () => {
      const tuner = new PromptTuner();
      const originalPrompt = 'Apply fixes to the identified issues.';
      const failurePatterns = ['fix failed', 'fix incomplete', 'structural change'];

      const result = tuner.tunePrompt('fix-engine', originalPrompt, failurePatterns);

      expect(result.skill).toBe('fix-engine');
      expect(result.tunedPrompt).toContain(originalPrompt);
      expect(result.tunedPrompt).toContain('Fix Instructions');
      expect(result.tunedPrompt).toContain('Fix Validation');
      expect(result.improvement.predictedAfterF1).toBeGreaterThan(result.improvement.beforeF1);
      expect(result.changes.some((c) => c.includes('fix'))).toBe(true);
    });

    it('includes skill-specific guidance for accessibility skills', () => {
      const tuner = new PromptTuner();
      const originalPrompt = 'Check code.';
      const failurePatterns = ['missed', 'not detected'];

      // Skill with 'a11' in name
      const result1 = tuner.tunePrompt('a11y-validator', originalPrompt, failurePatterns);
      expect(result1.tunedPrompt).toContain('Accessibility Checks');
      expect(result1.tunedPrompt).toContain('ARIA attributes');
      expect(result1.tunedPrompt).toContain('color contrast');
      expect(result1.tunedPrompt).toContain('keyboard navigation');
      expect(result1.tunedPrompt).toContain('form labels');

      // Skill with 'accessibility' in name
      const result2 = tuner.tunePrompt('accessibility-linter', originalPrompt, failurePatterns);
      expect(result2.tunedPrompt).toContain('Accessibility Checks');
      expect(result2.tunedPrompt).toContain('ARIA attributes');
    });

    it('includes skill-specific guidance for security skills', () => {
      const tuner = new PromptTuner();
      const originalPrompt = 'Scan code.';
      const failurePatterns = ['missed', 'not detected'];

      const result = tuner.tunePrompt('security-audit', originalPrompt, failurePatterns);

      expect(result.tunedPrompt).toContain('Security Checks');
      expect(result.tunedPrompt).toContain('XSS vectors');
      expect(result.tunedPrompt).toContain('input validation');
      expect(result.tunedPrompt).toContain('authentication');
    });

    it('includes skill-specific guidance for performance skills', () => {
      const tuner = new PromptTuner();
      const originalPrompt = 'Analyze code.';
      const failurePatterns = ['missed', 'not detected'];

      const result = tuner.tunePrompt('performance-check', originalPrompt, failurePatterns);

      expect(result.tunedPrompt).toContain('Performance Checks');
      expect(result.tunedPrompt).toContain('re-renders');
      expect(result.tunedPrompt).toContain('bundle size');
      expect(result.tunedPrompt).toContain('lazy loading');
    });

    it('returns correct improvement estimates', () => {
      const tuner = new PromptTuner();
      const originalPrompt = 'Check issues.';
      const failurePatterns = ['missed', 'not detected', 'false negative'];

      const result = tuner.tunePrompt('test-skill', originalPrompt, failurePatterns);

      expect(result.improvement).toHaveProperty('beforeF1');
      expect(result.improvement).toHaveProperty('predictedAfterF1');
      expect(typeof result.improvement.beforeF1).toBe('number');
      expect(typeof result.improvement.predictedAfterF1).toBe('number');
      expect(result.improvement.predictedAfterF1).toBeGreaterThan(result.improvement.beforeF1);
      expect(result.improvement.predictedAfterF1).toBeLessThanOrEqual(0.95);
    });

    it('handles multiple failure patterns (mixed scenario)', () => {
      const tuner = new PromptTuner();
      const originalPrompt = 'Check and fix issues.';
      const failurePatterns = ['missed', 'false positive', 'fix failed'];

      const result = tuner.tunePrompt('general-skill', originalPrompt, failurePatterns);

      expect(result.tunedPrompt).toContain('Enhanced Detection Rules');
      expect(result.tunedPrompt).toContain('Exclusion Rules');
      expect(result.tunedPrompt).toContain('Fix Instructions');
      expect(result.changes.length).toBeGreaterThanOrEqual(3);
    });

    it('applies general improvements when no specific patterns match', () => {
      const tuner = new PromptTuner();
      const originalPrompt = 'Check code.';
      const failurePatterns = ['unknown pattern', 'random failure'];

      const result = tuner.tunePrompt('unknown-skill', originalPrompt, failurePatterns);

      expect(result.tunedPrompt).toContain('General Improvements');
      expect(result.tunedPrompt).toContain('edge cases');
      expect(result.changes.some((c) => c.includes('general'))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // tuneAllSkills Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('tuneAllSkills', () => {
    it('tunes only skills that need tuning', () => {
      // loadEvalHistory uses path.join(historyDir, '.qa-history', 'eval-history.json')
      const historyDir = path.join(tmpDir, 'base');
      const historyFile = path.join(historyDir, '.qa-history', 'eval-history.json');

      // Write eval history where bad-skill has low F1 and good-skill has high F1
      const history: EvalHistoryEntry[] = [
        makeHistoryEntry({
          timestamp: '2025-01-01T00:00:00.000Z',
          failedCases: 5,
          avgF1: 0.5,
          bySkill: {
            'bad-skill': makeSkillData({ cases: 10, passed: 3, f1: 0.3 }),
            'good-skill': makeSkillData({ cases: 10, passed: 9, f1: 0.9 }),
          },
        }),
      ];

      fs.mkdirSync(path.dirname(historyFile), { recursive: true });
      fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

      const tuner = new PromptTuner({ historyDir });
      const originalPrompts = {
        'bad-skill': 'Check issues.',
        'good-skill': 'Check things.',
      };

      const results = tuner.tuneAllSkills(originalPrompts);

      expect(results.length).toBe(1);
      expect(results[0].skill).toBe('bad-skill');
      expect(results[0].improvement.predictedAfterF1).toBeGreaterThan(results[0].improvement.beforeF1);
    });

    it('returns empty array when no skills need tuning', () => {
      const historyDir = path.join(tmpDir, 'base');
      const historyFile = path.join(historyDir, '.qa-history', 'eval-history.json');

      const history: EvalHistoryEntry[] = [
        makeHistoryEntry({
          timestamp: '2025-01-01T00:00:00.000Z',
          failedCases: 0,
          avgF1: 0.95,
          bySkill: {
            'excellent-skill': makeSkillData({ cases: 10, passed: 10, f1: 0.95 }),
          },
        }),
      ];

      fs.mkdirSync(path.dirname(historyFile), { recursive: true });
      fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

      const tuner = new PromptTuner({ historyDir });
      const originalPrompts = {
        'excellent-skill': 'Perfect check.',
      };

      const results = tuner.tuneAllSkills(originalPrompts);

      expect(results).toEqual([]);
    });

    it('returns empty array when history is empty', () => {
      const historyDir = path.join(tmpDir, 'base');
      const historyFile = path.join(historyDir, '.qa-history', 'eval-history.json');

      fs.mkdirSync(path.dirname(historyFile), { recursive: true });
      fs.writeFileSync(historyFile, JSON.stringify([], null, 2));

      const tuner = new PromptTuner({ historyDir });
      const originalPrompts = {
        'skill-a': 'Check A.',
        'skill-b': 'Check B.',
      };

      const results = tuner.tuneAllSkills(originalPrompts);

      expect(results).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // saveTunedConfig Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('saveTunedConfig', () => {
    it('writes config file', () => {
      const tuner = new PromptTuner();
      const results: PromptTuningResult[] = [
        {
          skill: 'test-skill',
          originalPrompt: 'Original prompt.',
          tunedPrompt: 'Tuned prompt.',
          improvement: { beforeF1: 0.5, predictedAfterF1: 0.7 },
          changes: ['Added detection rules'],
        },
      ];

      const outputPath = path.join(tmpDir, 'test-config.json');
      const savedPath = tuner.saveTunedConfig(results, outputPath);

      expect(savedPath).toBe(outputPath);
      expect(fs.existsSync(outputPath)).toBe(true);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const config = JSON.parse(content);
      expect(config.version).toBe('1.0');
      expect(config.generatedBy).toBe('PromptTuner');
      expect(config.totalSkillsTuned).toBe(1);
      expect(config.prompts.length).toBe(1);
      expect(config.prompts[0].skill).toBe('test-skill');
      expect(config.prompts[0].tunedPrompt).toBe('Tuned prompt.');
      expect(config.prompts[0].improvement.beforeF1).toBe(0.5);
      expect(config.prompts[0].changes).toEqual(['Added detection rules']);
    });

    it('writes multiple skills to config', () => {
      const tuner = new PromptTuner();
      const results: PromptTuningResult[] = [
        {
          skill: 'skill-a',
          originalPrompt: 'A',
          tunedPrompt: 'Tuned A',
          improvement: { beforeF1: 0.4, predictedAfterF1: 0.6 },
          changes: ['Change A'],
        },
        {
          skill: 'skill-b',
          originalPrompt: 'B',
          tunedPrompt: 'Tuned B',
          improvement: { beforeF1: 0.3, predictedAfterF1: 0.5 },
          changes: ['Change B'],
        },
      ];

      const outputPath = path.join(tmpDir, 'multi-config.json');
      const savedPath = tuner.saveTunedConfig(results, outputPath);

      expect(fs.existsSync(savedPath)).toBe(true);
      const content = fs.readFileSync(savedPath, 'utf-8');
      const config = JSON.parse(content);
      expect(config.totalSkillsTuned).toBe(2);
      expect(config.prompts.length).toBe(2);
    });

    it('creates directory if it does not exist', () => {
      const tuner = new PromptTuner();
      const results: PromptTuningResult[] = [
        {
          skill: 'test-skill',
          originalPrompt: 'Original',
          tunedPrompt: 'Tuned',
          improvement: { beforeF1: 0.5, predictedAfterF1: 0.7 },
          changes: ['Improvement'],
        },
      ];

      const outputPath = path.join(tmpDir, 'subdir', 'nested', 'config.json');
      const savedPath = tuner.saveTunedConfig(results, outputPath);

      expect(fs.existsSync(savedPath)).toBe(true);
    });

    it('generates IDs for each prompt entry', () => {
      const tuner = new PromptTuner();
      const results: PromptTuningResult[] = [
        {
          skill: 'test-skill',
          originalPrompt: 'Original',
          tunedPrompt: 'Tuned',
          improvement: { beforeF1: 0.5, predictedAfterF1: 0.7 },
          changes: ['Improvement'],
        },
      ];

      const outputPath = path.join(tmpDir, 'id-config.json');
      tuner.saveTunedConfig(results, outputPath);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const config = JSON.parse(content);
      expect(config.prompts[0].id).toBeDefined();
      expect(typeof config.prompts[0].id).toBe('string');
      expect(config.prompts[0].id.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // loadTunedConfig Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('loadTunedConfig', () => {
    it('reads config file and returns skill-to-prompt map', () => {
      const tuner = new PromptTuner();

      const configData = {
        version: '1.0',
        prompts: [
          { id: 'abc123', skill: 'skill-a', tunedPrompt: 'Tuned prompt A', improvement: {}, changes: [] },
          { id: 'def456', skill: 'skill-b', tunedPrompt: 'Tuned prompt B', improvement: {}, changes: [] },
        ],
      };

      const configPath = path.join(tmpDir, 'load-config.json');
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));

      const result = tuner.loadTunedConfig(configPath);

      expect(result['skill-a']).toBe('Tuned prompt A');
      expect(result['skill-b']).toBe('Tuned prompt B');
      expect(Object.keys(result).length).toBe(2);
    });

    it('returns empty object when file does not exist', () => {
      const tuner = new PromptTuner();
      const nonExistentPath = path.join(tmpDir, 'does-not-exist.json');

      const result = tuner.loadTunedConfig(nonExistentPath);

      expect(result).toEqual({});
    });

    it('handles corrupted JSON gracefully', () => {
      const tuner = new PromptTuner();
      const corruptPath = path.join(tmpDir, 'corrupted.json');
      fs.writeFileSync(corruptPath, '{ invalid json content [[[}');

      const result = tuner.loadTunedConfig(corruptPath);

      expect(result).toEqual({});
    });

    it('handles config without prompts array', () => {
      const tuner = new PromptTuner();
      const configData = { version: '1.0', generatedAt: '2025-01-01' };

      const configPath = path.join(tmpDir, 'no-prompts.json');
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));

      const result = tuner.loadTunedConfig(configPath);

      expect(result).toEqual({});
    });

    it('handles empty prompts array', () => {
      const tuner = new PromptTuner();
      const configData = { version: '1.0', prompts: [] };

      const configPath = path.join(tmpDir, 'empty-prompts.json');
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));

      const result = tuner.loadTunedConfig(configPath);

      expect(result).toEqual({});
    });
  });
});
