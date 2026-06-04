---
id: 0005
title: "v0.4 核心层重构：types 拆分 + logger 结构化 JSON + core 补测试"
status: accepted
date: 2026-06-04
supersedes: null
superseded_by: null
related: ["0001", "0002", "0003", "0004"]
tags: [refactor, types, logging, testability, adr]
---

# 1. 背景

v0.3.1 之后剩余的 [memory.json known_issues](../../memory.json) 3 项触及核心层：

1. **`src/types/index.ts` 493 行未拆分** — 56 个 export 全部塞在一个文件，按主题可拆 14 个子文件
2. **logger 是 `console.log` 而非结构化 JSON** — CI/程序化消费者无法解析
3. **`core/` 测试覆盖不全** — 只有 `project-info` + `fix`，缺 `diagnose` + `context`

`types/index.ts` 拆分是 **D 类**（改 public API）— 触发 [memory.json adr_triggers](../../memory.json)：
> "修改 src/storage/、src/models/、src/cli/index.ts、**src/types/** 的核心接口"

# 2. 备选方案

### 方案 A：14 文件 + barrel + logger 双格式（采用）

**types 拆分**（14 文件 + barrel）：
```
src/types/
├── index.ts          ← barrel re-export 全部 56 export（零破坏）
├── skill.ts          ← Skill/SkillTrigger/SkillCapability/SkillContext/SkillConfig/SkillConfigEntry
├── diagnosis.ts      ← DiagnosisType/Severity/Diagnosis/Location/Evidence/FixSuggestion
├── fix.ts            ← Fix/FileChange
├── verification.ts   ← Verification/VerificationEvidence
├── report.ts         ← DiagnosisReport/ReportSummary
├── project.ts        ← ProjectInfo
├── tool.ts           ← ToolRegistry + 7 个 Browser/Shell/Git/FileSystem 子类型
├── model.ts          ← ModelClient/ModelMessage/ModelOptions/ModelRequest/ModelResponse
├── storage.ts        ← Storage
├── logger.ts         ← Logger
├── cli.ts            ← CLIContext/Config/OutputFormat/DiagnoseOptions/FixOptions
├── permission.ts     ← PermissionLevel/PermissionConfig/Operation/PermissionResult
└── audit.ts          ← AuditReport + 8 个 audit 子类型
```

**logger 双格式**：
- 默认 `text`（向后兼容）— 现有输出格式
- opt-in `json` — `new Logger({format: 'json'})` 或 `QA_AGENT_LOG_FORMAT=json` 环境变量
- `text`：人类可读，保持现状
- `json`：`console.log(JSON.stringify({ts, level, prefix, message, data}))`

**core 测试**：
- `core/diagnose.test.ts` — 测：技能过滤 / disabled 排除 / 空 skills 早返回 / skill 抛错容错
- `core/context.test.ts` — 测：注入自定义 logger / child 共享 level / registry 含全部 registered skills

### 方案 B：3 大类（domain/infra/gov）— 不采用

- 太粗，`types/audit.ts` 和 `types/cli.ts` 不应同文件
- 优点：少 11 个文件
- 缺点：失去内聚性

### 方案 C：拆完删 index.ts 强制按需 import — 不采用

- 30+ 文件需要改 import 路径
- 公开 API 破坏性变更，无必要收益
- 优点：强制开发者用具体子类型
- 缺点：成本高、零功能性收益

### 方案 D：logger 只保留 json — 不采用

- 破坏本地可读性
- 用户已选双格式

# 3. 决定

采用 **方案 A**：

1. **types 拆分**：14 个子文件 + `index.ts` barrel re-export **全部 56 export**（零破坏）
2. **logger 双格式**：默认 `text` 保持兼容，`format: 'json'` 或 env var opt-in
3. **core 补测试**：`diagnose.test.ts` + `context.test.ts`

**关键约束**：
- `SkillContext` 在 `skill.ts` 依赖 `Logger`（types/logger）+ `ProjectInfo`（project）+ `ToolRegistry`（tool）— **所有跨文件 type 引用必须用 `import type`** 避免运行时循环
- `index.ts` barrel **不重新声明类型**（`export type` 而非 `export interface`）— IDE 跳转仍能 go-to-source
- `data` 参数是 `unknown` 类型，JSON 序列化时需 try/catch（`String(data)` fallback）
- 现有 30+ import `from '../types'` 的文件**零改动**

# 4. 原因

- **types 拆分**是 491 行单体 → 14 主题模块，IDE 跳转从"全文件 grep"变成"go-to-source"
- **barrel re-export** 保留 API surface = 零破坏重构（vs 方案 C 的破坏性变更）
- **logger 双格式** = 兼容 + 现代化，CI 消费者切 json，本地用户保持可读
- **core 测试补全** = diagnose + context 之前是 v0.2 加的核心层但没测，是 v0.4 必须堵的债

# 5. 影响

### 正面
- types 单文件 ≤ 200 行（lines_of_code 分散 + 主题内聚）
- logger 接入 OpenTelemetry / Vector / Loki 等结构化日志管道
- core 业务层 100% 单元测试覆盖（v0.2 抽 core 时欠的债还清）

### 负面
- `src/types/` 14 文件替代 1 文件（IDE 文件树变深）
- `import type` 必须正确使用（避免运行时循环）
- logger json 模式下人类阅读体验下降（但保留 text 默认）

### 后续行动
- [x] 写 ADR-0005 草稿
- [x] 用户确认方案 A + 双格式
- [ ] 拆 types → 14 文件 + barrel
- [ ] logger 加 format 选项 + env var 支持
- [ ] 写 core/diagnose.test.ts
- [ ] 写 core/context.test.ts
- [ ] 跑 bun test + tsc
- [ ] 端到端 diagnose / fix 验证
- [ ] 更新 memory.json 移除 3 项 known_issues
- [ ] commit

# 6. 验证标准

- [ ] `bun test` 增长（预计 258 → 270+ pass）
- [ ] `bunx tsc --noEmit` 0 errors
- [ ] `bun run src/cli/index.ts diagnose --path /workspace` 跑通
- [ ] `bun run src/cli/index.ts fix --help` 正常
- [ ] `QA_AGENT_LOG_FORMAT=json bun run src/cli/index.ts diagnose` 输出 JSON Lines
- [ ] 30+ `from '../types'` 的 import 路径**零修改**
- [ ] `grep "^export interface\|^export type" src/types/` ≥ 56（不变）

# 附：变更历史

| 日期 | 变更 | 触发者 |
|---|---|---|
| 2026-06-04 | 初稿 | AI review（基于 v0.3.1 known_issues 修复） |
