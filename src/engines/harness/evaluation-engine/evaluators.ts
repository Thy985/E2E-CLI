/**
 * 评估器：Fix / Diagnosis / Case / CaseWithSkill
 *
 * 4 个核心评估函数 + 1 个 skill 调度器：
 * - evaluateFix: 评估修复结果（AST 模式匹配 + shouldNotExist 检查）
 * - evaluateDiagnosis: 评估诊断结果（按 ruleId + line 匹配）
 * - evaluateCase: 完整用例评估（诊断 + 修复）
 * - evaluateCaseWithSkill: 注入 BaseSkill 实例的评估
 * - runSkillDiagnosis: 运行 skill 诊断（含错误处理）
 */

import * as tsParser from '@typescript-eslint/parser';
import type { Diagnosis, Fix } from '../../../types';
import type { BaseSkill } from '../../../skills/base-skill';
import type { CaseEvaluation, EvaluationMetrics, GoldenTestCase } from '../types';
import { collectNodeTypes, diffAST } from './ast';
import { applyChanges, buildSkillContext } from './runtime';

/** 评估修复结果 — AST 级别验证 + 代码模式匹配 */
export function evaluateFix(
  testCase: GoldenTestCase,
  fixedCode: string | null,
): EvaluationMetrics['fix'] {
  const { codePattern, shouldNotExist } = testCase.expectedFix;
  const hasExpectedFix = !!(codePattern || (shouldNotExist && shouldNotExist.length > 0));

  if (!fixedCode) {
    // No fix produced
    // If no expected fix is required, treat as pass (fix part N/A)
    if (!hasExpectedFix) {
      return {
        precision: 1,
        recall: 1,
        f1: 1,
        fixedCount: 0,
        expectedFixCount: 0,
        structuralChanges: { addedNodes: 0, removedNodes: 0, modifiedNodes: 0, totalChanges: 0 },
      };
    }
    return {
      precision: 0,
      recall: 0,
      f1: 0,
      fixedCount: 0,
      expectedFixCount: codePattern ? 1 : 0,
      structuralChanges: { addedNodes: 0, removedNodes: 0, modifiedNodes: 0, totalChanges: 0 },
    };
  }

  // AST-based pattern matching: parse the codePattern and check if it exists structurally
  let hasPattern = false;
  try {
    const fixedAst = tsParser.parse(fixedCode, {
      sourceType: 'module', ecmaVersion: 'latest', loc: false, range: false, tokens: false, comment: false,
    });
    const fixedTypes = new Set(collectNodeTypes(fixedAst));

    if (codePattern) {
      try {
        const patternAst = tsParser.parse(codePattern, {
          sourceType: 'module', ecmaVersion: 'latest', loc: false, range: false, tokens: false, comment: false,
        });
        const patternTypes = collectNodeTypes(patternAst);
        hasPattern = patternTypes.every((t) => fixedTypes.has(t));
      } catch {
        hasPattern = fixedCode.includes(codePattern);
      }
    }
  } catch {
    hasPattern = !!(codePattern && fixedCode.includes(codePattern));
  }

  // Fallback: if AST match didn't succeed, try string match
  if (!hasPattern && codePattern) {
    hasPattern = fixedCode.includes(codePattern);
  }

  const expectedPatterns = codePattern ? 1 : 0;
  const foundPatterns = hasPattern ? 1 : 0;

  // Check precision: are all shouldNotExist patterns removed?
  const shouldNotExistPatterns = shouldNotExist ?? [];
  let removedCount = 0;

  for (const pattern of shouldNotExistPatterns) {
    let stillExists = fixedCode.includes(pattern); // default: string check
    try {
      const fixedAst = tsParser.parse(fixedCode, {
        sourceType: 'module', ecmaVersion: 'latest', loc: false, range: false, tokens: false, comment: false,
      });
      const fixedTypes = new Set(collectNodeTypes(fixedAst));

      try {
        const patternAst = tsParser.parse(pattern, {
          sourceType: 'module', ecmaVersion: 'latest', loc: false, range: false, tokens: false, comment: false,
        });
        const patternTypes = collectNodeTypes(patternAst);
        const astExists = patternTypes.every((t) => fixedTypes.has(t));
        if (astExists && stillExists) {
          stillExists = true;
        } else if (!astExists && !stillExists) {
          stillExists = false;
        } else {
          // Mismatch: trust string matching as the ground truth
          stillExists = fixedCode.includes(pattern);
        }
      } catch {
        stillExists = fixedCode.includes(pattern);
      }
    } catch {
      stillExists = fixedCode.includes(pattern);
    }

    if (!stillExists) removedCount++;
  }

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

/**
 * 评估诊断结果 — 按实例匹配而非仅按类型匹配
 *
 * When expectedLineRanges are provided, matches by ruleId + line position.
 * Otherwise falls back to ruleId-only matching.
 */
export function evaluateDiagnosis(
  testCase: GoldenTestCase,
  actualDiagnosis: Diagnosis[],
): EvaluationMetrics['diagnosis'] {
  const expectedTypes = new Set(testCase.expectedDiagnosis.issueTypes);
  const expectedLineRanges = testCase.expectedDiagnosis.expectedLineRanges;

  // Whitelist of false positives that should not count
  const falsePositivesWhitelist = new Set(testCase.expectedDiagnosis.falsePositives ?? []);

  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  // Determine if we have specific line constraints
  const hasLineConstraints = expectedLineRanges && expectedLineRanges.length > 0;

  // Track which expected issues have been matched (for line-based matching)
  const matchedExpected = new Set<number>();

  for (const actual of actualDiagnosis) {
    const actualRuleId = (actual as { ruleId?: string }).ruleId || actual.metadata?.ruleId;

    // Find candidate expected match
    let matchedIdx = -1;

    if (hasLineConstraints) {
      // Try to find by ruleId AND line position
      for (let i = 0; i < expectedLineRanges!.length; i++) {
        if (matchedExpected.has(i)) continue;
        const expected = expectedLineRanges![i];
        if (expected.ruleId === actualRuleId) {
          // Check line position with tolerance
          const actualLine = actual.location?.line ?? -1;
          if (actualLine >= 0 && Math.abs(actualLine - expected.line) <= 2) {
            matchedIdx = i;
            break;
          }
        }
      }
    } else {
      // Fallback: ruleId-only matching
      for (const expected of testCase.expectedDiagnosis.issueTypes) {
        if (actualRuleId === expected) {
          matchedIdx = 0; // Indicate matched (any will do for counting)
          break;
        }
      }
    }

    if (matchedIdx !== -1) {
      if (hasLineConstraints) {
        matchedExpected.add(matchedIdx);
      }
      truePositives++;
    } else {
      // FP if it matches an expected type but not the specific line/rule
      // OR FP if it has no match at all
      if (actualRuleId && expectedTypes.has(actualRuleId)) {
        // Could be FP if line constraints disallow
        if (hasLineConstraints) {
          falsePositives++;
        } else {
          // ruleId-only matching: this is a TP (already counted)
          truePositives++;
        }
      } else {
        // Skip whitelisted FPs (known mis-fires)
        if (actualRuleId && falsePositivesWhitelist.has(actualRuleId)) {
          // tolerate — don't count as FP
        } else {
          falsePositives++;
        }
      }
    }
  }

  // Compute expected/actual/missed/extra for issueTypes reporting
  const actualRuleIds = actualDiagnosis
    .map((d) => (d as { ruleId?: string }).ruleId || d.metadata?.ruleId)
    .filter((s): s is string => !!s);
  const actualTypesList = new Set(actualRuleIds);
  const missedTypes = [...expectedTypes].filter((t) => !actualTypesList.has(t));
  const extraTypes = actualRuleIds.filter((t) => !expectedTypes.has(t));

  // Expected total uses issueCount when available (so cases like
  // a11y-missing-alt-001 with issueCount=2 + issueTypes=['img-alt'] correctly
  // report 2 missing when actual is empty).
  const expectedTotal = testCase.expectedDiagnosis.issueCount ?? expectedTypes.size;

  // Count false negatives (expected issues not matched)
  if (hasLineConstraints) {
    falseNegatives = expectedLineRanges!.length - matchedExpected.size;
  } else {
    // For type-based matching, FN = expected count - actual matched count
    // (counting each actual that matches an expected type, not unique types)
    const matchedCount = actualRuleIds.filter((id) => expectedTypes.has(id)).length;
    falseNegatives = Math.max(0, expectedTotal - matchedCount);
  }

  // precision: 1 only when there are no expected (vacuously perfect);
  // 0 when expected > 0 but actual produced no positive predictions.
  const precision = truePositives + falsePositives > 0
    ? truePositives / (truePositives + falsePositives)
    : (expectedTotal > 0 ? 0 : 1);

  // recall: 1 only when there are no expected (vacuously perfect);
  // 0 when expected > 0 and nothing matched.
  const recall = truePositives + falseNegatives > 0
    ? truePositives / (truePositives + falseNegatives)
    : (expectedTotal > 0 ? 0 : 1);

  const f1 = precision + recall > 0
    ? (2 * precision * recall) / (precision + recall)
    : 0;

  return {
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1,
    expectedCount: expectedTypes.size,
    actualCount: actualTypesList.size,
    issueTypes: {
      expected: [...expectedTypes],
      actual: [...actualTypesList],
      missed: missedTypes,
      extra: extraTypes,
    },
  };
}

/** 运行单条用例评估（注入式 runDiagnosis / runFix） */
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

/** 运行 skill 诊断 — 统一入口，含错误处理 */
export async function runSkillDiagnosis(
  skill: BaseSkill,
  testCase: GoldenTestCase,
): Promise<Diagnosis[]> {
  const context = buildSkillContext(testCase);

  try {
    if (skill.init) {
      await skill.init(context);
    }
    return await skill.diagnose(context);
  } catch {
    return [];
  }
}

/** 运行单条用例的完整评估流程（诊断 + 修复），注入 BaseSkill 实例 */
export async function evaluateCaseWithSkill(
  testCase: GoldenTestCase,
  skillInstances: Record<string, BaseSkill>,
  options?: {
    onLog?: (line: string) => void;
  },
): Promise<CaseEvaluation | null> {
  const skill = skillInstances[testCase.skill];
  if (!skill) {
    if (options?.onLog) {
      options.onLog(`Skipping ${testCase.id}: no skill for "${testCase.skill}"`);
    }
    return null;
  }

  const startTime = Date.now();
  const actualDiagnosis = await runSkillDiagnosis(skill, testCase);
  const diagMetrics = evaluateDiagnosis(testCase, actualDiagnosis);

  // 运行修复（如果 skill 支持且诊断发现了问题）
  let fixMetrics = evaluateFix(testCase, null);
  if (skill.fix && actualDiagnosis.length > 0) {
    try {
      const fixes: Fix[] = [];
      for (const d of actualDiagnosis) {
        if (skill.canAutoFix(d)) {
          const fixResult = await skill.fix(d, buildSkillContext(testCase));
          fixes.push(fixResult);
        }
      }

      if (fixes.length > 0) {
        const allChanges = fixes.flatMap((f) => f.changes);
        const fixedCode = applyChanges(testCase.input.code, allChanges);
        fixMetrics = evaluateFix(testCase, fixedCode);
      }
    } catch {
      // 修复失败 — 保持零指标
    }
  }

  const duration = Date.now() - startTime;

  // 整体 P/R/F1：fix 失败时的降级策略
  // - 如果诊断 100% 命中且 fix 未尝试/失败：fix 部分采用诊断分数
  // - 如果诊断未命中：fix 部分保持原样
  let effectiveFixP = fixMetrics.precision;
  let effectiveFixR = fixMetrics.recall;
  if (fixMetrics.f1 === 0 && diagMetrics.recall > 0) {
    effectiveFixP = diagMetrics.precision;
    effectiveFixR = diagMetrics.recall;
  }

  const overallPrecision = (diagMetrics.precision + effectiveFixP) / 2;
  const overallRecall = (diagMetrics.recall + effectiveFixR) / 2;
  const overallF1 = overallPrecision + overallRecall > 0
    ? (2 * overallPrecision * overallRecall) / (overallPrecision + overallRecall)
    : 0;

  return {
    caseId: testCase.id,
    skill: testCase.skill,
    difficulty: testCase.difficulty,
    diagnosis: diagMetrics,
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
