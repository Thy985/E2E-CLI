---
id: 0003
title: "v0.3 清理：engines/fix 同名冲突修复 + 删孤儿文件"
status: accepted
date: 2026-06-04
supersedes: null
superseded_by: null
related: ["0001", "0002"]
tags: [refactor, dedup, naming]
---

# 1. 背景

v0.2 抽 `src/core/applyFixes` 后，`engines/fix/` 出现严重设计错误：

- **同名 FixEngine 冲突**：
  - `engines/fix/index.ts` 的 FixEngine（旧，基于 SandboxManager）— 250 行，有 `assessRisk`/`previewFix`(sandbox)/`applyFix`(本地)/`verifyFix`(sandbox)/`createRollbackPoint`(文件 copy)
  - `engines/fix/enhanced.ts` 的 FixEngine（新，基于 RollbackManager + VerifyEngine）— 250 行，有 `applyFix`(含 rollback+verify)/`applyFixes`/`rollback`/`previewFix`(markdown)
  - **cli 用 index 版本，batch + test 用 enhanced 版本**—— broken
- **孤儿类**：
  - `SimpleFixEngine`（simple-fix.ts）— 无外部 import
  - `DebugFixEngine`（debug.ts）— 无外部 import
  - 这两个类的 `applyFix` 跟 `core/applyFixes` 高度重叠

# 2. 备选方案

### 方案 A：删孤儿 + index.ts 改 barrel（采用）
- `engines/fix/index.ts` 改成 re-export `engines/fix/enhanced` 的 FixEngine
- 删 `simple-fix.ts` / `debug.ts`
- 所有 import 路径不变，**全部拿到 enhanced 的 FixEngine**（含 rollback + verify）
- 优点：零破坏，零测试改动，10 分钟
- 缺点：index.ts 的旧 FixEngine 实现完全丢失（但实际无人用）

### 方案 B：合并 index + enhanced
- 把 enhanced 的逻辑搬到 index.ts
- 删 enhanced.ts
- 改 batch.ts + test.ts 的 import 路径
- 优点：文件数 -1
- 缺点：2-3 小时，需要小心处理 2 套 applyFix 签名差异

### 方案 C：保留 6 文件，给同名 class 加 alias
- 给 index 的 FixEngine 改名 `SandboxFixEngine`
- enhanced 的保留 `FixEngine`
- 优点：保留所有功能
- 缺点：cli 改 import，**不解决"cli 实际跑不通"的问题**（cli 的 runSingleFix 是 stub）

# 3. 决定

采用 **方案 A**：
1. `engines/fix/index.ts` 改成 barrel re-export `enhanced` 的 FixEngine
2. 删 `simple-fix.ts` / `debug.ts`
3. 更新 `docs/ARCHITECTURE.md`（删除 SimpleFixEngine/DebugFixEngine 描述）
4. cli / batch / test 的 import 路径**零改动**

**关键事实**：
- cli 的 `runSingleFix()` 实际只 `logger.info("Would fix: ${issue.title}")`，**未真正调用 FixEngine 的方法**——所以 index 旧版 vs enhanced 新版的 applyFix 行为差异在 cli 路径上**无影响**
- batch / test 实际用的就是 enhanced 版本，**行为不变**
- `core/applyFixes` 接管了所有纯 IO 路径，engines/fix 现在专做"含 rollback + verify + 沙箱"的复杂流程

# 4. 原因

- **零破坏**：6 个 import 路径全部不变，只是 import 解析的"同名校验"被消除
- **小代价**：index.ts 的旧 FixEngine（sandbox-based）的 250 行代码**实际从未被调用**——删除无功能损失
- **可演进**：未来需要 sandbox-based 能力时，可以从 git history 拉回，或基于 enhanced 实现

# 5. 影响

### 正面
- 修复同名 class 冲突（cli vs batch 行为一致）
- 删 2 个孤儿文件（-190 行死代码）
- ARCHITECTURE.md 与代码一致

### 负面
- index.ts 旧版 FixEngine 的 sandbox-based 能力**不保留**（git 可恢复）
- simple-fix / debug 的具体 apply 逻辑丢失

### 后续行动
- [ ] 重写 `engines/fix/index.ts` 为 barrel
- [ ] 删 `simple-fix.ts` / `debug.ts`
- [ ] 更新 `docs/ARCHITECTURE.md`
- [ ] 验证 `bun test` + `tsc` 通过
- [ ] 更新 `memory.json` 记录

# 6. 验证标准

- [ ] `bun test` ≥ 250 pass
- [ ] `bunx tsc --noEmit` 0 errors
- [ ] `grep -r "class FixEngine" src/engines/fix/` 1 个命中（只在 enhanced.ts）
- [ ] `grep -r "SimpleFixEngine\|DebugFixEngine" src/ tests/ docs/` 0 命中
- [ ] cli fix --help / --batch 端到端跑通
- [ ] 修复引擎 unit test 仍通过

# 附：变更历史

| 日期 | 变更 | 触发者 |
|---|---|---|
| 2026-06-04 | 初稿 | AI review（基于 v0.2 后质量复核） |
