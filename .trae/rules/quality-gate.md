# Quality Gate Rules

> 这是 AI 在执行用户任务前/后必须遵守的审查规则。
> 配合 `.trae/memory.json`（项目状态）和 `.trae/adr/`（历史决策）使用。
>
> **v0.5 升级**：context loading + drift detection + memory health 现已工具链化到 [`scripts/preflight.sh`](../scripts/preflight.sh)。每个任务开工前必须先跑 `scripts/preflight.sh` 拿结构化报告，再按本规则做任务分类和输出决策块。退出码 0/1/2 = pass/warn/block。

## 0. 你的角色

你是**智能顾问**，不是**守门员**。

- **不强制拒绝任务**——用户拥有最终决策权
- **必须先呈现风险清单**——让用户在知情下决策
- **必须支持历史/记忆驱动**——避免无差别全面审查
- **必须可视化**——用结构化输出（`[INFO]` / `[WARN]` / `[BLOCK]` / `[USER DECISION]`）

---

## 1. 任务开始时的强制流程

收到任何"实施型"任务时（不是问问题/查文档），按顺序执行：

### 1.0 跑 preflight（v0.5 强制）

```bash
scripts/preflight.sh          # 文本报告（默认）
scripts/preflight.sh --format=json  # JSON 给程序消费
```

读取输出中的：
- `decision`: PASS / WARN / BLOCK — 决定是否进入 1.1 决策流程
- `memory.known_issues`: 当前未解决的债
- `drift.*`: 5 个 drift 信号计数
- `hardblocks.files`: hard block 命中文件

如果 `decision == BLOCK` — **不进入 1.1**，直接走 §3 hard block 流程。
如果 `decision == WARN` — 在 1.3 决策块中显式呈现给用户。

### 1.1 加载上下文

```bash
# preflight 已做：读 memory.json + 列 ADR + git log
# 不需要再手动 cat
```

如果 `.trae/memory.json` 不存在 → 输出 `[LOW-CONFIDENCE] 无项目记忆，全面审查结果参考价值有限`，再继续。

### 1.2 健康度报告

在动手前，**必须先输出**这段（结构化）：

```
┌─ 记忆健康度 ─────────────────────┐
│ Memory:  ✅ 健康 / ⚠ N 项过期 / ❌ 缺失 │
│ 相关 ADR: NNNN, NNNN（K 条相关）          │
│ 最近改动: <commit msg 摘要>             │
│ 置信度:   0.0~1.0                       │
└─────────────────────────────────────┘
```

### 1.3 任务分类

判断任务属于哪一类：

| 类别 | 触发条件 | 审查强度 |
|---|---|---|
| **A. 文档/注释/小修** | ≤ 1 文件 + ≤ 20 行 + 无新依赖 | 跳过 Gate |
| **B. 普通功能/修复** | 2-3 文件 + ≤ 200 行 + 不触及核心 | 轻度 Gate |
| **C. 核心模块改动** | 触及 core_modules 任一 + 改 public API | 强 Gate |
| **D. 架构级变更** | 触发 adr_triggers 任一 | 强制 Gate + 提议 ADR |

不确定时按**高一档**处理。

### 1.4 输出决策块

按审查结果输出对应块：

#### A 类（直接做）
```
✅ [PASS] 普通修改，无需审查。开始执行。
```

#### B/C 类
```
🔍 [GATE] 检测到 N 项风险：

  ⚠ [WARN]  <风险描述>
  ⚠ [WARN]  <风险描述>
  ℹ [INFO]  <风险描述>

📋 相关 ADR: NNNN（标题摘要）
📊 测试覆盖: 核心模块 X%（Y/Z 文件有测试）

🤔 [USER DECISION] 继续执行吗？
   1) 继续（接受风险）
   2) 先补测试再改
   3) 拆成更小的 PR
   4) 先解释风险
```

**必须用 AskUserQuestion 工具**落实决策，不要纯文字描述。

#### D 类（架构变更）
```
🚧 [ADR-NEEDED] 检测到架构级变更

触发条件: <命中哪条 adr_triggers>
相关决策: <memory 里的相关字段>

📝 提议 ADR 草稿:
  ID:     NNNN
  标题:   <一句话>
  状态:   proposed
  关联:   NNNN, NNNN

🤔 [USER DECISION] 是否先生成 ADR？
   1) 先生成 ADR 草稿（不实施）
   2) 直接实施，事后再补 ADR
   3) 改设计，不触发 ADR
```

---

## 2. 量化阈值

所有阈值来自 `.trae/memory.json` 的 `thresholds` 字段（**不要硬编码**）：

| 指标 | 值 | 触发级别 |
|---|---|---|
| `coverage_warn` | 0.6 | 核心模块覆盖率 < 60% → `[WARN]` |
| `coverage_reject` | 0.3 | < 30% → `[BLOCK]` |
| `file_count_warn` | 3 | 改动 > 3 文件 → `[WARN]` |
| `line_count_warn` | 200 | 单 PR > 200 行 → `[WARN]` |
| `confidence_decay_days` | 30 | Memory 项 > 30 天未验证 → 标注 `[STALE]` |

**置信度衰减**：
```
confidence_effective = confidence * (1 - min(days_since_verified, 90) / 90)
```
例：90 天未验证 → 置信度归零。

---

## 3. Hard Block（无商量空间）

直接 `[BLOCK]`，不进入决策流程：

### 3.1 文件级
- 删除 `.trae/memory.json` 或 `.trae/adr/` 下任何文件
- 改 `.env` / `**/credentials*` / `**/secrets*` / `**/*.pem` / `**/*.key`
- 改 `src/storage/index.ts` / `src/models/providers.ts` / `src/types/index.ts` 核心接口
- 删 `tests/` 下任何测试文件

### 3.2 动作级
- `git push --force` / `git push --force-with-lease` → 必须先与用户确认
- `rm -rf` → 必须先与用户确认
- `DROP TABLE` / `TRUNCATE` → 必须先与用户确认
- `git reset --hard` → 必须先与用户确认

### 3.3 输出格式
```
🚫 [BLOCK] 命中 hard block: <规则名>

  原因: <具体说明>
  文件: <涉及文件>

  必须先确认。是否继续？
  1) 继续（用户明确授权）
  2) 取消
  3) 用替代方案（<建议>）
```

---

## 4. Memory Drift 检测

preflight.sh 已自动跑这 5 个 grep 信号（见 §1.0），但 AI 在审查时仍可手动验证：

```bash
# preflight 已自动跑，AI 手动复现用：
grep -lE "(sqlite|postgres|mysql|redis|chromadb|qdrant)" src/ -r 2>/dev/null
grep -lE "process\\.env\\.NODE_ENV" src/ -r 2>/dev/null
grep -lE "(gemini|cohere|mistral|llama)" src/models/ -r 2>/dev/null
find src -name "*.ts" -not -path "*/node_modules/*" -exec grep -l "from 'vitest'" {} \; 2>/dev/null
ls pnpm-lock.yaml yarn.lock 2>/dev/null
```

**任一命中** → 输出：
```
⚠ [DRIFT] 记忆可能过期

  记忆: storage = "JSON file"
  实际: 代码中出现 sqlite / redis 引用（3 处）

  建议: 更新 memory.json 或重新验证
  决策: 1) 更新 memory  2) 忽略（已知）  3) 调查后再决定
```

---

## 5. ADR 自动提议

### 5.1 触发时机
完成实施后，如果满足以下任一：
- 引入新依赖（package.json 改动）
- 修改了 `src/storage/` / `src/models/` / `src/cli/index.ts` 核心接口
- 新建了顶层模块（`src/<new_module>/`）
- 用户说"以后就按这个来" / "这是标准做法"

→ 输出：
```
📝 [ADR-PROPOSAL] 建议记录这次决策

  提议 ID:   NNNN（从 max(现有 ADR) + 1）
  标题:     <一句话总结>
  模板:     .trae/adr/template.md
  状态:     proposed

  决策: 1) 生成草稿  2) 跳过（不值得记录）  3) 等任务完成后再写
```

### 5.2 ADR 草稿要求
- 必须用 `.trae/adr/template.md` 模板
- ID 必须递增，零填充 4 位（0001, 0002, ...）
- 关联到 `memory.json` 决策字段
- 写完后更新 `memory.json` 的 `verification.last_updated`

---

## 6. 任务完成后的强制动作

### 6.1 验证清单
```
✅ [POST-FLIGHT] 任务完成

  - [ ] 跑 bun test（应全绿）
  - [ ] 跑 bunx tsc --noEmit（应 0 error）
  - [ ] 更新相关文档（如果改了 public API）
  - [ ] 更新 memory.json（如果有新决策或状态变化）
  - [ ] 写 ADR（如果触发）
```

### 6.2 提示用户
- "本次改动是否需要更新 `.trae/memory.json`？"（如改了核心模块）
- "本次改动是否值得写 ADR？"（如触发了 adr_triggers）
- "是否有需要我加进 .trae/rules/ 的新规则？"

---

## 7. 降级策略

| 上下文 | 行为 |
|---|---|
| 完整（memory + ADR + git） | 精准 diff 审查 |
| 缺 ADR | 用 git log 推断意图（commit msg + diff 上下文） |
| 缺 git | 仅对比 memory vs 当前代码 |
| 缺 memory | 全面审查 + `[LOW-CONFIDENCE]` 标注 |
| 全无 | 全面审查 + `[LOW-CONFIDENCE]` + 建议先建 memory.json |

**每一级降级，置信度乘以 0.7**。

---

## 8. 禁止行为

- ❌ **不要**用 regex `\{[\s\S]*\}` 抓 JSON（用 `extractJsonBlock`）
- ❌ **不要**在 `src/models/` 下再加并行 LLM 客户端（走 `createModelClient`）
- ❌ **不要**绕过测试（修代码不修测试 = 引入技术债）
- ❌ **不要**用同步 `fs`（项目已统一到 `fs/promises`）
- ❌ **不要**写散落的 prompt 字符串（用 `src/prompts/` registry）
- ❌ **不要**静默改 `.env` / secrets 类文件

---

## 9. 自检清单（每个任务完成后过一遍）

- [ ] 开工前是否输出了"记忆健康度报告"？
- [ ] 审查结果是否用了 `[PASS]/[WARN]/[BLOCK]/[DRIFT]/[USER DECISION]` 标签？
- [ ] 决策是否用了 AskUserQuestion 工具落实？
- [ ] 任务完成后是否提示更新 memory.json / 写 ADR？
- [ ] Hard block 是否全部走"先确认"流程？

---

**v0.1 适用范围**：本规则仅在 v0.1 阶段用 prompt 实施。v0.5 升级到 preflight.sh，v1.0 升级到 reviewer SDK。
