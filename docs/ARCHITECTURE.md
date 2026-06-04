# QA-Agent 技术架构文档

> 架构设计遵循"插件化、可扩展、AI优先"原则
> 文档版本: v1.1 | 最后更新: 2026-06-03
> 状态：v0.1.x 实现状态对齐

---

## 一、整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                          用户层                                  │
│    CLI │ Web Dashboard │ CI/CD Integration │ Programmatic API   │
├─────────────────────────────────────────────────────────────────┤
│                        CLI 入口层                                │
│    Commander.js  │  OutputFormatter  │  Interactive Prompts     │
├─────────────────────────────────────────────────────────────────┤
│                        Skills 插件层                              │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │
│  │  E2E   │ │ UI/UX  │ │  A11y  │ │  Perf  │ │Security│       │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │   SkillRegistry  │  getRegisteredSkills  │  BaseSkill   │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                        核心引擎层                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │Diagnosis │ │   Fix    │ │  Verify  │ │ Sandbox  │          │
│  │  Engine  │ │  Engine  │ │  Engine  │ │  Manager │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
├─────────────────────────────────────────────────────────────────┤
│                        基础设施层                                │
│  LLM Client │ Tool Registry │ Storage │ Shell │ Logger         │
└─────────────────────────────────────────────────────────────────┘
```

> **注**：v0.1.x 实现去除了架构文档中描述但未实现的"Scheduler/Task Planner"层，
> 当前由 CLI 命令直接调度 Skills。这种简化便于落地，后续 v0.3+ 可重新引入。

---

## 二、核心模块

### 2.1 CLI 入口层

- 入口：`src/cli/index.ts`（`src/cli/index.ts`）
- 框架：Commander.js
- 输出：`OutputFormatter`（`src/cli/output/formatter.ts`）

```typescript
// 命令结构
qa-agent <command> [options]

// 核心命令
- diagnose    全面诊断
- audit       项目审计
- fix         自动修复
- ux-audit    UI/UX 审查
- design      设计规范管理
- seo         SEO 检查
- dependency  依赖健康
- best-practices  最佳实践
- web         启动 Web Dashboard
- ci          CI/CD 集成
- skill       Skills 管理
- gui         GUI 自动化
- init        初始化配置
```

### 2.2 Skills 插件层

**Skill 接口定义**（`src/types/index.ts`）

```typescript
interface Skill {
  name: string;
  version: string;
  description: string;
  triggers: SkillTrigger[];
  capabilities: SkillCapability[];
  init?(context: SkillContext): Promise<void>;
  diagnose(context: SkillContext): Promise<Diagnosis[]>;
  fix?(diagnosis: Diagnosis, context: SkillContext): Promise<Fix>;
  verify?(fix: Fix, context: SkillContext): Promise<Verification>;
  cleanup?(): Promise<void>;
  matchesIntent?(intent: string): boolean;
}
```

**已实现的内置 Skills**（`src/skills/builtin/`）

| Skill | 名称 | 自动修复 |
|------|------|----------|
| A11ySkill | `a11y` | ✅ |
| E2ESkill | `e2e` | ✅ |
| UIUXSkill | `uiux-audit` | ✅ |
| BestPracticesSkill | `best-practices` | ✅ |
| SEOSkill | `seo` | ✅ |
| DependencySkill | `dependency` | ✅ |
| SecuritySkill | `security` | ✅ |
| PerformanceSkill | `performance` | ✅ |
| ComplexitySkill | `complexity` | ❌ |
| APISkill | `api` | ❌ |

**Skill 注册与发现**（`src/skills/registry.ts`）

```typescript
const registry = createSkillRegistry(logger);
for (const skill of getRegisteredSkills()) {
  registry.register(skill);
}

const diagnoses = await registry.runDiagnosis(['a11y', 'e2e'], context);
```

---

## 三、核心引擎详解

### 3.1 诊断引擎 `src/engines/diagnosis/`

```typescript
class DiagnosisEngine {
  buildReport(input: DiagnosisInput): DiagnosisReport;
  deduplicate(diagnoses: Diagnosis[]): Diagnosis[];
  prioritize(diagnoses: Diagnosis[]): PrioritizedDiagnosis[];
}
```

职责：
- 收集多 skill 诊断结果
- 去重（按 `file:line:title`）
- 按严重度/类型/可修复性计算优先级
- 推断根因（启发式）
- 生成综合报告（含 score、grade、dimension 分数）

### 3.2 修复引擎 `src/engines/fix/`

由各 Skill 自行实现 `fix(diagnosis, context)`，由 `qa-agent fix` 命令统一调度：

- `src/engines/fix/index.ts` Barrel（v0.3 起 re-export `./enhanced` 的 FixEngine）
- `src/engines/fix/enhanced.ts` 修复引擎（RollbackManager + VerifyEngine 集成）
- `src/engines/fix/batch.ts` 批量修复（BatchFixEngine）
- `src/engines/fix/rollback.ts` 回滚点管理（独立组件）
- 纯 IO 路径走 `src/core/fix.ts` 的 `applyFixes()`（v0.2 新增）
- 历史：`simple-fix.ts` / `debug.ts` 已在 v0.3 清理（孤儿代码）

### 3.3 验证引擎 `src/engines/verify/`

```typescript
class VerifyEngine {
  verifyFix(fix: Fix, context: SkillContext, options?: VerifyOptions): Promise<VerificationResult>;
  verifyFixes(fixes: Fix[], context: SkillContext, options?: VerifyOptions): Promise<VerificationResult[]>;
  generateReport(results: VerificationResult[]): string;
}
```

能力：
- 通过 skill registry 重新执行诊断，确认问题是否解决
- 解析并执行 `npm test`，采集通过/失败/跳过数
- 调用 `pixelmatch` 做视觉 diff（前后截图）
- 失败时记录具体原因

### 3.4 沙箱系统 `src/engines/sandbox/`

```typescript
class SandboxManager {
  create(config: SandboxConfig): Promise<SandboxInstance>;
  applyFix(instanceId: string, fix: Fix): Promise<void>;
  startServer(instanceId: string, port?: number): Promise<string>;
  captureScreenshot(instanceId: string, outputPath: string, options?): Promise<string>;
  visualDiff(before: string, after: string, outputPath: string): Promise<VisualDiffResult>;
  runTests(instanceId: string): Promise<{success, output, exitCode}>;
  destroy(instanceId: string): Promise<void>;
  cleanup(): Promise<void>;
}
```

特性：
- 自动选择 `npm run dev/start/serve` 启动
- 静态站点 fallback（`npx serve`）
- 自动分配端口（4000-4999 范围）
- Playwright 截图（不可用时降级为 1×1 PNG 占位）
- 进程生命周期管理（SIGTERM → SIGKILL）

---

## 四、基础设施

### 4.1 工具注册表 `src/tools/`

- `FileSystemTool` - 文件读写、glob、stat
- `BrowserTool` - Playwright 包装（运行时检测可用性）
- `GitTool` - 当前分支、commit hash、变更文件
- `ShellTool` - 跨平台命令执行（`src/utils/shell.ts`）

### 4.2 存储 `src/storage/`

- `createMemoryStorage()` - 内存 Map
- `createFileStorage(basePath)` - JSON 文件（懒加载 + 防抖写）
- `createStorage(basePath?)` - 默认工厂

### 4.3 LLM 客户端 `src/models/`

支持的 provider：`deepseek`, `openai`, `claude`, `siliconflow`, `groq`, `minimax`

无 API key 时降级为 `createMockModelClient()`，保证本地基本可用。

### 4.4 日志 `src/utils/logger.ts`

带 level、prefix、child 命名空间子 logger。CLI 输出走 `OutputFormatter`（带 chalk 颜色 + ora spinner）。

---

## 五、数据流

### 5.1 诊断流程

```
用户输入 qa-agent diagnose
  ↓
CLI 解析 → 加载 config → 创建 SkillContext
  ↓
SkillRegistry.runDiagnosis([skill names], context)  // 并发或串行
  ↓
收集所有 Diagnosis
  ↓
DiagnosisEngine.buildReport()  // 去重、排序、汇总
  ↓
OutputFormatter 输出 / 写入 .qa-agent/reports/
```

### 5.2 修复流程

```
诊断报告 → 选择可自动修复的 issues
  ↓
对每个 issue 调用 skill.fix(diagnosis, context)
  ↓
收集 Fix 对象 → 写入 .qa-agent/fixes/<fixId>.json
  ↓
可选：VerifyEngine.verifyFixes() 确认修复有效
```

### 5.3 UI/UX 审查流程

```
输入 URL/文件
  ↓
DesignTokenExtractor 提取设计令牌
  ↓
并行分析：
  ├── VisualChecker（颜色/字体/间距/圆角/阴影）
  ├── LayoutChecker（对齐/响应式/容器）
  └── InteractionChecker（hover/focus/active/disabled）
  ↓
聚合 Diagnosis → 报告
```

---

## 六、技术栈

| 层级 | 技术选型 | 实际使用 |
|------|---------|---------|
| CLI 框架 | Commander.js | ✅ |
| 输出 | chalk + ora | ✅ |
| 浏览器自动化 | Playwright | ✅（动态加载） |
| 视觉对比 | pixelmatch + pngjs | ✅ |
| AI/LLM | OpenAI 兼容 API | ✅（多 provider） |
| Shell | Bun.spawn / child_process | ✅（运行时检测） |
| 测试 | bun test | ✅ |
| 类型 | TypeScript | ✅ |

---

## 七、扩展性设计

### 7.1 Skill 开发规范

```typescript
import { BaseSkill } from '../base-skill';
import type { SkillContext, Diagnosis, Fix } from '../../types';

export class MySkill extends BaseSkill {
  name = 'my-skill';
  version = '1.0.0';
  description = 'My custom skill';

  triggers = [{ type: 'command', pattern: 'my-skill' }];
  capabilities = [{ name: 'check', description: '...', autoFixable: true, riskLevel: 'low' }];

  async diagnose(context: SkillContext): Promise<Diagnosis[]> { /* ... */ }
  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> { /* ... */ }
}
```

使用 `qa-agent skill create <name>` 生成模板。

### 7.2 配置系统

配置文件查找顺序：
1. `.qa-agent/config.yaml`
2. `.qa-agent/config.yml`
3. `.qa-agent/config.json`
4. `qa.config.ts` / `qa.config.js`
5. `.qarc.json`

未找到时使用 `DEFAULT_CONFIG`。

---

## 八、安全考虑

1. **沙箱隔离**：所有修改可在沙箱中预览再应用
2. **风险评估**：每个 Fix 都有 `riskLevel`，高风险需人工确认
3. **回滚机制**：自动创建 git-style 回滚点
4. **敏感信息**：检测但不收集，硬编码密钥仅在本地报告
5. **CI/CD 权限**：CI 模式默认只读不写，需 `--fix` 显式启用修复

---

*本文档与代码实现保持一致。代码修改后请同步更新本文档。*
