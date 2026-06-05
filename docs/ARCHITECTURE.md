# QA-Agent 技术架构文档

> 架构设计遵循"插件化、可扩展、AI优先"原则

---

## 一、整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                          用户层                                  │
│    CLI │ CI/CD Integration                                     │
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
│                       AI Harness 层                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Golden   │ │  Eval    │ │  Verify  │ │ Monitor  │          │
│  │  Set     │ │  Engine  │ │  Engine  │ │          │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
├─────────────────────────────────────────────────────────────────┤
│                       Skills 插件层                              │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │
│  │  E2E   │ │ UI/UX  │ │  A11y  │ │  Perf  │ │Security│       │
│  │  Test  │ │ Audit  │ │ Check  │ │ Audit  │ │  Scan  │       │
│  └────────┘ └────────┘ └────────┘ └──────────┘ └──────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Skill Registry & Loader                     │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                        核心引擎层                                │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────┐        │
│  │   Fix    │ │ BatchFix  │ │  AIFix   │ │  Audit   │        │
│  │  Engine  │ │  Engine   │ │  Engine  │ │  Engine  │        │
│  └──────────┘ └───────────┘ └──────────┘ └──────────┘        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Sandbox  │ │  Verify  │ │  Report  │ │  (扩展)  │        │
│  │  Manager │ │  Engine  │ │  Engine  │ │          │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
├─────────────────────────────────────────────────────────────────┤
│                        基础设施层                                │
│  Model Client (OpenAI/Claude/DeepSeek/SiliconFlow/Groq/MiniMax) │
│  Sandbox (puppeteer-core + pixelmatch)                           │
│  File System │ Git │ Shell                                      │
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
- fix         交互式/批量修复
- audit       项目审计
- ux-audit    UI/UX专项审查
- seo         SEO诊断
- best-practices  最佳实践检查
- dependency     依赖健康检查
- skill          Skills管理
- ci             CI/CD配置生成
```

### 2.2 任务调度层

> **实现状态**: 部分实现。意图匹配系统（SkillRegistry.findByIntent）已存在，但 CLI 命令直接使用 Skill 调用，未经过调度器路由。调度器的完整 pipeline（Intent → Plan → Execute → Aggregate）尚未在 CLI 中串通。

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

**已实现的 Skills**

| Skill | 状态 | 实现方式 | 说明 |
|-------|------|---------|------|
| a11y | ✅ | Regex | 无障碍检查 (WCAG) |
| e2e | ✅ (partial) | Regex | E2E 测试 (无真实 Playwright 集成) |
| performance | ✅ | Regex | 性能审计 |
| security | ✅ | Regex | 安全扫描 |
| seo | ✅ | Regex | SEO 诊断 |
| dependency | ✅ | Regex | 依赖健康检查 |
| best-practices | ✅ | Regex | 最佳实践检查 |
| ui-ux | ✅ | Regex | UI/UX 审查 |
| uiux | ✅ | Regex | Design Token 提取 |
| complexity | ✅ | Regex | 代码复杂度分析 |
| api | ✅ | Regex | API 路由扫描与端点检查 |

> 注：所有 Skills 当前均使用正则表达式分析，尚未接入 AST 解析。

**UI/UX Audit Skill 架构**

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

### 3.1 FixEngine

真实的文件修改引擎，支持原子回滚与风险评估。

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

**关键特性**:
- 原子性操作：修改失败自动回滚
- 风险评估：根据影响范围标记 low/medium/high
- 回滚机制：每次修复自动创建快照

### 3.2 BatchFixEngine

批量修复引擎，跨多个 Skills 并行处理问题。

- 接收多维度诊断结果
- 按风险等级排序修复优先级
- 批量应用修复并生成汇总报告

### 3.3 AIFixEngine

LLM 驱动的修复引擎，通过 Model Client 调用大模型生成修复方案。

- 支持多种模型：OpenAI / Claude / DeepSeek / SiliconFlow / Groq / MiniMax
- 上下文感知：自动注入相关文件内容与诊断信息
- 修复建议可审查，不自动应用高风险变更

### 3.4 SandboxManager

真实的沙箱系统，支持截图与视觉差异对比。

- **截图**: 使用 `puppeteer-core` 捕获页面截图
- **视觉差异**: 使用 `pixelmatch` 进行像素级对比
- **图片处理**: 内置 zlib PNG 编解码

### 3.5 AuditEngine

合规性审计引擎，内置多个合规检查器。

- **WCAG**: 无障碍合规检查
- **GDPR**: 数据隐私合规
- **SOC2**: 安全控制审计
- **OWASP**: Web 安全漏洞扫描

### 3.6 VerifyEngine

验证引擎（占位实现）。用于验证修复后的效果，目前为框架预留，尚未实现完整的验证逻辑。

### 3.7 ReportEngine

报告生成引擎，支持多种输出格式。

- HTML / JSON / Markdown / Compact 格式
- 问题分级与统计
- 可导出为文件

---

## 四、数据流

### 4.1 诊断流程

```
用户输入 → 意图解析 → 任务规划 → Skills并行执行 → 结果聚合 → 生成报告
              ↓
         选择Skills
         - E2E Test
         - UI/UX Audit
         - A11y Check
         - Perf Audit
         - Security Scan
```

### 4.2 修复流程

```
发现问题 → 根因分析 → 生成修复方案 → 风险评估 → 沙箱预览 → 用户确认 → 应用修复 → 回归验证
                ↓
           低风险：自动修复
           高风险：人工确认
```

### 4.3 UI/UX审查流程

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
| CLI框架 | Commander.js |
| Runtime | Bun |
| LLM | OpenAI / Claude / DeepSeek / SiliconFlow / Groq / MiniMax (via createModelClient) |
| Screenshot | puppeteer-core |
| Visual Diff | pixelmatch |
| Image Processing | zlib (built-in PNG encode/decode) |
| Test | bun:test |
| Build | tsc |

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

### 6.3 AI Harness

AI Harness 层提供 Golden Set 管理、评估引擎、验证引擎和监控能力，用于 AI 驱动的自动化质量保障闭环。详见 [AI_HARNESS.md](AI_HARNESS.md)。

---

## 七、安全考虑

1. **沙箱隔离**：所有修复操作在沙箱中预览验证
2. **代码审查**：高风险变更需人工确认
3. **回滚机制**：每次修复自动创建回滚点
4. **敏感信息**：不收集代码内容，仅分析结构
5. **权限控制**：CI/CD场景支持最小权限原则

---

*文档版本: v2.0 | 最后更新: 2026-06-05*
