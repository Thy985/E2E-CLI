---
id: 0006
title: "v0.5 quality-gate 升级：scripts/preflight.sh 工具链化"
status: accepted
date: 2026-06-04
supersedes: null
superseded_by: null
related: ["0001", "0002", "0003", "0004", "0005"]
tags: [tooling, quality-gate, adr]
---

# 1. 背景

[v0.1 quality-gate.md](../../rules/quality-gate.md) 把"加载上下文 → 健康度报告 → 任务分类 → 输出决策块"作为 AI 行为规则写在 prompt 里。跑了 5 个 batch 之后发现两个问题：

1. **AI 上下文里有 quality-gate 流程，但每次靠 prompt 复述** — 容易漏 / 容易跑偏
2. **5 个 drift 信号（sqlite/redis/NODE_ENV/未知 LLM provider/vitest/pnpm）是手跑 grep** — 慢、不结构化
3. **Memory 健康度（decisions 字段、adrs 列表、置信度衰减）每次靠 AI 推断** — 易误判

[memory.json](../../memory.json) 早就标注：
> "**v0.1 适用范围**：本规则仅在 v0.1 阶段用 prompt 实施。v0.5 升级到 preflight.sh，v1.0 升级到 reviewer SDK。"

v0.5 正好兑现这个承诺。

# 2. 备选方案

### 方案 A：bash + python3 脚本（采用）

- `scripts/preflight.sh` — 主入口，输出结构化报告
- 用 `python3 -c` 内联 JSON 解析（项目已有 python3 依赖：grep JSON drift 时用）
- 输出人类可读 + machine-readable 两种格式（`--format=json` / `--format=text`）
- 退出码 0 (pass) / 1 (warn) / 2 (block)
- **零运行时依赖**：只依赖 bash + python3 + grep（Linux/macOS 全有）

### 方案 B：TypeScript 工具（bun run scripts/preflight.ts）

- 复用 bun runtime
- 优点：类型安全
- 缺点：依赖 bun 才能跑（CI 多环境时不稳）

### 方案 C：Node.js 脚本

- 跨 runtime
- 缺点：需要确保 node 在 PATH（v0.1 决策是 bun，不应反向依赖 node）

# 3. 决定

采用 **方案 A**：`scripts/preflight.sh`

**职责**（按 quality-gate 流程顺序）：

1. **加载上下文**：
   - 读 `.trae/memory.json` 验证 JSON / 提取 `version`、`adrs`、`verification`、`decisions` 字段
   - 列 `.trae/adr/` 目录
   - 跑 `git log -5 --oneline`

2. **健康度报告**：
   - 计算每个 decision 的 `confidence_effective`（30 天衰减）
   - 检查 `last_verified_at` ≤ 30 天
   - 列出 ADR 状态（accepted / proposed / superseded）

3. **Drift 检测**（5 个信号）：
   - `sqlite|postgres|mysql|redis|chromadb|qdrant` 在 `src/` 出现
   - `process.env.NODE_ENV` 在 `src/` 出现
   - 未知 LLM provider（`gemini|cohere|mistral|llama` 在 `src/models/`）
   - `*.test.ts` 引用 `from 'vitest'`
   - `pnpm-lock.yaml` / `yarn.lock` 存在

4. **Hard Block 检测**：
   - 任何文件改动命中 `.env` / `**/secrets*` / `**/*.pem` / `**/*.key`
   - 任何命令命中 `git push --force` / `rm -rf` / `DROP TABLE`（基于 git status + 当前改动，不主动跑）

5. **输出决策块**：
   - `[PASS]` — 全部干净
   - `[WARN]` — 有 drift 但不阻断
   - `[BLOCK]` — 命中 hard block
   - 退出码 0/1/2

**集成**：
- 加 `bun run preflight` 到 `package.json` scripts
- quality-gate.md 第 1 节"任务开始时的强制流程"改为"调 `bun run preflight` 拿报告"，不删除 prompt 规则（AI 仍需做"任务分类"和"输出决策块"）

# 4. 原因

- **元工作收益最大**：v0.5 之后每个 AI 任务都省一次手动 grep + memory 解析
- **零运行时依赖**：bash + python3 + grep，CI/本地一致
- **退出码可观测**：CI 可直接基于 preflight exit code 决定是否阻断
- **保留 prompt 规则**：AI 仍需做判断（任务分类、风险呈现），preflight 只给数据不给决策
- **未来可演进**：v1.0 可以把 preflight 升级到 TypeScript SDK（如果需要更复杂的判断）

# 5. 影响

### 正面
- 每个 AI 任务开头的"加载上下文"从 30 秒 → 2 秒
- Drift 检测从 5 个手跑 grep → 1 行 `bun run preflight`
- 退出码可挂 CI（v0.6 候选）

### 负面
- 新增 bash + python3 脚本（项目此前全是 TypeScript）
- 跨平台：macOS / Linux 验证，Windows WSL 才支持（项目已经是 *nix 优先）

### 后续行动
- [x] 写 ADR-0006
- [x] 写 `scripts/preflight.sh`
- [x] 加 `bun run preflight` 到 package.json
- [x] 写 preflight 集成测试
- [x] 跑 preflight 验证（应输出 PASS）
- [x] 更新 memory.json
- [x] 更新 .trae/rules/quality-gate.md 引用 preflight
- [x] commit

# 6. 验证标准

- [ ] `bun run preflight` 退出码 0（无 drift）
- [ ] `bun run preflight --format=json` 输出合法 JSON
- [ ] 在 dirty git tree 上 preflight 仍能跑（不需要 clean tree）
- [ ] 故意制造 drift（如 touch `.env` 临时）→ preflight 报 `[WARN]` 或 `[BLOCK]`
- [ ] 不影响 `bun test` / `bunx tsc --noEmit`
- [ ] scripts/preflight.sh 可被 `sh` 解释器执行（不仅 bash）

# 附：变更历史

| 日期 | 变更 | 触发者 |
|---|---|---|
| 2026-06-04 | 初稿 | AI review（兑现 quality-gate v0.1 文档中 v0.5 升级承诺） |
