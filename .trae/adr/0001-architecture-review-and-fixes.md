---
id: 0001
title: "2026-06 架构 review：识别 11 项硬伤 + 启动修复计划"
status: accepted
date: 2026-06-04
supersedes: null
superseded_by: null
related: []
tags: [architecture, tech-debt, refactor]
---

# 1. 背景

QA-Agent v0.1 重构了 LLM harness（`src/models/` 拆分 + `src/prompts/` 抽出 + `createModelClient` 统一）后，整体可读性提升，但**架构 review 暴露 11 项硬伤**：

- 1 个目录重影（`ui-ux/` vs `uiux/`）
- 2 个测试框架残留（vitest 还在跑 6 个 test + 配置文件）
- 1 个废弃包管理器残留（pnpm-lock.yaml）
- 1 个文档与代码不一致（README/CONTRIBUTING 仍说 pnpm）
- 1 个 logger 死代码 + child() 不共享 level
- 2 个职责重叠（`engines/audit/` vs `skills/builtin/` 的 security/dependency）
- 1 个 491 行单文件 types（应拆分）
- 1 个 6 文件 `engines/fix/` 命名混乱
- 1 个 web/api vs cli/commands 业务逻辑复制

不修的后果：新人 onboard 时间翻倍、文档撒谎、测试假绿、生产部署风险高。

# 2. 备选方案

### 方案 A：一次性大重构
把所有问题一并修，2 周内合并。

- **优点**：一步到位
- **缺点**：风险高、diff 巨大、review 困难

### 方案 B：分批小修（采用）
按 ROI 排序，分 3 批：
- **本次（高 ROI、零风险）**：删孤儿目录 + 改 vitest → bun:test + 删 pnpm 残留 + 修文档 + 修 logger
- **v0.2（中 ROI）**：抽 `src/core/` 消除 web/cli 重复 + `engines/fix/` 重新命名
- **v0.3（高难度）**：拆 `types/index.ts` + 划清 engines vs skills 边界 + 引入结构化日志

- **优点**：每批可独立验证
- **缺点**：拖得久

### 方案 C：写而不修
只写 ADR 不动代码。

- **优点**：零风险
- **缺点**：技术债继续累积

# 3. 决定

采用 **方案 B**，本次执行第一批 5 项修复。

# 4. 原因

- 5 项修复都是**机械操作**（改名/删文件/换 import），不涉及业务逻辑
- 每项可独立 `bun test` 验证
- 剩余 6 项写进 ADR 作为 TODO，避免"承诺过度"

# 5. 影响

### 正面
- 删 1 个孤儿目录 → 减少新人困惑
- 6 个 test 文件改 `bun:test` → 统一测试栈
- 删 `vitest.config.ts` + `pnpm-lock.yaml` → 消除与 bun 决策的冲突
- 修 README/CONTRIBUTING → 文档可信
- 修 logger → child 行为正确

### 负面
- `ui-ux/` 目录删除不可逆（git 可恢复，但要先确认无外部依赖）
- 文档更新会触发 4 个 README/CONTRIBUTING 引用更新

### 后续行动（v0.2+ TODO）
- [ ] 抽 `src/core/diagnose.ts` + `src/core/fix.ts` 消除 web/api 与 cli/commands 业务逻辑重复
- [ ] `engines/fix/` 重命名或合并（建议：保留 `index.ts`、`enhanced.ts`、`rollback.ts`，删 `simple-fix.ts` 和 `debug.ts`）
- [ ] 拆 `src/types/index.ts` 为 `types/{skill,diagnosis,fix,storage,model,cli,audit}.ts`
- [ ] 划清 `engines/audit/` 与 `skills/builtin/` 边界（建议：engines 只做 orchestration，checker 全部下沉到 skill）
- [ ] logger 引入结构化 JSON 输出（pino 或自写）

# 6. 验证标准

- [ ] `bun test` 通过 236/236
- [ ] `bunx tsc --noEmit` 0 errors
- [ ] 仓库根无 `vitest.config.ts` / `pnpm-lock.yaml` / `ui-ux/` 孤儿目录
- [ ] `grep -r "from 'vitest'" tests/` 0 命中
- [ ] `grep -r "pnpm" README.md CONTRIBUTING.md` 0 命中（除历史说明）
- [ ] `memory.json` 更新 `verification.last_updated` 并标记本次 ADR 编号

# 附：变更历史

| 日期 | 变更 | 触发者 |
|---|---|---|
| 2026-06-04 | 初稿 | AI review（基于 quality-gate.md） |
