---
id: 0007
title: "v0.6 CLI 架构重构：gui 拆子命令 + 业务推到 core/ + 退出码集中"
status: proposed
date: 2026-06-04
supersedes: null
superseded_by: null
related: ["0002", "0006"]
tags: [refactor, cli, architecture, quality-gate]
---

# 1. 背景

v0.5 完工后做了一次严苛 review（preflight exit 0 PASS，但实际内部 7 项债）。其中 3 项是 CLI 架构问题：

1. **cli/commands/ 比 core/ 重 6.5 倍**（3,070 行 vs 474 行），与 v0.2 ADR-0002 目标（CLI 应该是 core 的 thin wrap）完全倒挂
2. **`gui.ts` 565 行巨型 switch** — 8 个子命令函数（test/visual/act/screenshot/record/play/list/export）全在同一文件
3. **`process.exit` 满天飞** — gui 21 处 / skill 17 处 / design 8 处 / fix 5 处 / diagnose 5 处 / audit 4 处 — 共 60+ 个散落退出点

直接后果：
- merge conflict 高发区（gui.ts 是修改热点）
- 错误码不一致（不同子命令用不同 exit code）
- 业务逻辑难单测（被 process.exit 卡住）
- 退出码 → 错误信息的映射不集中

memory.json 的 `core_modules` 字段也指出 `src/core/` 是受保护层，但**实际受保护层比 unprotected 还薄**。这是 ADR-0002 留下的尾巴（v0.2 抽了 core 但只覆盖了 web/api，CLI 路径没动）。

# 2. 备选方案

### 方案 A：维持现状，只补测试
- 优点：零架构风险
- 缺点：merge conflict + process.exit 散落问题持续
- 成本：1 天写测试，问题原地不动

### 方案 B：拆分 gui.ts + CLI 全面 thin wrap（采用）
- `src/cli/commands/gui/{record,play,visual,act,test,list,export}.ts` — 8 个子命令各 1 文件
- `src/cli/commands/gui.ts` — 只做参数分发 + 委派（目标 < 80 行）
- 业务逻辑（之前散落在 cli/commands/diagnose.ts/fix.ts/skill.ts）推到 `src/core/` 对应文件
- 统一 `src/core/exit.ts` — `ExitCode` 枚举 + `exitWith(code, message)` 唯一出口
- cli/commands/* 全部 0 process.exit（除 `src/cli/index.ts` 顶层入口）
- 优点：消除 60+ 散落退出点 / gui 565 行 → 8 个 < 100 行文件 / 业务可单测
- 缺点：动 12 个 cli/commands/* 文件 + 新增 8 个 gui 子命令文件 + 新增 core/exit.ts
- 成本：2-3 天

### 方案 C：整个 CLI 框架重写（oclif / cleye / citty）
- 优点：插件化、子命令自动
- 缺点：引新依赖、破坏现有 commander 配置、回归成本高
- 成本：1 周 + 引入新依赖

# 3. 决定

采用 **方案 B**：拆分 gui + CLI thin wrap + 退出码集中。

具体子决策：

| 项 | 决策 | 理由 |
|---|---|---|
| 子命令拆分粒度 | 1 文件 1 子命令 | gui.ts 是修改热点，必须物理隔离 |
| 业务下推目标 | `src/core/`（不是新层） | 已有 core/ 抽象，避免再开 `src/services/` |
| 退出码统一 | `src/core/exit.ts` 单例 | core 已有 process 依赖边界，再加 1 个可接受 |
| 错误传递 | Result\<T, ExitCode\>（不用 throw） | 消除 try/catch + process.exit 散布 |
| 保留的 process.exit | 仅 `src/cli/index.ts` 顶层 1 处 | "唯一退出点"原则 |
| cli/commands 目标行数 | 每个文件 < 200 行 | 当前 4 个 > 200 行的全拆 |

**不做的事**（避免范围蔓延）：
- ❌ 不引新 CLI 框架（保留 commander）
- ❌ 不重命名命令（`qa-agent diagnose` 仍叫 diagnose）
- ❌ 不动 web/api（v0.2 已 thin wrap 过了）
- ❌ 不重写 `core/*`（474 行没问题）

# 4. 原因

- **方案 A 治标不治本**：gui 565 行就算加了测试也难维护
- **方案 C 杀鸡用牛刀**：commander 够用，引入新框架是 architectural whiplash
- **方案 B 是 ADR-0002 真正的收尾**：v0.2 当时只覆盖了 web/api 的 dedup，CLI 路径遗忘，本次补完
- **60+ 退出点是技术债的硬指标**：散落 process.exit 意味着错误码语义无中心定义，是 v0.7 必踩坑
- **退出码集中的 ROI 最高**：1 个 `core/exit.ts` 就能消灭 60 个散布点，杠杆率 60:1

# 5. 影响

### 正面
- cli/commands/ 3070 行 → 目标 < 2000 行（拆 gui + 业务下推）
- gui.ts 565 行 → 8 个 < 100 行文件 + 1 个 80 行 dispatcher
- process.exit 从 60+ 处 → 1 处（仅 cli/index.ts 顶层）
- 业务代码可单测（core/* 路径全部 pure function）
- 错误码集中管理（`core/exit.ts` 枚举）

### 负面
- CLI 路径下业务逻辑调用链变长（cli → core → engines/skills），新人需理解 1 跳
- v0.6 期间 cli/commands/* 频繁 rebase（建议 feature branch + 小步合）
- core/exit.ts 增加 process 依赖边界（core/ 之前尽量 pure，引入此文件是 trade-off）

### 后续行动
- [ ] ADR-0007 状态 proposed → accepted（等你 review）
- [ ] 新建 `src/core/exit.ts`：`ExitCode` 枚举 + `exitWith()` 唯一出口
- [ ] `src/cli/commands/gui.ts` 拆为 `gui/{record,play,visual,act,test,list,export}.ts`
- [ ] `cli/commands/diagnose.ts` / `fix.ts` / `skill.ts` 业务下推 core/
- [ ] `cli/commands/audit.ts` 拆 488 行（按子命令类型分文件）
- [ ] `cli/commands/{seo,best-practices,ux-audit,ci,init,web,design,dependency}.ts` 改 thin wrap
- [ ] 所有 process.exit 替换为 `exitWith()`
- [ ] 加 `tests/unit/core/exit.test.ts`
- [ ] 加 `tests/unit/cli/gui/*.test.ts` 覆盖 8 个子命令
- [ ] 跑 `bun test` + `bunx tsc --noEmit` 全绿
- [ ] 跑 `scripts/preflight.sh` 仍 PASS
- [ ] 更新 memory.json：标记 v0.6 完成 + `coverage_thresholds` 分层（core ≥60% / skills ≥30%）
- [ ] commit + ADR-0007 标 accepted

### 与分层阈值的联动
严苛 review 第二项决策（分层阈值）也纳入 v0.6：
- `memory.json.thresholds` 增加 `core_min_coverage: 0.6` / `skills_min_coverage: 0.3` 两个字段
- `scripts/preflight.sh` 检查时按路径前缀分别计算（vs 当前全项目平均）
- 核心模块 < 60% → `[WARN]`（不 block），skill 模块 < 30% → `[WARN]`
- v0.6 不设 block（避免起步就 block），v0.7 视情况升级

# 6. 验证标准

- [ ] `wc -l src/cli/commands/*.ts` 单文件最大 < 200 行
- [ ] `grep -rn 'process.exit' src/cli/commands/ | wc -l` = 0（除 cli/index.ts）
- [ ] `wc -l src/cli/commands/gui.ts` < 100 行
- [ ] `bun test` ≥ 当前 288 pass（不引入 regression）
- [ ] `bunx tsc --noEmit` 0 errors
- [ ] `scripts/preflight.sh` exit 0
- [ ] `tests/unit/core/exit.test.ts` 覆盖所有 ExitCode
- [ ] 跑 `qa-agent gui record / play / visual / act / test / list / export` 端到端通过
- [ ] 跑 `qa-agent diagnose` / `fix` / `skill` / `audit` 行为不变

# 附：变更历史

| 日期 | 变更 | 触发者 |
|---|---|---|
| 2026-06-04 | 初稿（proposed） | AI review（基于 v0.5 严苛 review [WARN-2/3/5]） |
