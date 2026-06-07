/**
 * Golden Set 基准数据集 — 类型定义
 *
 * Golden Set 是一组已知输入 + 已知期望输出的测试用例，
 * 用于评估 AI 诊断和修复的质量。
 */

export interface GoldenTestCase {
  /** 测试用例唯一标识 */
  id: string;

  /** 所属 skill（a11y, security, performance, ...） */
  skill: string;

  /** 用例描述 */
  description?: string;

  /** 输入：有问题的源代码 */
  input: {
    /** 文件内容 */
    code: string;
    /** 文件路径（用于推断技术栈） */
    filePath: string;
    /** 技术栈标签 */
    stack: ('react' | 'vue' | 'angular' | 'html' | 'css' | 'typescript' | 'javascript')[];
  };

  /** 期望的诊断结果 */
  expectedDiagnosis: {
    /** 应发现的问题数量 */
    issueCount: number;
    /** 应发现的具体问题类型 (ruleId) */
    issueTypes: string[];
    /** 不应出现的误报类型 (ruleId) */
    falsePositives?: string[];
  };

  /** 期望的修复结果 */
  expectedFix: {
    /** 修复后代码中应存在的模式 */
    codePattern: string;
    /** 修复后应不存在的模式 */
    shouldNotExist?: string[];
  };

  /** 难度等级 */
  difficulty: 'easy' | 'medium' | 'hard';

  /** 标签（用于分组分析） */
  tags: string[];
}

/** Golden Set 集合，按 skill 分组 */
export interface GoldenSet {
  version: string;
  cases: GoldenTestCase[];
}

/** 评估选项 */
export interface EvalOptions {
  /** 运行哪些 skill 的评估 */
  skills?: string[];
  /** 过滤难度 */
  difficulty?: 'easy' | 'medium' | 'hard';
  /** 通过阈值 (0-100) */
  threshold?: number;
  /** 是否生成报告 */
  report?: boolean;
}

/** 单条用例评估结果 */
export interface CaseEvaluation {
  caseId: string;
  skill: string;
  difficulty: 'easy' | 'medium' | 'hard';
  diagnosis: EvaluationMetrics['diagnosis'];
  fix: EvaluationMetrics['fix'];
  overall: EvaluationMetrics['overall'];
  duration: number;
}

/** 整体评估结果 */
export interface OverallEvaluation {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  avgPrecision: number;
  avgRecall: number;
  avgF1: number;
  passRate: number;
  bySkill: Record<string, { cases: number; passed: number; f1: number }>;
  byDifficulty: Record<string, { cases: number; passed: number; f1: number }>;
}

/** 评估指标 */
export interface EvaluationMetrics {
  diagnosis: {
    precision: number;
    recall: number;
    f1: number;
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    expectedCount: number;
    actualCount: number;
    issueTypes: {
      expected: string[];
      actual: string[];
      missed: string[];
      extra: string[];
    };
  };
  fix: {
    precision: number;
    recall: number;
    f1: number;
    fixedCount: number;
    expectedFixCount: number;
    structuralChanges?: {
      addedNodes: number;
      removedNodes: number;
      modifiedNodes: number;
      totalChanges: number;
    };
  };
  overall: {
    precision: number;
    recall: number;
    f1: number;
    passed: boolean;
  };
}
