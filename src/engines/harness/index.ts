/**
 * AI Harness 模块入口
 */

export type {
  GoldenTestCase,
  GoldenSet,
  EvaluationMetrics,
  CaseEvaluation,
  OverallEvaluation,
  EvalOptions,
} from './types';

export {
  getAllCases,
  getCasesBySkill,
  getGoldenSet,
  getGoldenSetStats,
} from './golden-set';

export {
  evaluateCase,
  evaluateDiagnosis,
  computeOverallEvaluation,
  evaluateAll,
  detectRegression,
  generateReport,
  checkQualityGate,
} from './evaluation-engine';

export {
  loadEvalHistory,
  saveEvalHistory,
  analyzeTrend,
  getSkillTrend,
  getAllSkills,
} from './eval-history';

export type {
  FeedbackAction,
  FeedbackEntry,
  FeedbackStats,
  FeedbackInsight,
} from './feedback-loop';

export {
  FeedbackLoopEngine,
  loadFeedback,
  saveFeedback,
  getRecentFeedback,
  clearFeedback,
} from './feedback-loop';

export type {
  ModelRecommendation,
  SkillModelProfile,
} from './model-recommender';

export { ModelRecommender } from './model-recommender';

export type {
  ABTestConfig,
  ABTestResult,
  ABTestHistoryEntry,
} from './ab-testing';

export {
  ABTestRunner,
  determineWinner,
  loadABHistory,
  saveABHistory,
  getRecentABTests,
} from './ab-testing';

export type { PromptTuningResult } from './prompt-tuner';

export { PromptTuner } from './prompt-tuner';
