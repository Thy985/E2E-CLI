---
id: 0002
title: "v0.2 重构：uiux 改名 + 抽 core/ 消除 web/cli 业务重复"
status: accepted
date: 2026-06-04
supersedes: null
superseded_by: null
related: ["0001"]
tags: [refactor, naming, dedup]
---

# 1. 背景

ADR-0001 列出 4 项 v0.2 TODO，探测后发现：
- ✅ `engines/audit/` vs `skills/builtin/` 职责重叠 **是误判**——前者是 audit 领域内细粒度 checker，不与 skills 冲突，**从 known_issues 移除**
- 🔧 uiux → ui-ux 改名仍然必要（9 个 import 路径，CLI 命令名是 `ux-audit`）
- 🔧 web/api 业务重复仍然严重：
  - `web/api/diagnose.ts` 和 `web/api/fix.ts` 内部都重复实现 `getProjectInfo()`
  - `web/api/diagnose.ts` 业务逻辑（注册 skill、init context、run registry）和 `cli/commands/diagnose.ts` 高度相似
  - 同理 fix

# 2. 备选方案

### 方案 A：只做改名
- 优点：零风险 10 分钟
- 缺点：核心重复不解决

### 方案 B：抽 `src/core/` 业务层
- 新建 `src/core/{project-info,diagnose,fix,apply-fix}.ts`
- web/api 留 HTTP 包装（解 body、调 core、返 JSON）
- cli/commands 留 CLI 包装（解 args、调 core、format 输出）
- 优点：消除重复，单一业务真相
- 缺点：动 4-6 个文件，需要 2-3 小时

### 方案 C：让 web/api 调 CLI（spawn 子进程）
- 优点：物理消除 web/cli 两套
- 缺点：性能差（每次 HTTP 请求启进程）、错误码不友好、调试困难

# 3. 决定

采用 **方案 A + B 一起**（用户已选）：
1. `src/skills/builtin/uiux/` → `src/skills/builtin/ui-ux/`（9 个 import 改）
2. 抽 `src/core/`：
   - `core/project-info.ts` — `getProjectInfo()` 统一
   - `core/diagnose.ts` — `runDiagnosis({ projectPath, skills })` 统一
   - `core/fix.ts` — `previewFixes({ issues, projectPath })` + `applyFixes({ fixes, projectPath })` 统一
3. `web/api/diagnose.ts` + `fix.ts` 改 thin wrap（只剩 Hono handler 逻辑）
4. `cli/commands/diagnose.ts` + `fix.ts` 改 thin wrap（只剩 commander action 逻辑）

# 4. 原因

- **单一真相**：业务逻辑只在一处实现
- **可测试**：core/ 是纯函数 + DI 注入，单元测试可全覆盖
- **演进空间**：未来加 SDK / MCP server 直接复用 core/

# 5. 影响

### 正面
- 消除 2 处 `getProjectInfo` 重复 + web/cli 各 50 行业务重复
- 业务逻辑可单测
- uiux → ui-ux 改名对齐 CLI 命令名

### 负面
- 多 1 层目录（`src/core/`），对新人需要 1 句解释
- 4-6 个文件改动 + 测试需要更新

### 后续行动
- [ ] src/core/ 抽 3 个文件
- [ ] web/api/ 改 thin wrap（4 个文件去掉 80% 业务）
- [ ] cli/commands/ 改 thin wrap（2 个文件）
- [ ] 加 `tests/unit/core/` 测试
- [ ] 更新 memory.json 标记 v0.2 完成

# 6. 验证标准

- [ ] `bun test` ≥ 237 pass
- [ ] `bunx tsc --noEmit` 0 errors
- [ ] `grep -r "skills/builtin/uiux" src/ docs/` 0 命中
- [ ] `qa-agent diagnose` 端到端跑通，行为不变
- [ ] `qa-agent fix --preview` 端到端跑通
- [ ] `curl -X POST http://localhost:3000/api/diagnose` 返回相同 JSON 结构

# 附：变更历史

| 日期 | 变更 | 触发者 |
|---|---|---|
| 2026-06-04 | 初稿 | AI review（基于 ADR-0001 v0.2 TODO） |
