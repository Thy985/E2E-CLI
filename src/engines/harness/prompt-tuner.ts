/**
 * Prompt Tuning Engine
 *
 * Automatically optimizes skill prompts based on evaluation results.
 * Uses template-based approach (not LLM-based) to avoid circular dependencies.
 */

import * as fs from 'fs';
import * as path from 'path';
import { EvalHistoryEntry, loadEvalHistory } from './eval-history';
import { generateId } from '../../utils';

export interface PromptTuningResult {
  skill: string;
  originalPrompt: string;
  tunedPrompt: string;
  improvement: {
    beforeF1: number;
    predictedAfterF1: number;
  };
  changes: string[];
}

const F1_TUNING_THRESHOLD = 0.75;
const DEFAULT_PROMPT_CONFIG_FILE = 'prompt-tuning-config.json';

// Failure pattern detection keywords
const FALSE_NEGATIVE_PATTERNS = [
  'missed',
  'not detected',
  'false negative',
  'recall',
  'undetected',
  'should detect',
  'not found',
  'missing',
];

const FALSE_POSITIVE_PATTERNS = [
  'false positive',
  'wrong detection',
  'incorrect',
  'precision',
  'not an issue',
  'should not flag',
  'over-reporting',
];

const FIX_FAILURE_PATTERNS = [
  'fix failed',
  'fix incomplete',
  'fix incorrect',
  'structural change',
  'fix precision',
  'fix recall',
  'did not apply',
  'incomplete fix',
];

/**
 * Analyze failure patterns from case tags and issue types to determine
 * the dominant failure mode for a skill.
 */
function analyzeFailurePatterns(
  failurePatterns: string[],
): {
  hasFalseNegatives: boolean;
  hasFalsePositives: boolean;
  hasFixFailures: boolean;
  dominantMode: 'false_negative' | 'false_positive' | 'fix_failure' | 'mixed';
} {
  const combined = failurePatterns.join(' ').toLowerCase();

  const hasFalseNegatives = FALSE_NEGATIVE_PATTERNS.some((p) =>
    combined.includes(p),
  );
  const hasFalsePositives = FALSE_POSITIVE_PATTERNS.some((p) =>
    combined.includes(p),
  );
  const hasFixFailures = FIX_FAILURE_PATTERNS.some((p) =>
    combined.includes(p),
  );

  let dominantMode:
    | 'false_negative'
    | 'false_positive'
    | 'fix_failure'
    | 'mixed' = 'mixed';

  const activeModes = [hasFalseNegatives, hasFalsePositives, hasFixFailures].filter(Boolean).length;
  if (activeModes === 1) {
    if (hasFalseNegatives) dominantMode = 'false_negative';
    else if (hasFalsePositives) dominantMode = 'false_positive';
    else if (hasFixFailures) dominantMode = 'fix_failure';
  } else if (activeModes > 1) {
    dominantMode = 'mixed';
  } else {
    // No specific pattern detected, default to false_negative (most common)
    dominantMode = 'false_negative';
  }

  return { hasFalseNegatives, hasFalsePositives, hasFixFailures, dominantMode };
}

/**
 * Generate prompt additions for false negative scenarios.
 * Adds more specific patterns and checks to improve recall.
 */
function generateFalseNegativeImprovements(
  skill: string,
  _failurePatterns: string[],
): { additions: string[]; description: string } {
  const additions: string[] = [];
  const descriptions: string[] = [];

  // Add specificity to detection rules
  additions.push(
    `\n## Enhanced Detection Rules\n` +
      `- Be more thorough in scanning for all possible instances of the issue\n` +
      `- Check nested components and indirect references\n` +
      `- Consider edge cases and uncommon patterns`,
  );
  descriptions.push('Added enhanced detection rules to improve recall');

  // Skill-specific guidance
  if (skill.includes('a11') || skill.toLowerCase().includes('accessibility')) {
    additions.push(
      `\n## Accessibility Checks\n` +
        `- Verify all interactive elements have proper ARIA attributes\n` +
        `- Check for color contrast ratios (WCAG AA minimum)\n` +
        `- Ensure keyboard navigation is fully functional\n` +
        `- Validate form labels and error messages`,
    );
    descriptions.push('Added specific accessibility checks');
  }

  if (skill.toLowerCase().includes('security')) {
    additions.push(
      `\n## Security Checks\n` +
        `- Scan for XSS vectors in all user input handling\n` +
        `- Verify proper input validation and sanitization\n` +
        `- Check for insecure direct object references\n` +
        `- Validate authentication and authorization patterns`,
    );
    descriptions.push('Added specific security checks');
  }

  if (skill.toLowerCase().includes('performance')) {
    additions.push(
      `\n## Performance Checks\n` +
        `- Identify unnecessary re-renders and memoization opportunities\n` +
        `- Check for bundle size optimization opportunities\n` +
        `- Look for synchronous operations in render paths\n` +
        `- Validate lazy loading and code splitting`,
    );
    descriptions.push('Added specific performance checks');
  }

  return { additions, description: descriptions.join('; ') };
}

/**
 * Generate prompt additions for false positive scenarios.
 * Adds exclusion rules and precision improvements.
 */
function generateFalsePositiveImprovements(
  _skill: string,
  _failurePatterns: string[],
): { additions: string[]; description: string } {
  const additions: string[] = [];

  additions.push(
    `\n## Exclusion Rules\n` +
      `- Only flag issues that are definitively problematic\n` +
      `- Do not report warnings for intentional patterns (e.g., legacy code markers)\n` +
      `- Exclude test files and mock implementations from analysis\n` +
      `- Require at least 2 matching indicators before reporting an issue`,
  );

  additions.push(
    `\n## Confidence Threshold\n` +
      `- Assign confidence levels: HIGH (definite issue), MEDIUM (likely issue), LOW (possible issue)\n` +
      `- Only report HIGH and MEDIUM confidence issues\n` +
      `- Include reasoning for each reported issue`,
  );

  return {
    additions,
    description: 'Added exclusion rules and confidence threshold to reduce false positives',
  };
}

/**
 * Generate prompt additions for fix failure scenarios.
 * Adds more context to fix instructions.
 */
function generateFixFailureImprovements(
  _skill: string,
  _failurePatterns: string[],
): { additions: string[]; description: string } {
  const additions: string[] = [];

  additions.push(
    `\n## Fix Instructions\n` +
      `- Always provide the complete fixed code block, not just the changed lines\n` +
      `- Preserve the original code structure and formatting where possible\n` +
      `- Include comments explaining the fix for each modified section\n` +
      `- Verify that the fix does not introduce new issues`,
  );

  additions.push(
    `\n## Fix Validation\n` +
      `- After applying the fix, mentally verify: does it resolve the root cause?\n` +
      `- Check that imports and dependencies are correctly updated\n` +
      `- Ensure the fix is compatible with the existing codebase patterns\n` +
      `- Confirm no side effects on other parts of the component`,
  );

  return {
    additions,
    description: 'Added detailed fix instructions and validation steps',
  };
}

/**
 * Estimate predicted F1 improvement based on failure mode and current F1.
 * Uses heuristic estimation since we don't have an actual LLM to test.
 */
function estimateF1Improvement(
  currentF1: number,
  dominantMode: string,
  changesCount: number,
): number {
  // Base improvement potential (diminishing returns as F1 approaches 1.0)
  const headroom = 1.0 - currentF1;

  // Different modes have different expected improvement rates
  let modeMultiplier = 0.3; // default
  if (dominantMode === 'false_negative') modeMultiplier = 0.35;
  else if (dominantMode === 'false_positive') modeMultiplier = 0.3;
  else if (dominantMode === 'fix_failure') modeMultiplier = 0.25;
  else if (dominantMode === 'mixed') modeMultiplier = 0.2;

  // Each change contributes diminishing returns
  const changeBonus = Math.min(changesCount * 0.02, 0.1);

  const improvement = headroom * modeMultiplier + changeBonus;

  // Cap the predicted F1 at 0.95 (nothing is perfect)
  return Math.min(currentF1 + improvement, 0.95);
}

/**
 * Prompt Tuning Engine class.
 *
 * Analyzes evaluation history to identify skills that need prompt tuning,
 * generates optimized prompts based on failure patterns, and saves
 * tuned prompts to a config file.
 */
export class PromptTuner {
  private historyDir?: string;

  constructor(options?: { historyDir?: string }) {
    this.historyDir = options?.historyDir;
  }

  /**
   * Analyze evaluation results and identify skills that need prompt tuning.
   *
   * @param skill - The skill name to analyze
   * @param history - Evaluation history entries
   * @returns Analysis result indicating if tuning is needed
   */
  analyzeSkillPerformance(
    skill: string,
    history: EvalHistoryEntry[],
  ): {
    needsTuning: boolean;
    currentF1: number;
    weakCases: string[];
    failurePatterns: string[];
  } {
    if (history.length === 0) {
      return {
        needsTuning: false,
        currentF1: 0,
        weakCases: [],
        failurePatterns: [],
      };
    }

    // Calculate average F1 for this skill across recent history
    const recentEntries = history.slice(0, 10);
    const skillEntries = recentEntries.filter((e) => e.bySkill?.[skill]);

    if (skillEntries.length === 0) {
      return {
        needsTuning: false,
        currentF1: 0,
        weakCases: [],
        failurePatterns: [],
      };
    }

    const avgF1 =
      skillEntries.reduce((sum, e) => sum + e.bySkill![skill].f1, 0) /
      skillEntries.length;

    // Identify weak cases from failed cases in recent evaluations
    const weakCases: string[] = [];
    const failurePatterns: string[] = [];

    for (const entry of recentEntries) {
      if (entry.failedCases > 0 && entry.bySkill?.[skill]) {
        const skillData = entry.bySkill[skill];
        const failedRatio = (skillData.cases - skillData.passed) / skillData.cases;

        if (failedRatio > 0.2) {
          weakCases.push(`eval-${entry.timestamp}: ${skillData.cases - skillData.passed}/${skillData.cases} cases failed`);
        }

        // Collect failure pattern indicators
        if (entry.avgRecall < 0.7) {
          failurePatterns.push('missed detections (low recall)');
        }
        if (entry.avgPrecision < 0.7) {
          failurePatterns.push('wrong detections (low precision)');
        }
        if (entry.avgF1 < 0.7) {
          failurePatterns.push('overall quality below threshold');
        }

        // Analyze trends
        if (entry.qualityGatePassed === false) {
          failurePatterns.push('failed quality gate');
        }
      }
    }

    // Deduplicate failure patterns
    const uniquePatterns = Array.from(new Set(failurePatterns));

    const needsTuning = avgF1 < F1_TUNING_THRESHOLD;

    return {
      needsTuning,
      currentF1: avgF1,
      weakCases,
      failurePatterns: uniquePatterns,
    };
  }

  /**
   * Generate tuned prompt based on failure analysis.
   *
   * @param skill - The skill name
   * @param originalPrompt - The current prompt for this skill
   * @param failurePatterns - Identified failure patterns
   * @returns Tuning result with the optimized prompt
   */
  tunePrompt(
    skill: string,
    originalPrompt: string,
    failurePatterns: string[],
    currentF1?: number,
  ): PromptTuningResult {
    const patternAnalysis = analyzeFailurePatterns(failurePatterns);
    const changes: string[] = [];
    const additions: string[] = [];

    // Apply improvements based on failure mode
    if (patternAnalysis.hasFalseNegatives) {
      const fn = generateFalseNegativeImprovements(skill, failurePatterns);
      additions.push(...fn.additions);
      changes.push(fn.description);
    }

    if (patternAnalysis.hasFalsePositives) {
      const fp = generateFalsePositiveImprovements(skill, failurePatterns);
      additions.push(...fp.additions);
      changes.push(fp.description);
    }

    if (patternAnalysis.hasFixFailures) {
      const ff = generateFixFailureImprovements(skill, failurePatterns);
      additions.push(...ff.additions);
      changes.push(ff.description);
    }

    // If no specific patterns detected but F1 is low, apply general improvements
    if (additions.length === 0) {
      additions.push(
        `\n## General Improvements\n` +
          `- Review all detection rules for completeness\n` +
          `- Ensure edge cases are covered\n` +
          `- Add validation steps for fixes`,
      );
      changes.push('Applied general prompt improvements');
    }

    // Build the tuned prompt
    const tunedPrompt = `${originalPrompt}\n\n---\n## Tuned Sections (Auto-generated by PromptTuner)\n\n${additions.join('\n')}`;

    // Use actual currentF1 if provided, otherwise estimate from evaluation history
    const actualCurrentF1 = currentF1 ?? 0;
    const predictedAfterF1 = estimateF1Improvement(
      actualCurrentF1,
      patternAnalysis.dominantMode,
      changes.length,
    );

    return {
      skill,
      originalPrompt,
      tunedPrompt,
      improvement: {
        beforeF1: actualCurrentF1,
        predictedAfterF1,
      },
      changes,
    };
  }

  /**
   * Apply tuning to all skills and return results.
   *
   * @param originalPrompts - Map of skill name to original prompt
   * @returns Array of tuning results for all skills
   */
  tuneAllSkills(
    originalPrompts: Record<string, string>,
  ): PromptTuningResult[] {
    const history = loadEvalHistory(this.historyDir);
    const results: PromptTuningResult[] = [];

    for (const [skill, originalPrompt] of Object.entries(originalPrompts)) {
      const analysis = this.analyzeSkillPerformance(skill, history);

      if (analysis.needsTuning) {
        const tuningResult = this.tunePrompt(
          skill,
          originalPrompt,
          analysis.failurePatterns,
          analysis.currentF1,
        );

        results.push(tuningResult);
      }
    }

    return results;
  }

  /**
   * Resolve the directory used to store tuned-prompt config.
   * Priority: constructor-injected historyDir → <historyDir>/.qa-history
   *           env QA_HISTORY_DIR → 直接作为目录
   *           cwd + .qa-history（兜底）
   */
  private resolveHistoryDir(): string {
    if (this.historyDir) {
      return path.join(this.historyDir, '.qa-history');
    }
    const overrideDir = process.env.QA_HISTORY_DIR;
    if (overrideDir) {
      return path.isAbsolute(overrideDir)
        ? overrideDir
        : path.join(process.cwd(), overrideDir);
    }
    return path.join(process.cwd(), '.qa-history');
  }

  /**
   * Save tuned prompts configuration to a file.
   *
   * @param results - Array of tuning results
   * @param outputPath - Path to save the config file (optional)
   */
  saveTunedConfig(
    results: PromptTuningResult[],
    outputPath?: string,
  ): string {
    const filePath = outputPath || path.join(
      this.resolveHistoryDir(),
      DEFAULT_PROMPT_CONFIG_FILE,
    );

    const config = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      generatedBy: 'PromptTuner',
      totalSkillsTuned: results.length,
      prompts: results.map((r) => ({
        id: generateId(),
        skill: r.skill,
        tunedPrompt: r.tunedPrompt,
        improvement: r.improvement,
        changes: r.changes,
      })),
    };

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    return filePath;
  }

  /**
   * Load tuned prompts from a config file.
   *
   * @param configPath - Path to the config file
   * @returns Map of skill name to tuned prompt
   */
  loadTunedConfig(configPath?: string): Record<string, string> {
    const filePath = configPath || path.join(
      this.resolveHistoryDir(),
      DEFAULT_PROMPT_CONFIG_FILE,
    );

    if (!fs.existsSync(filePath)) {
      return {};
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const config = JSON.parse(content);

      const prompts: Record<string, string> = {};
      if (config.prompts && Array.isArray(config.prompts)) {
        for (const entry of config.prompts) {
          prompts[entry.skill] = entry.tunedPrompt;
        }
      }

      return prompts;
    } catch {
      return {};
    }
  }
}

// Default export
export default PromptTuner;
