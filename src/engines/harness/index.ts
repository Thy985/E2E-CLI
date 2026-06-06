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
