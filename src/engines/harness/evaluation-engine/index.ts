/**
 * 评估引擎 — barrel re-export
 *
 * 把 evaluation-engine/* 子文件中的所有 public API 集中再导出，
 * 保持 `import { ... } from '.../harness/evaluation-engine'` 调用方式不变。
 *
 * 子文件职责：
 *   ast.ts         — AST 工具（diffAST, collectNodeTypes, collectNodeSignatures）
 *   runtime.ts     — 评估运行时（applyChanges, createVirtualFS, createSilentLogger, buildSkillContext）
 *   evaluators.ts  — 评估器（evaluateFix, evaluateDiagnosis, evaluateCase, evaluateCaseWithSkill, runSkillDiagnosis）
 *   aggregator.ts  — 批量 + 整体指标 + 回归（evaluateAll, computeOverallEvaluation, detectRegression）
 *   report.ts      — 报告 + 质量门（generateReport, checkQualityGate）
 *   runner.ts      — 批量运行入口（runEval）
 */

// AST 工具
export { collectNodeSignatures, collectNodeTypes, diffAST } from './ast';
export type { AstStructuralChanges } from './ast';

// Runtime
export { applyChanges, buildSkillContext, createSilentLogger, createVirtualFS } from './runtime';

// Evaluators
export { evaluateCase, evaluateCaseWithSkill, evaluateDiagnosis, evaluateFix, runSkillDiagnosis } from './evaluators';

// Aggregator
export { computeOverallEvaluation, detectRegression, evaluateAll } from './aggregator';

// Report
export { checkQualityGate, generateReport } from './report';

// Runner
export { runEval } from './runner';
