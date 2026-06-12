# QA-Agent AI Harness 架构文档

> AI Harness 工程：系统化评估和保证 AI 生成内容的质量

---

## 一、什么是 AI Harness？

AI Harness（AI 测试框架）是一套用于**评估、监控、持续改进** AI 生成代码质量的工程体系。

### 1.1 为什么需要 AI Harness？

当前项目的 AI Fix Engine 调用 LLM 后**直接信任返回结果**，存在以下风险：

| 风险 | 影响 | 示例 |
|------|------|------|
| 修复引入新 bug | 代码能改但改坏了 | 修了缺失 alt，却破坏了 JSX 结构 |
| 修复不兼容当前技术栈 | 生成代码跑不起来 | 生成 Vue 代码到 React 项目 |
| Prompt 质量退化 | 改了一个 skill 导致其他 skill 输出变差 | 没有回归检测 |
| 不同模型效果差异 | 无法量化选哪个模型好 | OpenAI vs Claude 的修复成功率 |

### 1.2 核心原则

```
AI Harness 三定律：

1. 任何 AI 输出必须可量化评估（不能"看起来不错"）
2. 任何 prompt 变更必须有回归保护（不能改一个坏三个）
3. 任何生产修复必须经过验证（不能跳过测试直接应用）
```

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Harness 系统                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Golden Set  │  │  Evaluation  │  │  Monitoring  │          │
│  │  (基准数据)  │  │  (评估引擎)  │  │  (监控面板)  │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                  │
│  ┌──────▼─────────────────▼─────────────────▼───────┐          │
│  │              Evaluation Pipeline                 │          │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │          │
│  │  │ Input  │ │ AI Run │ │ Verify │ │ Score  │   │          │
│  │  │ Loader │ │ Engine │ │ Engine │ │ Engine │   │          │
│  │  └────────┘ └────────┘ └────────┘ └────────┘   │          │
│  └─────────────────────────────────────────────────┘          │
│         │                                     │               │
│  ┌──────▼─────────────────────────────────────▼──────┐        │
│  │              Feedback Loop                         │          │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │        │
│  │  │ User   │ │ Accept │ │ Prompt │ │ Model  │     │        │
│  │  │ Signal │ │ /Reject│ │ Tuning │ │ Select │     │        │
│  │  └────────┘ └────────┘ └────────┘ └────────┘     │        │
│  └───────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、核心模块

### 3.1 Golden Set（基准数据集）

Golden Set 是一组**已知输入 + 已知期望输出**的测试用例，用于评估 AI 的输出质量。

#### 3.1.1 数据结构

```typescript
interface GoldenTestCase {
  /** 测试用例唯一标识 */
  id: string;

  /** 所属 skill（a11y, security, performance, ...） */
  skill: string;

  /** 输入：有问题的源代码 */
  input: {
    /** 文件内容 */
    code: string;
    /** 文件路径（用于推断技术栈） */
    filePath: string;
    /** 技术栈标签 */
    stack: ('react' | 'vue' | 'angular' | 'html' | 'css')[];
  };

  /** 期望的诊断结果 */
  expectedDiagnosis: {
    /** 应发现的问题数量 */
    issueCount: number;
    /** 应发现的具体问题类型 */
    issueTypes: string[];
    /** 不应出现的误报类型 */
    falsePositives?: string[];
  };

  /** 期望的修复结果 */
  expectedFix: {
    /** 修复后代码（或关键特征） */
    codePattern: string | RegExp;
    /** 修复后应不存在的模式 */
    shouldNotExist?: RegExp[];
    /** 修复后应能编译通过 */
    mustCompile?: boolean;
  };

  /** 难度等级 */
  difficulty: 'easy' | 'medium' | 'hard';

  /** 标签（用于分组分析） */
  tags: string[];
}
```

#### 3.1.2 Golden Set 分类

```
golden-set/
├── a11y/
│   ├── missing-alt/           # 缺失 alt 属性
│   │   ├── input.html          # 有问题的输入
│   │   ├── expected.json       # 期望诊断
│   │   └── expected-fix.ts     # 期望修复
│   ├── empty-button/
│   └── missing-label/
├── security/
│   ├── hardcoded-secret/
│   ├── sql-injection/
│   └── xss-vulnerability/
├── performance/
│   ├── large-bundle/
│   └── console-in-prod/
├── best-practices/
│   └── deprecated-api/
└── complexity/
    └── long-function/
```

#### 3.1.3 Golden Set 维护流程

```
新用例来源：
1. 用户报告误报/漏报 → 转化为测试用例
2. 新 skill 开发 → 必须附带 ≥5 个 golden cases
3. 模型升级评估 → 收集新 edge case

用例审核：
1. 输入必须有真实代码（不能是极简 toy example）
2. 期望输出必须经过人工 review
3. 难度分布应覆盖 easy/medium/hard
```

### 3.2 Evaluation Engine（评估引擎）

评估引擎负责运行 AI 并将输出与 Golden Set 对比。

#### 3.2.1 评估流程

```
                    ┌─────────────┐
                    │ Golden Set  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Load Cases  │
                    └──────┬──────┘
                           │
              ┌────────────▼────────────┐
              │                         │
       ┌──────▼──────┐          ┌───────▼───────┐
       │ Diagnosis   │          │ Fix Quality   │
       │ Evaluation  │          │ Evaluation    │
       └──────┬──────┘          └───────┬───────┘
              │                         │
       ┌──────▼──────┐          ┌───────▼───────┐
       │ Precision   │          │ Compile       │
       │ Recall      │          │ Correctness   │
       │ F1 Score    │          │ Semantic      │
       └─────────────┘          │ Equivalence   │
                                └───────────────┘
                                         │
                                ┌────────▼────────┐
                                │  Aggregate Score│
                                └────────┬────────┘
                                         │
                                ┌────────▼────────┐
                                │  Pass / Fail    │
                                └─────────────────┘
```

#### 3.2.2 评估指标

```typescript
interface EvaluationMetrics {
  // --- 诊断质量 ---
  diagnosis: {
    /** 精确率 = TP / (TP + FP) */
    precision: number;
    /** 召回率 = TP / (TP + FN) */
    recall: number;
    /** F1 = 2 * precision * recall / (precision + recall) */
    f1: number;
    /** 误报率 = FP / (FP + TN) */
    falsePositiveRate: number;
    /** 漏报率 = FN / (FN + TP) */
    falseNegativeRate: number;
  };

  // --- 修复质量 ---
  fix: {
    /** 修复成功率 = 能编译通过的修复数 / 总修复数 */
    successRate: number;
    /** 修复正确率 = 语义等价的修复数 / 总修复数 */
    correctnessRate: number;
    /** 平均修复时间（秒） */
    avgFixTime: number;
    /** 引入新 bug 的比例 */
    regressionRate: number;
  };

  // --- 整体 ---
  overall: {
    /** 总分 0-100 */
    score: number;
    /** 通过率 */
    passRate: number;
    /** 按 skill 分解 */
    bySkill: Record<string, number>;
    /** 按难度分解 */
    byDifficulty: Record<string, number>;
  };
}
```

#### 3.2.3 评估方法

```typescript
interface EvaluationEngine {
  /**
   * 运行完整评估
   * @param suite 评估套件名称（如 "a11y", "full"）
   * @param options 评估选项
   */
  evaluate(suite: string, options: EvalOptions): Promise<EvaluationMetrics>;

  /**
   * 评估诊断质量
   * - 对比 AI 发现的问题 vs 期望发现的问题
   * - 计算 precision, recall, F1
   */
  evaluateDiagnosis(cases: GoldenTestCase[]): Promise<DiagnosisMetrics>;

  /**
   * 评估修复质量
   * - 编译检查：修复后的代码能否通过 tsc/eslint
   * - 语义等价：修复是否改变了原有正确行为
   * - 模式匹配：修复是否符合 expected code pattern
   */
  evaluateFix(cases: GoldenTestCase[]): Promise<FixMetrics>;

  /**
   * 回归检测
   * - 对比当前评估结果 vs 历史基准
   * - 如果任何指标下降超过阈值，标记为回归
   */
  detectRegression(
    current: EvaluationMetrics,
    baseline: EvaluationMetrics
  ): RegressionReport;
}
```

### 3.3 Verification Engine（验证引擎）

验证 AI 生成的修复是否有效。

#### 3.3.1 验证层级

```
Level 0: 格式验证
  - 生成的代码是否符合语法
  - 是否有未闭合的标签/括号
  - JSON/Markdown 格式是否正确解析

Level 1: 编译验证
  - TypeScript 编译通过
  - ESLint 无 error
  - 无未定义的变量/类型

Level 2: 行为验证
  - 修复后的文件通过原有测试
  - 修复没有引入新的测试失败
  - 核心功能不受影响

Level 3: 语义等价验证
  - 修复前后的 AST diff 只在预期位置
  - 没有意外修改不相关代码
  - 代码风格保持一致
```

#### 3.3.2 验证实现

```typescript
interface VerificationEngine {
  /**
   * 验证修复
   * 按层级逐步验证，任一层级失败即返回失败
   */
  verify(fix: Fix, context: VerifyContext): Promise<VerifyResult>;

  /** Level 0: 语法检查 */
  verifySyntax(code: string, language: string): boolean;

  /** Level 1: 编译检查 */
  verifyCompilation(projectPath: string): CompileResult;

  /** Level 2: 测试检查 */
  verifyTests(projectPath: string, fix: Fix): TestResult;

  /** Level 3: AST diff 检查 */
  verifySemanticEquivalence(
    originalCode: string,
    fixedCode: string
  ): SemanticDiff;
}
```

### 3.4 Monitoring Dashboard（监控面板）

#### 3.4.1 核心指标看板

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Quality Score                          │
│                         ┌─────┐                                  │
│                         │ 87  │  目标: ≥85                       │
│                         └─────┘                                  │
├──────────────────┬──────────────────┬───────────────────────────┤
│ Diagnosis F1     │ Fix Success Rate │ Regression Count          │
│ ┌─────┐          │ ┌─────┐          │ ┌─────┐                   │
│ │ 0.92│          │ │ 0.88│          │ │  2  │  本周新增          │
│ └─────┘          │ └─────┘          │ └─────┘                   │
│ ↑ +0.03 vs 上周  │ ↑ +0.02 vs 上周  │ ↓ -1 vs 上周              │
├──────────────────┴──────────────────┴───────────────────────────┤
│ 按 Skill 分解                                                    │
│ ┌──────────┬───────┬────────┬────────┬────────┬────────┐       │
│ │ Skill    │ A11y  │ Sec    │ Perf   │ SEO    │ Dep    │       │
│ ├──────────┼───────┼────────┼────────┼────────┼────────┤       │
│ │ Precision│ 0.95  │ 0.88   │ 0.82   │ 0.91   │ 0.96   │       │
│ │ Recall   │ 0.89  │ 0.85   │ 0.78   │ 0.87   │ 0.92   │       │
│ │ F1       │ 0.92  │ 0.86   │ 0.80   │ 0.89   │ 0.94   │       │
│ └──────────┴───────┴────────┴────────┴────────┴────────┘       │
├─────────────────────────────────────────────────────────────────┤
│ 趋势图 (过去 30 天)                                              │
│  F1: ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                 │
│  Fix: ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、与现有架构的集成

### 4.1 在架构中的位置

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户层                                    │
├─────────────────────────────────────────────────────────────────┤
│                        CLI 入口层                                │
├─────────────────────────────────────────────────────────────────┤
│              ┌──────────────────────┐                           │
│              │   AI Harness 层 ⭐    │ ← 新增                    │
│              │  ├── Golden Set      │                           │
│              │  ├── Eval Engine     │                           │
│              │  ├── Verify Engine   │                           │
│              │  └── Monitor         │                           │
│              └──────────┬───────────┘                           │
├─────────────────────────┼───────────────────────────────────────┤
│                        核心引擎层                                │
│  ┌──────────┐ ┌─────────▼──────┐ ┌──────────┐ ┌──────────┐    │
│  │Diagnosis │ │   Fix Engine   │ │  Verify  │ │  Report  │    │
│  │  Engine  │ │   ← 接入验证   │ │  Engine  │ │  Engine  │    │
│  └──────────┘ └────────────────┘ └──────────┘ └──────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                       Skills 插件层                              │
├─────────────────────────────────────────────────────────────────┤
│                        基础设施层                                │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 集成点

```
1. Fix Engine → Verification Engine
   - 每次 applyFix 前自动调用 verify()
   - 验证失败则拒绝应用，回退到人工确认

2. AI Fix Engine → Evaluation Engine
   - 每次模型调用后记录 metrics
   - 支持 --eval 模式运行完整 golden set 评估

3. Skill Registry → Golden Set
   - 每个 skill 注册时必须关联 golden cases
   - 新 skill 提交需附带 golden cases

4. CLI → Monitor
   - qa-agent eval 命令运行评估
   - qa-agent eval --report 生成评估报告
```

### 4.3 CI/CD 集成

```yaml
# .github/workflows/ai-harness.yml
name: AI Harness Evaluation

on:
  push:
    paths:
      - 'src/skills/**'
      - 'src/engines/ai-fix/**'
      - 'golden-set/**'
  schedule:
    - cron: '0 2 * * *'  # 每天凌晨 2 点

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun install
      - run: bun run build
      - name: Run AI Harness Evaluation
        run: bun run eval --suite full --threshold 85
      - name: Upload Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: eval-report
          path: .qa-agent/eval-report.json
```

---

## 五、开发路线图

### Phase 1: 基础评估框架（2-3 周）

- [ ] Golden Set 数据结构定义
- [ ] 10 个 a11y golden cases（缺失 alt、空按钮、缺失 label）
- [ ] 10 个 security golden cases（硬编码密钥、SQL 注入、XSS）
- [ ] 评估引擎基础实现（precision/recall 计算）
- [ ] `qa-agent eval` CLI 命令

### Phase 2: 验证引擎（2-3 周）

- [ ] Level 0: 语法验证（语言解析器）
- [ ] Level 1: 编译验证（tsc/eslint 集成）
- [ ] Level 2: 测试验证（运行已有测试确保不回归）
- [ ] Level 3: AST diff 验证
- [ ] Fix Engine 接入验证（applyFix 前自动验证）

### Phase 3: 监控与反馈（2-3 周）

- [ ] 评估结果存储（本地 JSON + 可选远程）
- [ ] 趋势对比（与历史评估结果对比）
- [ ] 回归报警（指标下降超过阈值时警告）
- [ ] 用户反馈收集（accept/reject 信号记录）

### Phase 4: 智能优化（3-4 周）

- [ ] Prompt 自动调优（基于评估结果优化 prompt）
- [ ] 模型选择推荐（哪个 skill 用哪个模型效果最好）
- [ ] A/B 测试框架（对比不同 prompt/模型效果）
- [ ] Golden Set 自动扩展（从用户反馈中自动发现新用例）

---

## 六、Golden Set 示例

### 6.1 A11y: 缺失 alt

**输入** (`golden-set/a11y/missing-alt/input.html`):
```html
<img src="hero-banner.png">
<img src="logo.svg" class="brand-logo">
<div class="gallery">
  <img src="photo1.jpg">
  <img src="photo2.jpg" alt="">
</div>
```

**期望诊断** (`expected.json`):
```json
{
  "issueCount": 3,
  "issueTypes": ["missing-img-alt"],
  "falsePositives": [],
  "locations": [
    { "line": 1, "file": "input.html" },
    { "line": 2, "file": "input.html" },
    { "line": 4, "file": "input.html" }
  ]
}
```

**期望修复** (`expected-fix.ts`):
```typescript
{
  // 修复后的 <img> 必须有 alt 属性
  codePattern: /<img[^>]*\balt\s*=\s*"[^"]*"[^>]*>/g,
  // alt 不能为空（除非是装饰性图片，此时 alt="" 是可以的）
  shouldNotExist: [/<img(?![^>]*\balt\s*=)[^>]*>/g],
  // 修复后应该是有效的 HTML
  mustCompile: true
}
```

### 6.2 Security: 硬编码密钥

**输入** (`golden-set/security/hardcoded-secret/input.ts`):
```typescript
const API_KEY = 'sk-1234567890abcdef';
const password = 'admin123';
const dbUrl = 'mongodb://user:pass@host:27017/db';

// 这是正常代码
const normalString = 'This is not a secret';
const envVar = process.env.API_KEY;
```

**期望诊断**:
```json
{
  "issueCount": 3,
  "issueTypes": ["hardcoded-api-key", "hardcoded-password", "hardcoded-connection-string"],
  "falsePositives": ["normalString", "envVar"]
}
```

---

## 七、评估命令参考

```bash
# 运行完整评估
qa-agent eval

# 评估特定 skill
qa-agent eval --skill a11y
qa-agent eval --skill security

# 评估特定难度
qa-agent eval --difficulty hard

# 运行评估并生成报告
qa-agent eval --report

# 对比两次评估结果
qa-agent eval --compare baseline.json current.json

# 设置通过阈值（CI 中使用）
qa-agent eval --threshold 85

# 查看历史评估趋势
qa-agent eval --trend
```

---

## 八、质量门禁

在以下场景**必须**通过 AI Harness 评估：

| 场景 | 门禁要求 |
|------|---------|
| 新 skill 合并 | F1 ≥ 0.80, Fix Success ≥ 0.75 |
| Prompt 变更 | 任何 metric 不得下降 > 5% |
| 模型切换 | 全量 golden set 通过率 ≥ 85% |
| 发版 | 全量评估 F1 ≥ 0.85, Fix Success ≥ 0.80 |
| 用户反馈误报 | 相关 golden case 必须覆盖 |

---

*文档版本: v1.0 | 创建日期: 2026-06-05*