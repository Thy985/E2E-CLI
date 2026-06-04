---
id: 0004
title: "v0.3.1 修复 insert 空文件 trailing newline bug + runSingleFix stub 真正实现"
status: accepted
date: 2026-06-04
supersedes: null
superseded_by: null
related: ["0002", "0003"]
tags: [bugfix, cli, testability, refactor]
---

# 1. 背景

v0.2 / v0.3 之后仍剩两个 CLI 行为缺陷和一项测试债，来自 [memory.json v0.3 known_issues](../../memory.json)：

1. **`core/applyFixes` insert 空文件多空行**
   - `applyOneFix` 的 `'insert'` case 用 `lines = fileContent.split('\n')`，空文件 `''` 拆成 `['']`
   - 插入 `'first line'` 后 `lines = ['first line', '']`，`join('\n')` 得到 `'first line\n'`（多一个换行）
   - 同样 bug 也存在于 `engines/fix/enhanced.insertInFile`
   - 影响所有"创建新文件"的 fix（autofix 报告路径、e2e test 生成的脚手架等）
2. **`cli/commands/fix.ts runSingleFix` 是 stub**
   - 之前只 `logger.info("Would fix: ${issue.title}")`，不真正调用任何 fix
   - 构造了 `new FixEngine({...})` 但**完全没用** — 实际是"看一眼就退出"
3. **测试债**：`tests/unit/core/fix.test.ts` 用 `.trim()` 绕过 bug，掩盖了真实行为

# 2. 备选方案

### 方案 A：核心改 `if isNewFile` 兜底 + 抽 `executeSingleFix`（采用）

- `core/fix.ts` insert case 加 `isNewFile` 标志，空文件 join 后 strip 恰好一个 trailing `\n`
- `engines/fix/enhanced.ts` `insertInFile` 同样修复（用 `existing === ''` 判空）
- 抽出 `executeSingleFix(issue, options, config, logger, built)` 单独 export
  - `runSingleFix` 退化为 commander 集成层（找 issue + build context + cleanup）
  - 新函数纯 IO 编排，可测试不污染全局
- 加 4 项单测：
  - `core/fix.test.ts`：「insert 空文件无 trailing newline」+「content 自带 \n 时保留」
  - `fix-engine.test.ts`：「enhanced insertInFile 空文件无 trailing newline」
  - `cli/fix-command.test.ts`（新）：「端到端 low-risk insert」、「dry-run 不写盘」、「空 fix 列表提前 return」、「无 fix handler 走 process.exit(1)」

### 方案 B：统一改用 sed/awk 库

- 引入 `string-replace-async` 或类似库替换 split/join 路径
- 优点：少写代码
- 缺点：依赖 +1、不解决 stub 问题

### 方案 C：放弃 stub repair，直接删 `--issue` 选项

- 把 `--issue` 从 commander 移除
- 优点：消除"看似能用实际不行"的误导
- 缺点：失去单点修复能力

# 3. 决定

采用 **方案 A**：

1. **修复 `core/fix.ts` insert 空文件 trailing newline bug**
2. **修复 `engines/fix/enhanced.ts` insertInFile 同样 bug**（行为完全一致）
3. **`runSingleFix` 拆为 commander 集成层 + 纯函数 `executeSingleFix`**
   - `executeSingleFix` 处理：拿 skill → `skill.fix(issue, ctx)` → 构造 `FixEngine` → `applyFix`（或 `previewFix` for dry-run）
   - 保留 rollback / verify / sandbox 选项的 CLI 映射
4. **加 4 项单测**（3 项覆盖 fix 路径，1 项覆盖 runSingleFix 集成）

**关键事实**：
- 修复仅在 `isNewFile`（或 `existing === ''`）时 strip 恰好一个 `\n`
- 非空文件 trailing `\n` 来自 split 副产物但代表**真实**的换行字符（`split('a\n')` → `['a', '']`，join → `'a\n'`）— 必须保留
- `executeSingleFix` 接受注入的 `built`（context + registry + logger），避免在测试里调 `buildSkillContext` 触发 model/storage 真实 IO

# 4. 原因

- **bug 修 2 处一致**：`core/applyFixes` 和 `engines/fix/enhanced.insertInFile` 行为必须完全一致，否则同一种 fix 在 CLI vs batch 下结果不同
- **抽函数而非 mock commander**：`runSingleFix` 内的 commander 集成层只有 10 行，难测但不重要；真正易出 bug 的"拿 skill → 调 fix → 调 FixEngine"逻辑才需要测试
- **加 trailing-newline 测试**：回归守护 — `''` split 行为在 bun 升级后可能变

# 5. 影响

### 正面
- `--issue <id>` 真正能修单条 issue（之前是空操作）
- 创建新文件的 fix 行为符合直觉（`content` 不再被偷偷加 `\n`）
- `executeSingleFix` 可独立单测（不依赖 model / storage 真实 IO）
- 4 项新测试覆盖了 v0.3 known_issues 中 2 项 + 新增 1 个集成测试

### 负面
- `cli/commands/fix.ts` 多 export 一个函数（API surface +1，**但只供测试**）
- 删除了 `tests/unit/core/fix.test.ts` 中用 `.trim()` 绕过的旧断言（严格匹配才是真相）

### 后续行动
- [x] 修 `core/fix.ts` insert bug
- [x] 修 `engines/fix/enhanced.ts` insertInFile bug
- [x] 抽 `executeSingleFix` 并实现
- [x] 加 4 项单测
- [x] `bun test` ≥ 258 pass
- [x] `bunx tsc --noEmit` 0 errors
- [x] `diagnose` 端到端跑通
- [x] `fix --help` 正常
- [x] 更新 `memory.json` 移除 2 项 known_issues

# 6. 验证标准

- [x] `bun test` 258 pass / 0 fail
- [x] `bunx tsc --noEmit` 0 errors
- [x] `bun run src/cli/index.ts diagnose --path /workspace` 跑通
- [x] `bun run src/cli/index.ts fix --help` 输出正常选项
- [x] `tests/unit/cli/fix-command.test.ts` 5 个测试全过
- [x] `tests/unit/core/fix.test.ts` 8 个测试（+2）全过
- [x] `tests/unit/fix-engine.test.ts` 4 个测试（+1）全过

# 附：变更历史

| 日期 | 变更 | 触发者 |
|---|---|---|
| 2026-06-04 | 初稿 | AI review（基于 v0.3 known_issues 修复） |
