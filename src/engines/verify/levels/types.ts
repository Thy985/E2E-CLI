/**
 * Verify Engine types
 *
 * 4 个验证层级的公共类型定义，与原 verify/index.ts 保持 100% 兼容。
 */

import { Diagnosis, SkillContext } from '../../../types';

export interface VerificationResult {
  success: boolean;
  fixId: string;
  diagnosisId: string;
  before: {
    issues: number;
    details: string[];
  };
  after: {
    issues: number;
    details: string[];
  };
  diff: {
    fixed: number;
    remaining: number;
    new: number;
  };
  tests?: {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    /** 测试验证前后的状态对比 */
    beforeResult?: TestRunResult;
    afterResult?: TestRunResult;
    /** 新增失败的测试名称列表 */
    newFailures?: string[];
  };
  /** 各验证层级的结果 */
  levels: {
    format: { passed: boolean; error?: string };
    compile: { passed: boolean; output?: string };
    testValidation: { passed: boolean; output?: string; skipped: boolean };
    astDiff: { passed: boolean; skipped: boolean; result?: AstDiffResult };
  };
  errors: string[];
}

export interface VerifyOptions {
  /** 验证层级：0=格式, 1=编译, 2=测试, 3=AST diff */
  level?: number;
  /** 测试命令（默认自动检测） */
  testCommand?: string;
  /** 测试超时时间（毫秒，默认 120000） */
  testTimeout?: number;
  /** 编译验证超时时间（毫秒，默认 60000） */
  compileTimeout?: number;
  /** 测试失败次数容忍度（默认 0） */
  allowedTestFailures?: number;
  /** 修复前是否也运行测试以建立基线 */
  runBeforeTests?: boolean;
  /** 测试失败时是否重试（默认 1 次） */
  testRetries?: number;
  /** 忽略测试失败（仅警告，不阻止验证通过） */
  ignoreTestFailures?: boolean;
  /** AST diff 验证时允许的最大节点变更数（默认 50） */
  maxAstNodeChanges?: number;
}

export interface TestRunResult {
  success: boolean;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  output: string;
  runner: string;
  failedTests?: string[];
}

export interface AstDiffResult {
  passed: boolean;
  /** AST 解析是否成功 */
  parsed: boolean;
  /** 错误信息 */
  error?: string;
  /** 修复前后的 AST 节点数 */
  beforeNodes?: number;
  afterNodes?: number;
  /** 新增的 AST 节点数 */
  addedNodes: number;
  /** 移除的 AST 节点数 */
  removedNodes: number;
  /** 修改的 AST 节点数 */
  modifiedNodes: number;
  /** 总变更节点数 */
  totalChanges: number;
  /** 变更摘要 */
  summary: string[];
}

/** 内部规范化选项（与 VerifyEngine.constructor 保持一致） */
export type NormalizedVerifyOptions = Required<Omit<VerifyOptions, 'testCommand'>> & {
  testCommand?: string;
};

/** 诊断回调抽象，便于 runDiagnosis 解耦 */
export interface DiagnosisFetcher {
  (context: SkillContext, diagnosisId: string): Promise<Diagnosis[]>;
}
