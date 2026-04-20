# QA-Agent 技术架构文档

## 一、系统架构

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              用户层                                      │
│         CLI Interface │ Desktop App │ IDE Plugin │ CI/CD               │
├─────────────────────────────────────────────────────────────────────────┤
│                            API 网关层                                    │
│         Command Parser │ Auth │ Rate Limit │ Route │ Logging           │
├─────────────────────────────────────────────────────────────────────────┤
│                           任务调度层                                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │Intent Parser│ │Task Planner │ │  Executor   │ │ Aggregator  │       │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘       │
├─────────────────────────────────────────────────────────────────────────┤
│                          Skills 插件层                                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │   E2E   │ │ UI/UX   │ │  A11y   │ │  Perf   │ │Security │           │
│  │  Test   │ │ Audit   │ │ Check   │ │ Audit   │ │  Scan   │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │                    Skill Registry & Loader                   │       │
│  └─────────────────────────────────────────────────────────────┘       │
├─────────────────────────────────────────────────────────────────────────┤
│                           核心引擎层                                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │  Diagnosis  │ │    Fix      │ │  Verify     │ │   Report    │       │
│  │   Engine    │ │   Engine    │ │   Engine    │ │   Engine    │       │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘       │
├─────────────────────────────────────────────────────────────────────────┤
│                           模型服务层                                     │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │                    Model Router & Gateway                    │       │
│  └─────────────────────────────────────────────────────────────┘       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ OpenAI  │ │ Claude  │ │ Gemini  │ │ Qwen    │ │  Local  │           │
│  │   API   │ │   API   │ │   API   │ │  API    │ │ Models  │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
├─────────────────────────────────────────────────────────────────────────┤
│                          工具执行层                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │Playwright│ │Puppeteer│ │Lighthouse│ │  axe    │ │ Sonar   │           │
│  │ Runner  │ │  CLI    │ │  CLI    │ │  Core   │ │  CLI    │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
├─────────────────────────────────────────────────────────────────────────┤
│                           数据存储层                                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │   SQLite    │ │ File System │ │   Cache     │ │ Cloud Sync  │       │
│  │  (Local)    │ │  (Reports)  │ │  (Redis)    │ │  (Optional) │       │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心模块职责

| 模块 | 职责 | 关键能力 |
|------|------|----------|
| CLI Interface | 命令行交互 | 命令解析、参数验证、输出格式化 |
| Task Scheduler | 任务调度 | 意图解析、任务编排、并行执行、进度追踪 |
| Skill Registry | 插件管理 | Skill 加载、注册、发现、生命周期管理 |
| Diagnosis Engine | 诊断引擎 | 问题检测、分类、根因分析、优先级评估 |
| Fix Engine | 修复引擎 | 方案生成、代码变更、风险评估、变更预览 |
| Verify Engine | 验证引擎 | 回归测试、视觉对比、性能对比 |
| Report Engine | 报告引擎 | 报告生成、多格式导出、CI 集成 |
| Model Router | 模型路由 | 多模型适配、负载均衡、成本优化 |

---

## 二、核心模块设计

### 2.1 CLI 模块

```
src/cli/
├── index.ts              # CLI 入口
├── commands/
│   ├── diagnose.ts       # diagnose 命令
│   ├── fix.ts            # fix 命令
│   ├── audit.ts          # audit 命令
│   ├── watch.ts          # watch 命令
│   └── skill.ts          # skill 命令
├── options/
│   ├── global.ts         # 全局选项
│   └── output.ts         # 输出选项
├── output/
│   ├── formatter.ts      # 输出格式化
│   ├── table.ts          # 表格输出
│   └── progress.ts       # 进度条
└── config/
    ├── loader.ts         # 配置加载
    └── validator.ts      # 配置验证
```

**核心接口**

```typescript
// src/cli/types.ts
interface CLIContext {
  cwd: string;
  config: Config;
  logger: Logger;
  output: OutputFormat;
}

interface Command {
  name: string;
  description: string;
  options: Option[];
  action: (args: Args, context: CLIContext) => Promise<void>;
}

interface CommandResult {
  success: boolean;
  data?: any;
  error?: Error;
  report?: Report;
}
```

### 2.2 任务调度模块

```
src/scheduler/
├── index.ts
├── intent-parser.ts      # 意图解析
├── task-planner.ts       # 任务规划
├── executor.ts           # 任务执行
├── aggregator.ts         # 结果聚合
└── types.ts
```

**核心接口**

```typescript
// src/scheduler/types.ts
interface Task {
  id: string;
  type: 'diagnose' | 'fix' | 'verify';
  skill: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: TaskInput;
  output?: TaskOutput;
  error?: Error;
}

interface TaskPlan {
  tasks: Task[];
  dependencies: Map<string, string[]>;
  parallelGroups: Task[][];
}

interface TaskResult {
  taskId: string;
  success: boolean;
  data: Diagnosis[] | Fix[] | Verification;
  duration: number;
}
```

**任务调度流程**

```
用户输入
    ↓
IntentParser.parse() → 解析用户意图
    ↓
TaskPlanner.plan() → 生成任务计划
    ↓
Executor.execute() → 执行任务（并行）
    ↓
Aggregator.aggregate() → 聚合结果
    ↓
输出结果
```

### 2.3 Skills 插件系统

```
src/skills/
├── index.ts
├── registry.ts           # Skill 注册表
├── loader.ts             # Skill 加载器
├── types.ts              # 类型定义
├── base-skill.ts         # 基础 Skill 类
└── builtin/              # 内置 Skills
    ├── e2e/
    ├── a11y/
    ├── ui-ux/
    ├── perf/
    └── security/
```

**Skill 接口定义**

```typescript
// src/skills/types.ts
interface Skill {
  // 元数据
  name: string;
  version: string;
  description: string;
  author?: string;
  
  // 触发条件
  triggers: SkillTrigger[];
  
  // 能力
  capabilities: SkillCapability[];
  
  // 依赖
  dependencies?: string[];
  
  // 生命周期方法
  init?(context: SkillContext): Promise<void>;
  diagnose(context: SkillContext): Promise<Diagnosis[]>;
  fix?(diagnosis: Diagnosis, context: SkillContext): Promise<Fix>;
  verify?(fix: Fix, context: SkillContext): Promise<Verification>;
  cleanup?(): Promise<void>;
}

interface SkillTrigger {
  type: 'command' | 'keyword' | 'file' | 'url';
  pattern: string | RegExp;
  priority?: number;
}

interface SkillCapability {
  name: string;
  description: string;
  autoFixable: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

interface SkillContext {
  project: ProjectInfo;
  config: SkillConfig;
  logger: Logger;
  tools: ToolRegistry;
  model: ModelClient;
  storage: Storage;
}

// 诊断结果
interface Diagnosis {
  id: string;
  skill: string;
  type: DiagnosisType;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  location: Location;
  evidence?: Evidence;
  fixSuggestion?: FixSuggestion;
  metadata?: Record<string, any>;
}

// 修复方案
interface Fix {
  id: string;
  diagnosisId: string;
  description: string;
  changes: FileChange[];
  riskLevel: 'low' | 'medium' | 'high';
  autoApplicable: boolean;
  verificationSteps?: string[];
}

// 验证结果
interface Verification {
  fixId: string;
  success: boolean;
  evidence: VerificationEvidence[];
  duration: number;
}
```

**Skill 基类**

```typescript
// src/skills/base-skill.ts
abstract class BaseSkill implements Skill {
  abstract name: string;
  abstract version: string;
  abstract description: string;
  abstract triggers: SkillTrigger[];
  abstract capabilities: SkillCapability[];
  
  async init(context: SkillContext): Promise<void> {
    // 默认初始化逻辑
  }
  
  abstract diagnose(context: SkillContext): Promise<Diagnosis[]>;
  
  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    throw new Error('Fix not implemented');
  }
  
  async verify(fix: Fix, context: SkillContext): Promise<Verification> {
    // 默认验证逻辑
    return { fixId: fix.id, success: true, evidence: [], duration: 0 };
  }
  
  async cleanup(): Promise<void> {
    // 默认清理逻辑
  }
}
```

**Skill 加载机制**

```typescript
// src/skills/loader.ts
class SkillLoader {
  private searchPaths: string[];
  
  async loadSkill(name: string): Promise<Skill> {
    // 1. 查找 Skill 目录
    const skillPath = await this.findSkillPath(name);
    
    // 2. 加载 Skill 模块
    const skillModule = await import(skillPath);
    
    // 3. 实例化 Skill
    const skill = new skillModule.default();
    
    // 4. 验证 Skill 接口
    this.validateSkill(skill);
    
    return skill;
  }
  
  async loadAll(): Promise<Skill[]> {
    const skills: Skill[] = [];
    for (const path of this.searchPaths) {
      const skillDirs = await this.findSkillDirs(path);
      for (const dir of skillDirs) {
        try {
          const skill = await this.loadSkill(dir);
          skills.push(skill);
        } catch (error) {
          console.warn(`Failed to load skill: ${dir}`, error);
        }
      }
    }
    return skills;
  }
}
```

### 2.4 诊断引擎

```
src/engines/diagnosis/
├── index.ts
├── analyzer.ts           # 问题分析器
├── classifier.ts         # 问题分类器
├── root-cause.ts         # 根因分析
├── prioritizer.ts        # 优先级评估
└── types.ts
```

**核心流程**

```
Skill 诊断结果
    ↓
Analyzer.analyze() → 深度分析问题
    ↓
Classifier.classify() → 分类问题类型
    ↓
RootCauseAnalyzer.analyze() → 定位根因
    ↓
Prioritizer.prioritize() → 评估优先级
    ↓
输出诊断报告
```

**根因分析**

```typescript
// src/engines/diagnosis/root-cause.ts
interface RootCauseAnalyzer {
  analyze(diagnosis: Diagnosis, context: AnalysisContext): Promise<RootCause>;
}

interface RootCause {
  type: 'code' | 'config' | 'dependency' | 'environment' | 'design';
  location: Location;
  description: string;
  confidence: number;
  relatedIssues: string[];
  suggestedFixes: FixSuggestion[];
}

class E2ERootCauseAnalyzer implements RootCauseAnalyzer {
  async analyze(diagnosis: Diagnosis, context: AnalysisContext): Promise<RootCause> {
    // 1. 获取失败上下文
    const failureContext = await this.getFailureContext(diagnosis);
    
    // 2. 分析失败类型
    const failureType = this.classifyFailure(failureContext);
    
    // 3. 定位根因
    switch (failureType) {
      case 'selector_not_found':
        return this.analyzeSelectorIssue(failureContext);
      case 'assertion_failed':
        return this.analyzeAssertionIssue(failureContext);
      case 'timeout':
        return this.analyzeTimeoutIssue(failureContext);
      default:
        return this.analyzeGenericIssue(failureContext);
    }
  }
}
```

### 2.5 修复引擎

```
src/engines/fix/
├── index.ts
├── generator.ts          # 修复方案生成
├── applicator.ts         # 修复应用
├── risk-assessor.ts      # 风险评估
├── previewer.ts          # 修复预览
└── types.ts
```

**核心流程**

```
诊断结果
    ↓
FixGenerator.generate() → 生成修复方案
    ↓
RiskAssessor.assess() → 评估风险等级
    ↓
Previewer.preview() → 生成预览
    ↓
[用户确认]
    ↓
Applicator.apply() → 应用修复
    ↓
返回修复结果
```

**修复方案生成**

```typescript
// src/engines/fix/generator.ts
interface FixGenerator {
  generate(diagnosis: Diagnosis, context: FixContext): Promise<Fix>;
}

class A11yFixGenerator implements FixGenerator {
  async generate(diagnosis: Diagnosis, context: FixContext): Promise<Fix> {
    const ruleId = diagnosis.metadata?.ruleId;
    
    switch (ruleId) {
      case 'label':
        return this.generateLabelFix(diagnosis, context);
      case 'aria-label':
        return this.generateAriaLabelFix(diagnosis, context);
      case 'color-contrast':
        return this.generateContrastFix(diagnosis, context);
      default:
        return this.generateGenericFix(diagnosis, context);
    }
  }
  
  private async generateLabelFix(diagnosis: Diagnosis, context: FixContext): Promise<Fix> {
    const { location } = diagnosis;
    const fileContent = await context.tools.fs.readFile(location.file);
    const ast = parse(fileContent);
    
    // 找到对应的 input 元素
    const inputElement = findElement(ast, location);
    
    // 生成 label 元素
    const labelElement = createLabelElement(inputElement);
    
    // 生成修复
    return {
      id: generateId(),
      diagnosisId: diagnosis.id,
      description: `Add label for input element`,
      changes: [{
        file: location.file,
        type: 'insert',
        position: inputElement.loc.start,
        content: labelElement,
      }],
      riskLevel: 'low',
      autoApplicable: true,
    };
  }
}
```

**风险评估**

```typescript
// src/engines/fix/risk-assessor.ts
interface RiskAssessor {
  assess(fix: Fix, context: FixContext): Promise<RiskAssessment>;
}

interface RiskAssessment {
  level: 'low' | 'medium' | 'high';
  factors: RiskFactor[];
  confidence: number;
}

interface RiskFactor {
  type: 'scope' | 'dependency' | 'test_coverage' | 'complexity';
  description: string;
  impact: number;
}

class DefaultRiskAssessor implements RiskAssessor {
  async assess(fix: Fix, context: FixContext): Promise<RiskAssessment> {
    const factors: RiskFactor[] = [];
    
    // 1. 评估变更范围
    const scopeRisk = this.assessScope(fix);
    factors.push(scopeRisk);
    
    // 2. 评估依赖影响
    const dependencyRisk = await this.assessDependencies(fix, context);
    factors.push(dependencyRisk);
    
    // 3. 评估测试覆盖
    const testRisk = await this.assessTestCoverage(fix, context);
    factors.push(testRisk);
    
    // 4. 计算总体风险
    const totalRisk = this.calculateTotalRisk(factors);
    
    return {
      level: totalRisk > 0.7 ? 'high' : totalRisk > 0.3 ? 'medium' : 'low',
      factors,
      confidence: 0.85,
    };
  }
}
```

### 2.6 验证引擎

```
src/engines/verify/
├── index.ts
├── regression.ts         # 回归测试
├── visual.ts             # 视觉对比
├── performance.ts        # 性能对比
└── types.ts
```

**验证流程**

```typescript
// src/engines/verify/index.ts
class VerifyEngine {
  async verify(fix: Fix, context: VerifyContext): Promise<Verification> {
    const results: VerificationEvidence[] = [];
    
    // 1. 运行相关测试
    const testResult = await this.runRegressionTests(fix, context);
    results.push(testResult);
    
    // 2. 视觉对比（如果涉及 UI）
    if (this.isUIChange(fix)) {
      const visualResult = await this.runVisualComparison(fix, context);
      results.push(visualResult);
    }
    
    // 3. 性能对比（如果涉及性能）
    if (this.isPerformanceChange(fix)) {
      const perfResult = await this.runPerformanceComparison(fix, context);
      results.push(perfResult);
    }
    
    return {
      fixId: fix.id,
      success: results.every(r => r.success),
      evidence: results,
      duration: results.reduce((sum, r) => sum + r.duration, 0),
    };
  }
}
```

### 2.7 模型服务层

```
src/models/
├── index.ts
├── router.ts             # 模型路由
├── providers/
│   ├── openai.ts
│   ├── claude.ts
│   ├── gemini.ts
│   ├── qwen.ts
│   └── local.ts
├── cache.ts              # 响应缓存
└── types.ts
```

**模型路由策略**

```typescript
// src/models/router.ts
interface ModelRouter {
  route(request: ModelRequest): Promise<ModelProvider>;
}

interface ModelRequest {
  type: 'diagnosis' | 'fix' | 'analysis' | 'generation';
  complexity: 'low' | 'medium' | 'high';
  latency: 'fast' | 'normal';
  cost: 'economy' | 'standard' | 'premium';
}

class SmartModelRouter implements ModelRouter {
  private providers: Map<string, ModelProvider>;
  private config: RouterConfig;
  
  async route(request: ModelRequest): Promise<ModelProvider> {
    // 根据请求类型和配置选择最优模型
    const strategy = this.config.strategies[request.type];
    
    switch (strategy.mode) {
      case 'performance':
        return this.selectByPerformance(request);
      case 'cost':
        return this.selectByCost(request);
      case 'balanced':
        return this.selectBalanced(request);
      default:
        return this.getDefaultProvider();
    }
  }
  
  private selectBalanced(request: ModelRequest): ModelProvider {
    // 简单任务用便宜模型
    if (request.complexity === 'low') {
      return this.providers.get('gpt-4o-mini')!;
    }
    
    // 复杂任务用强模型
    if (request.complexity === 'high') {
      return this.providers.get('claude-opus')!;
    }
    
    // 中等任务用平衡模型
    return this.providers.get('claude-sonnet')!;
  }
}
```

---

## 三、数据模型设计

### 3.1 本地存储（SQLite）

```sql
-- 项目配置
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  name TEXT,
  config JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 诊断记录
CREATE TABLE diagnoses (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  skill TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location JSON,
  metadata JSON,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- 修复记录
CREATE TABLE fixes (
  id TEXT PRIMARY KEY,
  diagnosis_id TEXT NOT NULL,
  description TEXT,
  changes JSON,
  risk_level TEXT,
  status TEXT DEFAULT 'pending',
  applied_at TIMESTAMP,
  verified_at TIMESTAMP,
  FOREIGN KEY (diagnosis_id) REFERENCES diagnoses(id)
);

-- 执行历史
CREATE TABLE executions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  command TEXT,
  input JSON,
  output JSON,
  duration INTEGER,
  status TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Skills 配置
CREATE TABLE skills (
  name TEXT PRIMARY KEY,
  version TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  config JSON,
  installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 文件系统结构

```
.qa-agent/
├── config.yaml           # 项目配置
├── cache/
│   ├── models/           # 模型响应缓存
│   └── analysis/         # 分析结果缓存
├── reports/
│   ├── latest.html       # 最新报告
│   └── history/          # 历史报告
│       └── 2026-04-19/
│           ├── diagnose.html
│           └── diagnose.json
├── skills/               # 本地 Skills
│   └── custom-skill/
│       ├── skill.yaml
│       └── index.ts
└── snapshots/            # 视觉快照
    └── baseline/
        └── login-page.png
```

### 3.3 配置文件格式

```yaml
# .qa-agent/config.yaml
version: 1
project:
  name: my-project
  type: webapp
  
skills:
  - name: e2e-test
    enabled: true
    config:
      browser: chromium
      headless: true
  - name: a11y-check
    enabled: true
    config:
      level: AA
  - name: ui-ux-audit
    enabled: false

model:
  provider: claude
  model: claude-sonnet-4.5
  fallback: gpt-4o-mini
  
output:
  format: html
  path: .qa-agent/reports
  
ignore:
  - node_modules/
  - dist/
  - "*.test.ts"

rules:
  a11y:
    - rule: color-contrast
      severity: error
    - rule: label
      severity: warning
```

---

## 四、接口设计

### 4.1 核心 API

```typescript
// 诊断 API
interface DiagnoseAPI {
  diagnose(options: DiagnoseOptions): Promise<DiagnoseResult>;
}

interface DiagnoseOptions {
  skills?: string[];
  path?: string;
  url?: string;
  output?: 'html' | 'json' | 'markdown';
}

interface DiagnoseResult {
  summary: DiagnoseSummary;
  issues: Diagnosis[];
  report: string;
}

// 修复 API
interface FixAPI {
  fix(options: FixOptions): Promise<FixResult>;
  preview(fix: Fix): Promise<FixPreview>;
  apply(fix: Fix): Promise<ApplyResult>;
  rollback(fixId: string): Promise<void>;
}

interface FixOptions {
  issueIds?: string[];
  autoApprove?: ('low' | 'medium' | 'high')[];
  dryRun?: boolean;
  createPR?: boolean;
}

// Skills API
interface SkillAPI {
  list(): Promise<SkillInfo[]>;
  install(name: string): Promise<void>;
  update(name: string): Promise<void>;
  uninstall(name: string): Promise<void>;
  create(name: string, template: string): Promise<string>;
}
```

### 4.2 Skill 开发 API

```typescript
// Skill 开发接口
interface SkillAPI {
  // 文件操作
  fs: {
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    glob(pattern: string): Promise<string[]>;
  };
  
  // 浏览器操作
  browser: {
    launch(options?: BrowserOptions): Promise<Browser>;
    newPage(): Promise<Page>;
    screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  };
  
  // 模型调用
  model: {
    chat(messages: Message[]): Promise<string>;
    embed(text: string): Promise<number[]>;
  };
  
  // 诊断工具
  diagnose: {
    lighthouse(url: string): Promise<LighthouseResult>;
    axe(page: Page): Promise<AxeResult>;
    pa11y(url: string): Promise<Pa11yResult>;
  };
  
  // 报告工具
  report: {
    addIssue(issue: Diagnosis): void;
    addEvidence(evidence: Evidence): void;
  };
}
```

---

## 五、技术选型

### 5.1 核心技术栈

| 层级 | 技术 | 理由 |
|------|------|------|
| CLI 框架 | TypeScript + oclif | 类型安全、生态成熟 |
| 测试框架 | Playwright | 跨浏览器、功能强大 |
| 可访问性 | axe-core + pa11y | 业界标准 |
| 性能分析 | Lighthouse | Google 官方 |
| 模型接入 | LangChain + SDK | 灵活适配多模型 |
| 存储 | SQLite (better-sqlite3) | 轻量、本地优先 |
| 配置 | YAML (js-yaml) | 可读性好 |
| 日志 | winston | 功能全面 |
| 测试 | Vitest | 快速、现代 |

### 5.2 依赖清单

```json
{
  "dependencies": {
    "playwright": "^1.40.0",
    "axe-core": "^4.8.0",
    "lighthouse": "^11.0.0",
    "better-sqlite3": "^9.0.0",
    "js-yaml": "^4.1.0",
    "winston": "^3.11.0",
    "chalk": "^5.3.0",
    "ora": "^7.0.0",
    "inquirer": "^9.2.0",
    "@langchain/core": "^0.1.0",
    "openai": "^4.20.0",
    "@anthropic-ai/sdk": "^0.17.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "@types/node": "^20.10.0",
    "esbuild": "^0.19.0"
  }
}
```

---

## 六、性能优化策略

### 6.1 并行执行

```typescript
// 任务并行执行
class ParallelExecutor {
  async execute(tasks: Task[], concurrency: number = 4): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    const queue = [...tasks];
    const workers: Promise<void>[] = [];
    
    for (let i = 0; i < concurrency; i++) {
      workers.push(this.runWorker(queue, results));
    }
    
    await Promise.all(workers);
    return results;
  }
  
  private async runWorker(queue: Task[], results: TaskResult[]): Promise<void> {
    while (queue.length > 0) {
      const task = queue.shift();
      if (task) {
        const result = await this.executeTask(task);
        results.push(result);
      }
    }
  }
}
```

### 6.2 上下文缓存策略

**设计目标**

Agent 最贵的成本是 Token，最慢的速度是读取文件。如果不做优化，每次诊断都要重新扫描全量代码，体验会极差。

**目标指标**
- 二次运行响应速度提升 50% 以上
- Token 消耗降低 60% 以上
- 增量诊断延迟 < 5s

#### 6.2.1 增量上下文

利用 Git 信息，只扫描变更文件及其关联文件。

```typescript
// 基于Git的增量上下文
class IncrementalContextManager {
  private git: GitClient;
  private dependencyGraph: DependencyGraph;
  
  async getChangedContext(baseRef: string = 'HEAD~1'): Promise<ProjectContext> {
    // 1. 获取变更文件
    const changedFiles = await this.git.getChangedFiles(baseRef);
    
    // 2. 分析依赖关系，找出受影响的文件
    const affectedFiles = await this.dependencyGraph.getAffectedFiles(changedFiles);
    
    // 3. 构建增量上下文
    const context: ProjectContext = {
      changedFiles,
      affectedFiles,
      fullContext: await this.buildIncrementalContext(affectedFiles),
    };
    
    return context;
  }
  
  private async buildIncrementalContext(files: string[]): Promise<Context> {
    const context: Context = {
      files: {},
      relationships: [],
    };
    
    for (const file of files) {
      // 只读取变更的文件
      context.files[file] = await this.readFileWithCache(file);
      
      // 分析文件关系
      const imports = await this.analyzeImports(file);
      context.relationships.push(...imports);
    }
    
    return context;
  }
}
```

**变更检测策略**

```typescript
// 文件变更检测
class ChangeDetector {
  private fileHashes: Map<string, FileHash>;
  private gitWatcher: GitWatcher;
  
  async detectChanges(): Promise<ChangeSet> {
    const changes: ChangeSet = {
      added: [],
      modified: [],
      deleted: [],
    };
    
    // 1. Git diff 检测
    const gitChanges = await this.gitWatcher.getChanges();
    
    // 2. 文件哈希校验（防止遗漏）
    for (const file of await this.getAllTrackedFiles()) {
      const currentHash = await this.hashFile(file);
      const previousHash = this.fileHashes.get(file);
      
      if (!previousHash) {
        changes.added.push(file);
      } else if (currentHash !== previousHash) {
        changes.modified.push(file);
      }
      
      this.fileHashes.set(file, currentHash);
    }
    
    return changes;
  }
}
```

#### 6.2.2 语义缓存

记录项目知识图谱，避免重复向 LLM 发送相同内容。

```typescript
// 语义缓存系统
class SemanticCache {
  private vectorDb: VectorDatabase;  // 本地向量数据库
  private knowledgeGraph: ProjectKnowledgeGraph;
  
  async getCachedContext(query: string): Promise<CachedContext | null> {
    // 1. 向量检索相似上下文
    const embedding = await this.embed(query);
    const similar = await this.vectorDb.search(embedding, { topK: 5 });
    
    // 2. 验证缓存有效性
    for (const result of similar) {
      if (await this.isCacheValid(result)) {
        return result.context;
      }
    }
    
    return null;
  }
  
  async cacheContext(query: string, context: Context, response: string): Promise<void> {
    // 1. 生成嵌入向量
    const embedding = await this.embed(query);
    
    // 2. 存储到向量数据库
    await this.vectorDb.insert({
      id: generateId(),
      embedding,
      query,
      context,
      response,
      timestamp: Date.now(),
      fileHashes: await this.getRelevantFileHashes(context),
    });
  }
  
  private async isCacheValid(cached: CachedItem): Promise<boolean> {
    // 检查相关文件是否变更
    for (const [file, hash] of Object.entries(cached.fileHashes)) {
      const currentHash = await this.hashFile(file);
      if (currentHash !== hash) {
        return false;
      }
    }
    return true;
  }
}
```

**项目知识图谱**

```typescript
// 项目知识图谱
interface ProjectKnowledgeGraph {
  // 文件节点
  files: Map<string, FileNode>;
  
  // 依赖关系
  dependencies: Dependency[];
  
  // 语义索引
  semanticIndex: SemanticIndex;
  
  // 历史诊断结果
  diagnosisHistory: DiagnosisRecord[];
}

interface FileNode {
  path: string;
  hash: string;
  embedding: number[];
  symbols: Symbol[];
  imports: string[];
  exports: string[];
}

class KnowledgeGraphBuilder {
  async build(projectPath: string): Promise<ProjectKnowledgeGraph> {
    const graph: ProjectKnowledgeGraph = {
      files: new Map(),
      dependencies: [],
      semanticIndex: new SemanticIndex(),
      diagnosisHistory: [],
    };
    
    // 1. 扫描文件
    const files = await this.scanFiles(projectPath);
    
    // 2. 并行处理
    await Promise.all(files.map(async (file) => {
      const content = await fs.readFile(file, 'utf-8');
      
      // 解析符号
      const symbols = await this.parseSymbols(content, file);
      
      // 生成嵌入
      const embedding = await this.embed(content);
      
      // 分析依赖
      const imports = await this.parseImports(content, file);
      
      graph.files.set(file, {
        path: file,
        hash: await this.hash(content),
        embedding,
        symbols,
        imports: imports.map(i => i.source),
        exports: symbols.filter(s => s.exported).map(s => s.name),
      });
    }));
    
    // 3. 构建依赖图
    graph.dependencies = this.buildDependencyGraph(graph.files);
    
    return graph;
  }
}
```

#### 6.2.3 缓存层级

```
┌─────────────────────────────────────────────────────────────┐
│                     L1: 内存缓存                             │
│  当前会话的上下文、最近的LLM响应                              │
│  命中率: 30% │ 延迟: <1ms                                   │
├─────────────────────────────────────────────────────────────┤
│                     L2: 本地文件缓存                         │
│  文件内容哈希、解析后的AST、嵌入向量                         │
│  命中率: 50% │ 延迟: <10ms                                  │
├─────────────────────────────────────────────────────────────┤
│                     L3: 向量数据库                           │
│  语义索引、知识图谱、历史诊断                                │
│  命中率: 40% │ 延迟: <100ms                                 │
├─────────────────────────────────────────────────────────────┤
│                     L4: 项目级缓存                           │
│  完整的项目分析结果、依赖关系图                              │
│  命中率: 20% │ 延迟: <1s                                    │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 模型响应缓存

```typescript
// 模型响应缓存
class ModelCache {
  private cache: LRUCache<string, CachedResponse>;
  
  async getOrFetch(key: string, fetcher: () => Promise<string>): Promise<string> {
    const cached = this.cache.get(key);
    if (cached && !this.isExpired(cached)) {
      return cached.response;
    }
    
    const response = await fetcher();
    this.cache.set(key, { response, timestamp: Date.now() });
    return response;
  }
  
  private generateKey(request: ModelRequest): string {
    return hash(JSON.stringify(request));
  }
}
```

### 6.4 增量分析

```typescript
// 基于文件变更的增量分析
class IncrementalAnalyzer {
  private fileHashes: Map<string, string>;
  
  async analyze(changedFiles: string[]): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];
    
    for (const file of changedFiles) {
      const currentHash = await this.hashFile(file);
      const previousHash = this.fileHashes.get(file);
      
      if (currentHash !== previousHash) {
        const fileDiagnoses = await this.analyzeFile(file);
        diagnoses.push(...fileDiagnoses);
        this.fileHashes.set(file, currentHash);
      }
    }
    
    return diagnoses;
  }
}
```

### 6.5 性能指标监控

```typescript
// 性能指标收集
interface PerformanceMetrics {
  // 响应时间
  diagnosisLatency: Histogram;
  fixLatency: Histogram;
  
  // 缓存效率
  cacheHitRate: Gauge;
  tokenSaved: Counter;
  
  // 资源使用
  memoryUsage: Gauge;
  cpuUsage: Gauge;
}

class PerformanceMonitor {
  async recordDiagnosis(duration: number, cacheHit: boolean, tokensUsed: number): void {
    metrics.diagnosisLatency.observe(duration);
    metrics.cacheHitRate.set(cacheHit ? 1 : 0);
    metrics.tokenSaved.inc(cacheHit ? tokensUsed : 0);
  }
}
```

---

## 七、安全设计

### 7.1 权限分级模型

Agent 拥有"自动修复"的能力，这意味着它能写文件、执行 Shell 命令。必须建立严格的权限分级模型。

#### 7.1.1 权限级别

| 级别 | 名称 | 能力 | 风险 | 适用场景 |
|------|------|------|------|----------|
| 0 | 只读模式 | 读取代码，输出建议 | 无 | 默认模式，安全审计 |
| 1 | 建议模式 | 生成补丁文件，需人工确认 | 低 | 日常开发，代码审查 |
| 2 | 写入模式 | 允许直接修改文件 | 中 | 自动修复，需配置白名单 |
| 3 | 执行模式 | 允许执行 Shell 命令 | 高 | 测试运行，需严格限制 |

#### 7.1.2 权限配置

```yaml
# .qa-agent/config.yaml
permissions:
  # 默认权限级别
  default: read-only
  
  # 目录白名单（写入模式）
  writeAllowList:
    - src/
    - tests/
    - e2e/
  
  # 目录黑名单（任何模式都禁止）
  denyList:
    - .env
    - credentials/
    - .git/
    - node_modules/
  
  # 命令白名单（执行模式）
  commandAllowList:
    - npm test
    - npm run lint
    - npx playwright test
    - git diff
    - git status
  
  # 命令黑名单
  commandDenyList:
    - rm -rf
    - sudo
    - chmod
    - curl * | bash
    - wget * | bash
```

#### 7.1.3 权限管理器

```typescript
// 权限管理器
class PermissionManager {
  private config: PermissionConfig;
  private auditLog: AuditLogger;
  
  async checkPermission(operation: Operation): Promise<PermissionResult> {
    const level = this.getCurrentLevel();
    
    // 1. 检查权限级别
    if (operation.requiredLevel > level) {
      return {
        allowed: false,
        reason: `Operation requires level ${operation.requiredLevel}, current level is ${level}`,
      };
    }
    
    // 2. 检查路径白名单/黑名单
    if (operation.type === 'write') {
      const pathCheck = this.checkPath(operation.path);
      if (!pathCheck.allowed) {
        return pathCheck;
      }
    }
    
    // 3. 检查命令白名单/黑名单
    if (operation.type === 'execute') {
      const cmdCheck = this.checkCommand(operation.command);
      if (!cmdCheck.allowed) {
        return cmdCheck;
      }
    }
    
    // 4. 记录审计日志
    await this.auditLog.record({
      operation,
      level,
      timestamp: Date.now(),
      result: 'allowed',
    });
    
    return { allowed: true };
  }
  
  private checkPath(path: string): PermissionResult {
    // 黑名单优先
    for (const denied of this.config.denyList) {
      if (path.startsWith(denied)) {
        return {
          allowed: false,
          reason: `Path is in deny list: ${denied}`,
        };
      }
    }
    
    // 写入模式检查白名单
    if (this.getCurrentLevel() >= 2) {
      const inAllowList = this.config.writeAllowList.some(
        allowed => path.startsWith(allowed)
      );
      
      if (!inAllowList) {
        return {
          allowed: false,
          reason: `Path is not in write allow list`,
        };
      }
    }
    
    return { allowed: true };
  }
  
  private checkCommand(command: string): PermissionResult {
    // 黑名单检查
    for (const denied of this.config.commandDenyList) {
      if (this.matchesPattern(command, denied)) {
        return {
          allowed: false,
          reason: `Command matches denied pattern: ${denied}`,
        };
      }
    }
    
    // 白名单检查
    const inAllowList = this.config.commandAllowList.some(
      allowed => this.matchesPattern(command, allowed)
    );
    
    if (!inAllowList) {
      return {
        allowed: false,
        reason: `Command is not in allow list`,
      };
    }
    
    return { allowed: true };
  }
}
```

#### 7.1.4 交互式权限提升

```typescript
// 权限提升请求
class PermissionElevator {
  async requestElevation(
    operation: Operation,
    reason: string
  ): Promise<boolean> {
    console.log(chalk.yellow('⚠️  Permission Elevation Required'));
    console.log(chalk.gray(`Reason: ${reason}`));
    console.log(chalk.gray(`Operation: ${operation.type}`));
    console.log(chalk.gray(`Target: ${operation.target}`));
    
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'allow',
        message: 'Allow this operation?',
        default: false,
      },
      {
        type: 'list',
        name: 'scope',
        message: 'Permission scope?',
        options: [
          { value: 'once', label: 'This time only' },
          { value: 'session', label: 'For this session' },
          { value: 'always', label: 'Always allow (add to config)' },
        ],
        when: (answers) => answers.allow,
      },
    ]);
    
    if (answer.allow && answer.scope === 'always') {
      await this.addToConfig(operation);
    }
    
    return answer.allow;
  }
}
```

### 7.2 沙盒执行

所有的修复操作和测试运行，在隔离环境中进行，防止污染用户的主开发环境。

#### 7.2.1 沙盒架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Host System                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  QA-Agent Core                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │  Diagnosis  │  │    Fix      │  │   Verify    │  │   │
│  │  │   Engine    │  │   Engine    │  │   Engine    │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Sandbox Layer                     │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐        │   │
│  │  │ Docker    │  │ Temp Dir  │  │ Git       │        │   │
│  │  │ Container │  │ Isolation │  │ Worktree  │        │   │
│  │  └───────────┘  └───────────┘  └───────────┘        │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Isolated Environment               │   │
│  │  • File System Copy                                  │   │
│  │  • Network Isolation (optional)                      │   │
│  │  • Resource Limits                                   │   │
│  │  • Process Isolation                                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### 7.2.2 Docker 沙盒

```typescript
// Docker 沙盒实现
class DockerSandbox implements Sandbox {
  private container?: DockerContainer;
  private config: SandboxConfig;
  
  async create(options: SandboxOptions): Promise<void> {
    this.container = await docker.createContainer({
      Image: 'qa-agent-runner:latest',
      
      // 挂载项目目录（只读或指定目录）
      HostConfig: {
        Binds: [
          `${options.projectPath}:/app:ro`,  // 项目只读
          `${options.workDir}:/work:rw`,      // 工作目录可写
        ],
        
        // 资源限制
        Memory: options.memoryLimit || 512 * 1024 * 1024,  // 512MB
        CpuQuota: options.cpuLimit || 50000,  // 50% CPU
        
        // 网络隔离
        NetworkMode: options.networkIsolated ? 'none' : 'bridge',
        
        // 安全选项
        SecurityOpt: ['no-new-privileges'],
        CapDrop: ['ALL'],
      },
      
      // 环境变量
      Env: [
        'NODE_ENV=test',
        `QA_AGENT_SANDBOX=true`,
      ],
    });
    
    await this.container.start();
  }
  
  async execute(command: string): Promise<ExecuteResult> {
    if (!this.container) {
      throw new Error('Sandbox not initialized');
    }
    
    const exec = await this.container.exec({
      Cmd: ['sh', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
    });
    
    const stream = await exec.start();
    const output = await this.collectOutput(stream);
    
    return {
      stdout: output.stdout,
      stderr: output.stderr,
      exitCode: output.exitCode,
    };
  }
  
  async copyFile(path: string, content: Buffer): Promise<void> {
    await this.container!.putArchive(
      tar.pack({ path, content }),
      { path: '/work' }
    );
  }
  
  async destroy(): Promise<void> {
    if (this.container) {
      await this.container.stop();
      await this.container.remove({ force: true });
      this.container = undefined;
    }
  }
}
```

#### 7.2.3 临时目录隔离

```typescript
// 临时目录沙盒（轻量级）
class TempDirSandbox implements Sandbox {
  private tempDir?: string;
  private originalDir: string;
  
  async create(options: SandboxOptions): Promise<void> {
    // 1. 创建临时目录
    this.tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-agent-'));
    
    // 2. 复制项目文件
    await this.copyProjectFiles(options.projectPath);
    
    // 3. 记录原始目录
    this.originalDir = process.cwd();
    
    // 4. 切换到临时目录
    process.chdir(this.tempDir);
  }
  
  private async copyProjectFiles(projectPath: string): Promise<void> {
    // 只复制必要的文件
    const includePatterns = [
      'src/**/*',
      'tests/**/*',
      'e2e/**/*',
      'package.json',
      'tsconfig.json',
    ];
    
    for (const pattern of includePatterns) {
      const files = await glob(pattern, { cwd: projectPath });
      for (const file of files) {
        const src = path.join(projectPath, file);
        const dest = path.join(this.tempDir!, file);
        await fs.ensureDir(path.dirname(dest));
        await fs.copy(src, dest);
      }
    }
  }
  
  async execute(command: string): Promise<ExecuteResult> {
    return execAsync(command, { cwd: this.tempDir });
  }
  
  async destroy(): Promise<void> {
    // 1. 切换回原始目录
    process.chdir(this.originalDir);
    
    // 2. 清理临时目录
    if (this.tempDir) {
      await fs.remove(this.tempDir);
      this.tempDir = undefined;
    }
  }
}
```

#### 7.2.4 Git Worktree 隔离

```typescript
// Git Worktree 沙盒
class GitWorktreeSandbox implements Sandbox {
  private worktreePath?: string;
  
  async create(options: SandboxOptions): Promise<void> {
    // 1. 创建 worktree
    this.worktreePath = path.join(
      os.tmpdir(),
      `qa-agent-${Date.now()}`
    );
    
    await git.worktreeAdd(this.worktreePath, {
      branch: `qa-agent-fix-${Date.now()}`,
      orphan: true,
    });
    
    // 2. 复制当前更改
    await this.copyChanges(options.projectPath);
  }
  
  async applyFix(fix: Fix): Promise<void> {
    // 在 worktree 中应用修复
    for (const change of fix.changes) {
      const filePath = path.join(this.worktreePath!, change.file);
      await this.applyChange(filePath, change);
    }
  }
  
  async commit(message: string): Promise<string> {
    await git.add(this.worktreePath!, '.');
    await git.commit(this.worktreePath!, message);
    return await git.getCommitHash(this.worktreePath!);
  }
  
  async destroy(): Promise<void> {
    if (this.worktreePath) {
      await git.worktreeRemove(this.worktreePath);
      this.worktreePath = undefined;
    }
  }
}
```

### 7.3 敏感信息保护

```typescript
// 敏感信息检测与脱敏
class SensitiveDataProtector {
  private patterns = [
    /api[_-]?key\s*[=:]\s*['"]?([a-zA-Z0-9_-]+)/gi,
    /secret\s*[=:]\s*['"]?([a-zA-Z0-9_-]+)/gi,
    /password\s*[=:]\s*['"]?([a-zA-Z0-9_-]+)/gi,
    /token\s*[=:]\s*['"]?([a-zA-Z0-9_-]+)/gi,
  ];
  
  scan(content: string): SensitiveData[] {
    const findings: SensitiveData[] = [];
    
    for (const pattern of this.patterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        findings.push({
          type: this.classifyType(match[0]),
          value: match[1],
          location: this.getLocation(content, match.index!),
        });
      }
    }
    
    return findings;
  }
  
  mask(content: string): string {
    let masked = content;
    for (const pattern of this.patterns) {
      masked = masked.replace(pattern, (match, value) => {
        return match.replace(value, '*'.repeat(value.length));
      });
    }
    return masked;
  }
}
```

### 7.4 审计日志

```typescript
// 审计日志记录
interface AuditLog {
  id: string;
  timestamp: number;
  operation: Operation;
  permission: PermissionLevel;
  result: 'allowed' | 'denied' | 'error';
  reason?: string;
  user?: string;
  sessionId: string;
}

class AuditLogger {
  private db: Database;
  
  async record(log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
    await this.db.insert('audit_logs', {
      id: generateId(),
      timestamp: Date.now(),
      ...log,
    });
  }
  
  async query(filter: AuditFilter): Promise<AuditLog[]> {
    return this.db.query('audit_logs', filter);
  }
  
  async export(format: 'json' | 'csv'): Promise<string> {
    const logs = await this.db.getAll('audit_logs');
    
    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    }
    
    return this.toCSV(logs);
  }
}
```

---

## 八、可观测性

### 8.1 日志系统

```typescript
// 结构化日志
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// 使用
logger.info('Diagnosis started', {
  skill: 'e2e-test',
  project: 'my-project',
  correlationId: 'abc-123',
});
```

### 8.2 指标收集

```typescript
// 性能指标
interface Metrics {
  diagnosisDuration: Histogram;
  fixSuccessRate: Gauge;
  modelLatency: Histogram;
  cacheHitRate: Gauge;
}

class MetricsCollector {
  private metrics: Metrics;
  
  recordDiagnosis(skill: string, duration: number, issueCount: number): void {
    this.metrics.diagnosisDuration.observe({ skill }, duration);
  }
  
  recordFix(fixId: string, success: boolean): void {
    this.metrics.fixSuccessRate.set({ success }, success ? 1 : 0);
  }
}
```

### 8.3 链路追踪

```typescript
// 分布式追踪
class Tracer {
  private spans: Map<string, Span>;
  
  startSpan(name: string, parent?: Span): Span {
    const span = {
      id: generateId(),
      name,
      parentId: parent?.id,
      startTime: Date.now(),
      attributes: {},
    };
    this.spans.set(span.id, span);
    return span;
  }
  
  endSpan(span: Span): void {
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    this.export(span);
  }
}
```
