/**
 * Model Recommendation Engine
 * Recommends optimal models for different skills based on cost/performance tradeoffs.
 */

import type { ModelProvider } from '../../models';

// Provider → model mapping from the models index
const PROVIDER_MODELS: Record<ModelProvider, string> = {
  deepseek: 'deepseek-chat',
  openai: 'gpt-4o-mini',
  claude: 'claude-sonnet-4-20250514',
  siliconflow: 'deepseek-ai/DeepSeek-V2.5',
  groq: 'llama-3.1-8b-instant',
  minimax: 'MiniMax-Text-01',
};

const MODEL_PROVIDERS: Record<string, ModelProvider> = Object.entries(
  PROVIDER_MODELS,
).reduce((acc, [provider, model]) => {
  acc[model] = provider as ModelProvider;
  return acc;
}, {} as Record<string, ModelProvider>);

// ============================================
// Public Interfaces
// ============================================

export interface ModelRecommendation {
  skill: string;
  recommendedModel: string;
  provider: string;
  reason: string;
  alternatives: Array<{ model: string; provider: string; reason: string }>;
  costEstimate: 'low' | 'medium' | 'high';
  qualityEstimate: 'good' | 'excellent' | 'best';
}

export interface SkillModelProfile {
  skill: string;
  taskType: 'analysis' | 'generation' | 'reasoning' | 'classification';
  contextWindow: 'small' | 'medium' | 'large';
  outputComplexity: 'simple' | 'structured' | 'creative';
  latencyTolerance: 'low' | 'medium' | 'high';
}

// ============================================
// Skill Profiles
// ============================================

const skillProfiles: Record<string, SkillModelProfile> = {
  a11y: {
    skill: 'a11y',
    taskType: 'classification',
    contextWindow: 'small',
    outputComplexity: 'structured',
    latencyTolerance: 'low',
  },
  security: {
    skill: 'security',
    taskType: 'analysis',
    contextWindow: 'medium',
    outputComplexity: 'structured',
    latencyTolerance: 'medium',
  },
  performance: {
    skill: 'performance',
    taskType: 'analysis',
    contextWindow: 'medium',
    outputComplexity: 'structured',
    latencyTolerance: 'low',
  },
  react: {
    skill: 'react',
    taskType: 'analysis',
    contextWindow: 'small',
    outputComplexity: 'structured',
    latencyTolerance: 'low',
  },
  vue: {
    skill: 'vue',
    taskType: 'analysis',
    contextWindow: 'small',
    outputComplexity: 'structured',
    latencyTolerance: 'low',
  },
  nextjs: {
    skill: 'nextjs',
    taskType: 'analysis',
    contextWindow: 'medium',
    outputComplexity: 'structured',
    latencyTolerance: 'low',
  },
  nuxt: {
    skill: 'nuxt',
    taskType: 'analysis',
    contextWindow: 'medium',
    outputComplexity: 'structured',
    latencyTolerance: 'low',
  },
  e2e: {
    skill: 'e2e',
    taskType: 'generation',
    contextWindow: 'large',
    outputComplexity: 'creative',
    latencyTolerance: 'high',
  },
  seo: {
    skill: 'seo',
    taskType: 'analysis',
    contextWindow: 'medium',
    outputComplexity: 'structured',
    latencyTolerance: 'medium',
  },
  api: {
    skill: 'api',
    taskType: 'analysis',
    contextWindow: 'medium',
    outputComplexity: 'structured',
    latencyTolerance: 'low',
  },
  dependency: {
    skill: 'dependency',
    taskType: 'reasoning',
    contextWindow: 'medium',
    outputComplexity: 'structured',
    latencyTolerance: 'low',
  },
  complexity: {
    skill: 'complexity',
    taskType: 'reasoning',
    contextWindow: 'large',
    outputComplexity: 'structured',
    latencyTolerance: 'medium',
  },
};

// ============================================
// Model Capabilities
// ============================================

interface ModelCapability {
  quality: number; // 1-10
  cost: number; // 1-10 (relative)
  speed: 'very-fast' | 'fast' | 'medium' | 'slow';
  reasoning: 'poor' | 'fair' | 'good' | 'excellent' | 'outstanding';
}

const modelCapabilities: Record<string, ModelCapability> = {
  'deepseek-chat': { quality: 7, cost: 1, speed: 'fast', reasoning: 'good' },
  'gpt-4o-mini': { quality: 8, cost: 2, speed: 'fast', reasoning: 'good' },
  'gpt-4o': { quality: 10, cost: 8, speed: 'medium', reasoning: 'excellent' },
  'claude-sonnet-4-20250514': { quality: 9, cost: 5, speed: 'medium', reasoning: 'excellent' },
  'llama-3.1-8b-instant': { quality: 6, cost: 1, speed: 'very-fast', reasoning: 'fair' },
  'deepseek-ai/DeepSeek-V2.5': { quality: 7, cost: 1, speed: 'fast', reasoning: 'good' },
  'MiniMax-Text-01': { quality: 7, cost: 1, speed: 'fast', reasoning: 'good' },
};

// ============================================
// Scoring Helpers
// ============================================

const reasoningScore: Record<string, number> = {
  poor: 1,
  fair: 3,
  good: 5,
  excellent: 8,
  outstanding: 10,
};

const speedScore: Record<string, number> = {
  'very-fast': 10,
  fast: 8,
  medium: 5,
  slow: 2,
};

/**
 * Compute a suitability score for a model given a skill profile and priority.
 */
function scoreModel(
  model: string,
  profile: SkillModelProfile,
  priority: 'cost' | 'quality' | 'balanced',
): number {
  const cap = modelCapabilities[model];
  if (!cap) return 0;

  const reasoningWeight = profile.taskType === 'reasoning' ? 0.4 : profile.taskType === 'analysis' ? 0.3 : 0.15;
  const qualityWeight = priority === 'quality' ? 0.5 : priority === 'balanced' ? 0.3 : 0.1;
  const costWeight = priority === 'cost' ? 0.5 : priority === 'balanced' ? 0.3 : 0.1;
  const speedWeight = profile.latencyTolerance === 'low' ? 0.3 : profile.latencyTolerance === 'medium' ? 0.15 : 0.05;

  const reasoningValue = (reasoningScore[cap.reasoning] ?? 5) / 10;
  const qualityValue = cap.quality / 10;
  const costValue = 1 - cap.cost / 10; // lower cost is better
  const speedValue = (speedScore[cap.speed] ?? 5) / 10;

  return (
    reasoningWeight * reasoningValue +
    qualityWeight * qualityValue +
    costWeight * costValue +
    speedWeight * speedValue
  );
}

/**
 * Map numeric cost (1-10) to a label.
 */
function costLabel(cost: number): 'low' | 'medium' | 'high' {
  if (cost <= 3) return 'low';
  if (cost <= 6) return 'medium';
  return 'high';
}

/**
 * Map numeric quality (1-10) to a label.
 */
function qualityLabel(quality: number): 'good' | 'excellent' | 'best' {
  if (quality <= 7) return 'good';
  if (quality <= 9) return 'excellent';
  return 'best';
}

/**
 * Generate a human-readable reason for recommending a model for a skill.
 */
function buildReason(
  model: string,
  profile: SkillModelProfile,
  priority: 'cost' | 'quality' | 'balanced',
): string {
  const cap = modelCapabilities[model];
  if (!cap) return '';

  const parts: string[] = [];

  if (priority === 'cost') {
    parts.push(`Low-cost option (cost index: ${cap.cost}/10)`);
  } else if (priority === 'quality') {
    parts.push(`High quality (quality index: ${cap.quality}/10)`);
  } else {
    parts.push(`Good balance of quality (${cap.quality}/10) and cost (${cap.cost}/10)`);
  }

  parts.push(`${cap.reasoning} reasoning capability`);

  if (profile.latencyTolerance === 'low') {
    parts.push(`fast response (${cap.speed})`);
  }

  const taskDescriptions: Record<string, string> = {
    analysis: 'analysis tasks',
    classification: 'classification tasks',
    generation: 'generation tasks',
    reasoning: 'reasoning tasks',
  };
  parts.push(`well-suited for ${taskDescriptions[profile.taskType] ?? 'general tasks'}`);

  return parts.join(', ');
}

// ============================================
// Model Recommender Class
// ============================================

export class ModelRecommender {
  /**
   * Get recommendation for a specific skill.
   */
  recommendForSkill(
    skill: string,
    priority: 'cost' | 'quality' | 'balanced' = 'balanced',
  ): ModelRecommendation {
    const profile = skillProfiles[skill];
    if (!profile) {
      return this._fallbackRecommendation(skill, priority);
    }
    return this._recommend(skill, profile, priority);
  }

  /**
   * Get recommendations for all known skills.
   */
  recommendAll(
    priority: 'cost' | 'quality' | 'balanced' = 'balanced',
  ): ModelRecommendation[] {
    return Object.keys(skillProfiles).map((skill) =>
      this.recommendForSkill(skill, priority),
    );
  }

  /**
   * Get cost estimate for running all skills with recommended models.
   * Returns relative cost units (not actual currency).
   */
  estimateCost(
    skillCount: number,
    priority: 'cost' | 'quality' | 'balanced' = 'balanced',
  ): {
    total: number;
    perSkill: Record<string, number>;
  } {
    const perSkill: Record<string, number> = {};
    let total = 0;

    const skills = Object.keys(skillProfiles).slice(0, skillCount);
    for (const skill of skills) {
      const rec = this.recommendForSkill(skill, priority);
      const cap = modelCapabilities[rec.recommendedModel];
      const cost = cap ? cap.cost : 5;
      perSkill[skill] = cost;
      total += cost;
    }

    return { total, perSkill };
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Core recommendation logic: score all models for a profile and return the best.
   */
  private _recommend(
    skill: string,
    profile: SkillModelProfile,
    priority: 'cost' | 'quality' | 'balanced',
  ): ModelRecommendation {
    const allModels = Object.keys(modelCapabilities);
    const scored = allModels
      .map((m) => ({ model: m, score: scoreModel(m, profile, priority) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const cap = modelCapabilities[best.model];

    const alternatives = scored
      .slice(1, 4)
      .map((s) => ({
        model: s.model,
        provider: MODEL_PROVIDERS[s.model] ?? 'unknown',
        reason: buildReason(s.model, profile, priority),
      }));

    return {
      skill,
      recommendedModel: best.model,
      provider: MODEL_PROVIDERS[best.model] ?? 'unknown',
      reason: buildReason(best.model, profile, priority),
      alternatives,
      costEstimate: costLabel(cap.cost),
      qualityEstimate: qualityLabel(cap.quality),
    };
  }

  private _fallbackRecommendation(
    skill: string,
    priority: 'cost' | 'quality' | 'balanced',
  ): ModelRecommendation {
    return this._recommend(skill, {
      skill,
      taskType: 'analysis',
      contextWindow: 'medium',
      outputComplexity: 'structured',
      latencyTolerance: 'medium',
    }, priority);
  }
}

export default ModelRecommender;
