/**
 * 评估引擎 — Precision / Recall / F1 计算
 *
 * 将 Golden Set 用例输入到 QA-Agent 的诊断和修复流程中，
 * 对比实际结果与期望结果，计算评估指标。
 */

import type {
  GoldenTestCase,
  EvaluationMetrics,
  CaseEvaluation,
  OverallEvaluation,
  EvalOptions,
} from './types';
import { getAllCases } from './golden-set';
import type { Diagnosis, Fix, FileChange } from '../../types';

// ---------------------------------------------------------------------------
// 评估接口
// ---------------------------------------------------------------------------

/** 评估修复结果 — AST 级别验证 + 代码模式匹配 */
export function evaluateFix(
  testCase: GoldenTestCase,
  fixedCode: string | null,
): EvaluationMetrics['fix'] {
  const { codePattern, shouldNotExist } = testCase.expectedFix;

  if (!fixedCode) {
    // No fix produced
    return {
      precision: 0,
      recall: 0,
      f1: 0,
      fixedCount: 0,
      expectedFixCount: codePattern ? 1 : 0,
      structuralChanges: { addedNodes: 0, removedNodes: 0, modifiedNodes: 0, totalChanges: 0 },
    };
  }

  // Check recall: does fixed code contain the expected pattern?
  const hasPattern = fixedCode.includes(codePattern);
  const expectedPatterns = codePattern ? 1 : 0;
  const foundPatterns = hasPattern ? 1 : 0;

  // Check precision: are all shouldNotExist patterns removed?
  const shouldNotExistPatterns = shouldNotExist ?? [];
  const removedCount = shouldNotExistPatterns.filter((p) => !fixedCode.includes(p)).length;
  const totalShouldNotExist = shouldNotExistPatterns.length;

  // Recall: ratio of expected patterns found
  const recall = expectedPatterns > 0 ? foundPatterns / expectedPatterns : 1;

  // Precision: ratio of should-be-removed patterns actually removed
  const precision =
    totalShouldNotExist > 0
      ? removedCount / totalShouldNotExist
      : 1; // No shouldNotExist constraints → perfect precision

  // AST structural validation
  let structuralChanges = { addedNodes: 0, removedNodes: 0, modifiedNodes: 0, totalChanges: 0 };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const parser = require('@typescript-eslint/parser');
    const beforeAst = parser.parse(testCase.input.code, {
      sourceType: 'module', ecmaVersion: 'latest', loc: false, range: false, tokens: false, comment: false,
    });
    const afterAst = parser.parse(fixedCode, {
      sourceType: 'module', ecmaVersion: 'latest', loc: false, range: false, tokens: false, comment: false,
    });
    structuralChanges = diffAST(beforeAst, afterAst);
  } catch {
    // AST parsing failed — structural validation not possible
  }

  // Penalize precision if structural changes are excessive
  let adjustedPrecision = precision;
  if (structuralChanges.totalChanges > 50 && adjustedPrecision > 0) {
    adjustedPrecision *= Math.max(0.3, 1 - (structuralChanges.totalChanges - 50) / 100);
  }
  const adjustedF1 = adjustedPrecision + recall > 0 ? (2 * adjustedPrecision * recall) / (adjustedPrecision + recall) : 0;

  return {
    precision: adjustedPrecision,
    recall,
    f1: adjustedF1,
    fixedCount: foundPatterns + removedCount,
    expectedFixCount: expectedPatterns + totalShouldNotExist,
    structuralChanges,
  };
}

/** Diff two ASTs and count structural changes */
function diffAST(
  before: unknown,
  after: unknown,
): { addedNodes: number; removedNodes: number; modifiedNodes: number; totalChanges: number } {
  const beforeNodes = collectNodeSignatures(before);
  const afterNodes = collectNodeSignatures(after);

  const beforeSet = new Set(beforeNodes);
  const afterSet = new Set(afterNodes);

  let addedNodes = 0;
  for (const sig of afterNodes) {
    if (!beforeSet.has(sig)) addedNodes++;
  }

  let removedNodes = 0;
  for (const sig of beforeNodes) {
    if (!afterSet.has(sig)) removedNodes++;
  }

  const totalUnique = new Set([...beforeNodes, ...afterNodes]).size;
  const unchanged = beforeNodes.filter((s) => afterSet.has(s)).length;
  const modifiedNodes = Math.max(0, totalUnique - beforeNodes.length - afterNodes.length + unchanged);

  return {
    addedNodes,
    removedNodes,
    modifiedNodes: Math.min(modifiedNodes, addedNodes + removedNodes),
    totalChanges: addedNodes + removedNodes + modifiedNodes,
  };
}

/** Collect node signatures from AST for comparison */
function collectNodeSignatures(node: unknown, path = 'root'): string[] {
  const signatures: string[] = [];

  if (node === null || node === undefined || typeof node !== 'object') {
    return signatures;
  }

  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      const childPath = `${path}[${index}]`;
      signatures.push(...collectNodeSignatures(item, childPath));
    });
    return signatures;
  }

  const obj = node as Record<string, unknown>;
  const type = obj.type as string | undefined;

  if (type) {
    signatures.push(`${type}:${path}`);

    const childKeys = [
      'body', 'declarations', 'expression', 'argument',
      'arguments', 'callee', 'consequent', 'alternate', 'init', 'test',
      'update', 'left', 'right', 'properties', 'elements', 'key', 'value',
      'object', 'property', 'params', 'block', 'handler',
      'finalizer', 'declaration', 'specifiers', 'source', 'local',
      'imported', 'exported',
    ];

    for (const key of childKeys) {
      if (obj[key] !== undefined) {
        const childPath = `${path}.${key}`;
        signatures.push(...collectNodeSignatures(obj[key], childPath));
      }
    }
  }

  return signatures;
}

/** 应用 FileChange[] 到原始代码 */
export function applyChanges(
  originalCode: string,
  changes: FileChange[],
): string {
  let result = originalCode;

  for (const change of changes) {
    switch (change.type) {
      case 'replace':
        if (change.oldContent) {
          result = result.split(change.oldContent).join(change.content ?? '');
        }
        break;
      case 'insert':
        if (change.position) {
          const lines = result.split('\n');
          const insertLine = Math.min(change.position.line, lines.length);
          const insertContent = change.content ?? '';
          lines.splice(insertLine - 1, 0, insertContent);
          result = lines.join('\n');
        } else {
          result += change.content ?? '';
        }
        break;
      case 'delete':
        if (change.oldContent) {
          result = result.split(change.oldContent).join('');
        } else if (change.position) {
          const lines = result.split('\n');
          const deleteLine = Math.min(change.position.line - 1, lines.length - 1);
          lines.splice(deleteLine, 1);
          result = lines.join('\n');
        }
        break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// 评估接口
// ---------------------------------------------------------------------------

/** 运行单条用例评估 */
export async function evaluateCase(
  testCase: GoldenTestCase,
  runDiagnosis: (code: string, filePath: string) => Promise<Diagnosis[]>,
  runFix?: (code: string, diagnosis: Diagnosis[]) => Promise<Fix[] | null>,
): Promise<CaseEvaluation> {
  const startTime = Date.now();

  // 运行诊断
  const actualDiagnosis = await runDiagnosis(testCase.input.code, testCase.input.filePath);

  // 计算诊断指标
  const diagnosis = evaluateDiagnosis(testCase, actualDiagnosis);

  // 运行修复（如果支持）
  let fixMetrics: EvaluationMetrics['fix'];
  if (runFix && actualDiagnosis.length > 0) {
    const fixes = await runFix(testCase.input.code, actualDiagnosis);
    let fixedCode: string | null = null;
    if (fixes && fixes.length > 0) {
      const allChanges = fixes.flatMap((f) => f.changes);
      fixedCode = applyChanges(testCase.input.code, allChanges);
    }
    fixMetrics = evaluateFix(testCase, fixedCode);
  } else {
    fixMetrics = evaluateFix(testCase, null);
  }

  const duration = Date.now() - startTime;

  const overallPrecision = (diagnosis.precision + fixMetrics.precision) / 2;
  const overallRecall = (diagnosis.recall + fixMetrics.recall) / 2;
  const overallF1 = overallPrecision + overallRecall > 0
    ? (2 * overallPrecision * overallRecall) / (overallPrecision + overallRecall)
    : 0;

  return {
    caseId: testCase.id,
    skill: testCase.skill,
    difficulty: testCase.difficulty,
    diagnosis,
    fix: fixMetrics,
    overall: {
      precision: overallPrecision,
      recall: overallRecall,
      f1: overallF1,
      passed: overallF1 >= 0.8,
    },
    duration,
  };
}

/** 评估诊断结果 — 按实例匹配而非仅按类型匹配 */
export function evaluateDiagnosis(
  testCase: GoldenTestCase,
  actualDiagnosis: Diagnosis[],
): EvaluationMetrics['diagnosis'] {
  const expectedTypes = new Set(testCase.expectedDiagnosis.issueTypes);
  const falsePositiveTypes = new Set(testCase.expectedDiagnosis.falsePositives ?? []);

  // 实际发现的 ruleId
  const actualTypes = new Set(
    actualDiagnosis
      .map((d) => d.metadata?.ruleId ?? '')
      .filter(Boolean),
  );

  // True Positives: 期望发现的类型且实际发现了
  const tp = [...expectedTypes].filter((t) => actualTypes.has(t)).length;

  // False Positives: 实际发现的但不期望的类型
  const fpFromDefined = [...falsePositiveTypes].filter((t) => actualTypes.has(t)).length;
  const fpExtra = [...actualTypes].filter((t) => !expectedTypes.has(t) && !falsePositiveTypes.has(t)).length;
  const fp = fpFromDefined + fpExtra;

  // False Negatives: 期望发现但实际没发现的
  const fn = [...expectedTypes].filter((t) => !actualTypes.has(t)).length;

  // 按实例数量计算更精确的指标
  // 如果 expectedCount > issueTypes.length，说明期望多个同类型实例
  const expectedInstanceCount = testCase.expectedDiagnosis.issueCount;

  // 如果用例期望多个实例，按实例数量调整 TP/FN
  let adjustedTp = tp;
  let adjustedFn = fn;

  if (expectedInstanceCount > expectedTypes.size && expectedTypes.size > 0) {
    // 期望多个实例但类型数量少 — 按实例比例调整
    // Cap per-type expected count so that finding at least 1 instance of an expected type counts as a full TP
    const instancesPerType = Math.ceil(expectedInstanceCount / expectedTypes.size);
    const detectedInstancesPerType = new Map<string, number>();
    for (const d of actualDiagnosis) {
      const ruleId = d.metadata?.ruleId;
      if (ruleId) {
        detectedInstancesPerType.set(ruleId, (detectedInstancesPerType.get(ruleId) || 0) + 1);
      }
    }

    adjustedTp = 0;
    for (const expectedType of expectedTypes) {
      const found = detectedInstancesPerType.get(expectedType) || 0;
      // If at least one instance found, credit a full type-level TP
      // Additional instances capped at instancesPerType - 1
      adjustedTp += found > 0 ? 1 + Math.min(found - 1, instancesPerType - 1) : 0;
    }
    adjustedFn = Math.max(0, expectedInstanceCount - adjustedTp);
  }

  const precision = adjustedTp + fp > 0 ? adjustedTp / (adjustedTp + fp) : 0;
  const recall = adjustedTp + adjustedFn > 0 ? adjustedTp / (adjustedTp + adjustedFn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    precision,
    recall,
    f1,
    truePositives: adjustedTp,
    falsePositives: fp,
    falseNegatives: adjustedFn,
    expectedCount: testCase.expectedDiagnosis.issueCount,
    actualCount: actualDiagnosis.length,
    issueTypes: {
      expected: [...expectedTypes],
      actual: [...actualTypes],
      missed: [...expectedTypes].filter((t) => !actualTypes.has(t)),
      extra: [...actualTypes].filter((t) => !expectedTypes.has(t) && !falsePositiveTypes.has(t)),
    },
  };
}

/** 计算整体评估指标 */
export function computeOverallEvaluation(
  evaluations: CaseEvaluation[],
): OverallEvaluation {
  if (evaluations.length === 0) {
    return {
      totalCases: 0,
      passedCases: 0,
      failedCases: 0,
      avgPrecision: 0,
      avgRecall: 0,
      avgF1: 0,
      passRate: 0,
      bySkill: {},
      byDifficulty: {},
    };
  }

  const totalCases = evaluations.length;
  const passedCases = evaluations.filter((e) => e.overall.passed).length;
  const failedCases = totalCases - passedCases;

  const avgPrecision = evaluations.reduce((s, e) => s + e.diagnosis.precision, 0) / totalCases;
  const avgRecall = evaluations.reduce((s, e) => s + e.diagnosis.recall, 0) / totalCases;
  const avgF1 = evaluations.reduce((s, e) => s + e.diagnosis.f1, 0) / totalCases;
  const passRate = passedCases / totalCases;

  // 按 skill 分组统计
  const bySkill: Record<string, { cases: number; passed: number; f1: number }> = {};
  for (const e of evaluations) {
    if (!bySkill[e.skill]) {
      bySkill[e.skill] = { cases: 0, passed: 0, f1: 0 };
    }
    bySkill[e.skill].cases++;
    if (e.overall.passed) bySkill[e.skill].passed++;
    bySkill[e.skill].f1 += e.diagnosis.f1;
  }
  for (const key of Object.keys(bySkill)) {
    bySkill[key].f1 /= bySkill[key].cases;
  }

  // 按 difficulty 分组统计
  const byDifficulty: Record<string, { cases: number; passed: number; f1: number }> = {};
  for (const e of evaluations) {
    if (!byDifficulty[e.difficulty]) {
      byDifficulty[e.difficulty] = { cases: 0, passed: 0, f1: 0 };
    }
    byDifficulty[e.difficulty].cases++;
    if (e.overall.passed) byDifficulty[e.difficulty].passed++;
    byDifficulty[e.difficulty].f1 += e.diagnosis.f1;
  }
  for (const key of Object.keys(byDifficulty)) {
    byDifficulty[key].f1 /= byDifficulty[key].cases;
  }

  return {
    totalCases,
    passedCases,
    failedCases,
    avgPrecision,
    avgRecall,
    avgF1,
    passRate,
    bySkill,
    byDifficulty,
  };
}

/** 运行批量评估 */
export async function evaluateAll(
  runDiagnosis: (code: string, filePath: string) => Promise<Diagnosis[]>,
  runFix?: (code: string, diagnosis: Diagnosis[]) => Promise<Fix[] | null>,
  options?: EvalOptions,
): Promise<{
  evaluations: CaseEvaluation[];
  overall: OverallEvaluation;
}> {
  let cases = getAllCases();

  // 过滤 skill
  if (options?.skills && options.skills.length > 0) {
    const skillSet = new Set(options.skills);
    cases = cases.filter((c) => skillSet.has(c.skill));
  }

  // 过滤难度
  if (options?.difficulty) {
    cases = cases.filter((c) => c.difficulty === options.difficulty);
  }

  const evaluations: CaseEvaluation[] = [];

  for (const testCase of cases) {
    const eval_ = await evaluateCase(testCase, runDiagnosis, runFix);
    evaluations.push(eval_);
  }

  const overall = computeOverallEvaluation(evaluations);

  return { evaluations, overall };
}

/** 回归检测 — 对比两次评估结果 */
export function detectRegression(
  previous: OverallEvaluation,
  current: OverallEvaluation,
): {
  isRegression: boolean;
  details: string[];
} {
  const details: string[] = [];
  let isRegression = false;

  // 整体 F1 下降
  if (current.avgF1 < previous.avgF1 - 0.05) {
    isRegression = true;
    details.push(
      `Overall F1 dropped from ${previous.avgF1.toFixed(3)} to ${current.avgF1.toFixed(3)}`,
    );
  }

  // 通过率下降
  if (current.passRate < previous.passRate - 0.1) {
    isRegression = true;
    details.push(
      `Pass rate dropped from ${(previous.passRate * 100).toFixed(1)}% to ${(current.passRate * 100).toFixed(1)}%`,
    );
  }

  // 按 skill 回归检测
  for (const skill of Object.keys(current.bySkill)) {
    const prev = previous.bySkill[skill];
    const curr = current.bySkill[skill];
    if (prev && curr.f1 < prev.f1 - 0.1) {
      isRegression = true;
      details.push(
        `${skill} F1 dropped from ${prev.f1.toFixed(3)} to ${curr.f1.toFixed(3)}`,
      );
    }
  }

  // 新增的失败用例
  if (current.failedCases > previous.failedCases) {
    details.push(
      `Failed cases increased from ${previous.failedCases} to ${current.failedCases}`,
    );
  }

  return { isRegression, details };
}

/** 生成人类可读的报告 */
export function generateReport(overall: OverallEvaluation): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('  QA-Agent Evaluation Report');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Total Cases:  ${overall.totalCases}`);
  lines.push(`Passed:       ${overall.passedCases} (${(overall.passRate * 100).toFixed(1)}%)`);
  lines.push(`Failed:       ${overall.failedCases}`);
  lines.push('');
  lines.push(`Precision:    ${overall.avgPrecision.toFixed(3)}`);
  lines.push(`Recall:       ${overall.avgRecall.toFixed(3)}`);
  lines.push(`F1 Score:     ${overall.avgF1.toFixed(3)}`);
  lines.push('');

  // By Skill
  lines.push('--- By Skill ---');
  for (const [skill, stats] of Object.entries(overall.bySkill)) {
    const passRate = (stats.passed / stats.cases * 100).toFixed(0);
    lines.push(
      `  ${skill.padEnd(15)} ${stats.cases} cases  ${stats.passed}/${stats.cases} passed (${passRate}%)  F1=${stats.f1.toFixed(3)}`,
    );
  }
  lines.push('');

  // By Difficulty
  lines.push('--- By Difficulty ---');
  for (const [diff, stats] of Object.entries(overall.byDifficulty)) {
    const passRate = (stats.passed / stats.cases * 100).toFixed(0);
    lines.push(
      `  ${diff.padEnd(15)} ${stats.cases} cases  ${stats.passed}/${stats.cases} passed (${passRate}%)  F1=${stats.f1.toFixed(3)}`,
    );
  }
  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}

/** 质量门禁检查 */
export function checkQualityGate(
  overall: OverallEvaluation,
  threshold: number = 80,
): { passed: boolean; details: string[] } {
  const details: string[] = [];
  let passed = true;

  // 通过率检查
  const passRatePct = overall.passRate * 100;
  if (passRatePct < threshold) {
    passed = false;
    details.push(
      `❌ Pass rate ${passRatePct.toFixed(1)}% < threshold ${threshold}%`,
    );
  } else {
    details.push(
      `✅ Pass rate ${passRatePct.toFixed(1)}% >= threshold ${threshold}%`,
    );
  }

  // F1 分数检查
  const f1Pct = overall.avgF1 * 100;
  if (f1Pct < threshold) {
    passed = false;
    details.push(`❌ F1 score ${f1Pct.toFixed(1)}% < threshold ${threshold}%`);
  } else {
    details.push(`✅ F1 score ${f1Pct.toFixed(1)}% >= threshold ${threshold}%`);
  }

  // 各 skill F1 检查
  for (const [skill, stats] of Object.entries(overall.bySkill)) {
    if (stats.f1 * 100 < threshold) {
      passed = false;
      details.push(`❌ ${skill} F1 ${(stats.f1 * 100).toFixed(1)}% < ${threshold}%`);
    } else {
      details.push(`✅ ${skill} F1 ${(stats.f1 * 100).toFixed(1)}% >= ${threshold}%`);
    }
  }

  return { passed, details };
}
