# QA-Agent 技术架构文档

> 架构设计遵循"插件化、可扩展、AI优先"原则

---

## 一、整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                          用户层                                  │
│    CLI │ Desktop App │ IDE Plugin │ CI/CD Integration         │
├─────────────────────────────────────────────────────────────────┤
│                        CLI 入口层                                │
│    Command Parser │ Router │ Help │ Version │ Config           │
├─────────────────────────────────────────────────────────────────┤
│                        任务调度层                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │  Intent  │ │  Task    │ │ Executor │ │ Result   │          │
│  │  Parser  │ │  Planner │ │          │ │ Aggregator│          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
├─────────────────────────────────────────────────────────────────┤
│                       Skills 插件层                              │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │
│  │  E2E   │ │ UI/UX  │ │  A11y  │ │  Perf  │ │Security│       │
│  │  Test  │ │ Audit⭐ │ │ Check  │ │ Audit  │ │  Scan  │       │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Skill Registry & Loader                     │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                        核心引擎层                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │Diagnosis │ │   Fix    │ │  Verify  │ │  Report  │          │
│  │  Engine  │ │  Engine  │ │  Engine  │ │  Engine  │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
├─────────────────────────────────────────────────────────────────┤
│                        基础设施层                                │
│  LLM Client │ Sandbox │ Browser │ File System │ Git │ CI      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、核心模块

### 2.1 CLI 入口层

```typescript
// 命令结构
qa-agent <command> [options]

// 核心命令
- diagnose    全面诊断
- ux-audit    UI/UX审查 ⭐
- design      设计规范管理 ⭐
- fix         自动修复
- audit       项目审计
- watch       监控模式
- skill       Skills管理
```

### 2.2 任务调度层

```typescript
interface TaskScheduler {
  // 意图解析：理解用户想做什么
  parseIntent(input: string): UserIntent;
  
  // 任务规划：拆解为可执行步骤
  planTask(intent: UserIntent): ExecutionPlan;
  
  // 并行执行：同时运行多个Skills
  executeParallel(tasks: Task[]): Promise<Result[]>;
  
  // 结果聚合：合并多维度结果
  aggregateResults(results: Result[]): FinalReport;
}
```

### 2.3 Skills 插件层

**Skill 接口定义**

```typescript
interface Skill {
  name: string;
  version: string;
  
  // 诊断能力
  diagnose(context: Context): Promise<Issue[]>;
  
  // 修复能力
  fix(issue: Issue): Promise<FixResult>;
  
  // 验证能力
  verify(fix: FixResult): Promise<VerifyResult>;
}
```

**UI/UX Audit Skill 架构** ⭐

```
┌─────────────────────────────────────────────────────────┐
│                  UI/UX Audit Skill                      │
├─────────────────────────────────────────────────────────┤
│  输入层                                                  │
│  ├── URL/本地文件                                        │
│  ├── 设计令牌（自动提取或Figma导入）                     │
│  └── 审查配置（严格度、维度选择）                        │
├─────────────────────────────────────────────────────────┤
│  分析引擎                                                │
│  ├── Design Token Extractor（设计令牌提取器）            │
│  ├── CSS Analyzer（CSS分析器）                           │
│  ├── Layout Checker（布局检查器）                        │
│  ├── Visual Matcher（视觉匹配器）                        │
│  └── AI Vision（AI视觉理解）                             │
├─────────────────────────────────────────────────────────┤
│  修复引擎                                                │
│  ├── CSS Fix Generator（CSS修复生成器）                  │
│  ├── Layout Fixer（布局修复器）                          │
│  └── Interaction Generator（交互状态生成器）             │
├─────────────────────────────────────────────────────────┤
│  验证层                                                  │
│  ├── Sandbox Preview（沙箱预览）                         │
│  ├── Visual Diff（视觉对比）                             │
│  └── Regression Test（回归测试）                         │
└─────────────────────────────────────────────────────────┘
```

---

## 三、核心引擎详解

### 3.1 诊断引擎

```typescript
interface DiagnosisEngine {
  // 问题分类
  classify(issue: RawIssue): IssueCategory;
  
  // 根因分析
  analyzeRootCause(issue: Issue): RootCause;
  
  // 影响评估
  assessImpact(issue: Issue): ImpactLevel;
  
  // 优先级排序
  prioritize(issues: Issue[]): PrioritizedIssues;
}
```

### 3.2 修复引擎

```typescript
interface FixEngine {
  // 生成修复方案
  generateFix(issue: Issue): FixProposal;
  
  // 风险评估
  assessRisk(fix: FixProposal): RiskLevel;
  
  // 应用修复
  applyFix(fix: FixProposal): AppliedFix;
  
  // 创建回滚点
  createRollbackPoint(): RollbackPoint;
  
  // 执行回滚
  rollback(point: RollbackPoint): void;
}
```

### 3.3 验证引擎

```typescript
interface VerifyEngine {
  // 回归测试
  runRegression(tests: Test[]): TestResult;
  
  // 视觉对比
  visualDiff(baseline: Screenshot, current: Screenshot): DiffResult;
  
  // 性能对比
  perfDiff(baseline: Metrics, current: Metrics): PerfResult;
  
  // 综合验证
  comprehensiveVerify(fix: AppliedFix): VerifyReport;
}
```

### 3.4 沙箱系统 ⭐

```typescript
interface Sandbox {
  // 创建隔离环境
  create(): SandboxInstance;
  
  // 应用变更
  applyChanges(changes: CodeChange[]): void;
  
  // 启动预览
  startPreview(): PreviewURL;
  
  // 运行测试
  runTests(tests: Test[]): TestResult;
  
  // 截图对比
  captureScreenshot(): Screenshot;
  
  // 销毁环境
  destroy(): void;
}
```

---

## 四、数据流

### 4.1 诊断流程

```
用户输入 → 意图解析 → 任务规划 → Skills并行执行 → 结果聚合 → 生成报告
              ↓
         选择Skills
         - E2E Test
         - UI/UX Audit ⭐
         - A11y Check
         - Perf Audit
         - Security Scan
```

### 4.2 修复流程

```
发现问题 → 根因分析 → 生成修复方案 → 风险评估 → 沙箱预览 ⭐ → 用户确认 → 应用修复 → 回归验证
                ↓
           低风险：自动修复
           高风险：人工确认
```

### 4.3 UI/UX审查流程 ⭐

```
输入URL/文件
    ↓
提取设计令牌（从代码或Figma）
    ↓
并行分析：
├── CSS分析（颜色、字体、间距）
├── 布局分析（对齐、网格、响应式）
├── 交互分析（状态完整性）
└── AI视觉分析（截图理解）
    ↓
聚合问题列表
    ↓
生成修复方案
    ↓
沙箱预览修复效果
    ↓
用户确认/调整
    ↓
应用修复
    ↓
回归验证
```

---

## 五、技术栈

| 层级 | 技术选型 |
|------|---------|
| CLI框架 | Commander.js + Ink (React CLI) |
| 任务调度 | RxJS + Async iterators |
| 浏览器自动化 | Playwright |
| AI/LLM | OpenAI API / Claude API / 本地模型 |
| 沙箱 | Docker / Node.js VM |
| 视觉对比 | Pixelmatch / Resemble.js |
| 设计工具 | Figma API |
| 测试框架 | Vitest / Playwright Test |
| 构建工具 | tsup / unbuild |

---

## 六、扩展性设计

### 6.1 Skill 开发规范

```typescript
// 最小Skill示例
export default defineSkill({
  name: 'my-skill',
  version: '1.0.0',
  
  async diagnose(context) {
    // 实现诊断逻辑
    return issues;
  },
  
  async fix(issue) {
    // 实现修复逻辑
    return fixResult;
  },
  
  async verify(fix) {
    // 实现验证逻辑
    return verifyResult;
  }
});
```

### 6.2 配置系统

```yaml
# .qa-agent/config.yml
skills:
  e2e:
    enabled: true
    browser: chromium
  uiux:
    enabled: true
    strictMode: false
    designTokens:
      source: auto-extract # 或 figma
  a11y:
    enabled: true
    level: AA

fix:
  autoApprove: low-risk
  sandbox: true
  
llm:
  provider: openai
  model: gpt-4
```

---

## 七、安全考虑

1. **沙箱隔离**：所有修复操作在沙箱中预览验证
2. **代码审查**：高风险变更需人工确认
3. **回滚机制**：每次修复自动创建回滚点
4. **敏感信息**：不收集代码内容，仅分析结构
5. **权限控制**：CI/CD场景支持最小权限原则

---

*文档版本: v1.0 | 最后更新: 2026-04-27*
