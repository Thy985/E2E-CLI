# QA-Agent 产品需求文档 (PRD)

> AI 质量医生 — 能诊断、能开药、能验证疗效

---

## 一、产品概述

### 1.1 产品定位

QA-Agent 是一款 AI 驱动的质量诊断与自愈平台，通过 CLI 原生交互，提供从问题发现、根因定位、自动修复到验证闭环的全流程自动化能力。

**核心价值主张**
- **多维度诊断**：功能、UI/UX、可访问性、性能、安全全覆盖
- **智能根因分析**：不只是发现问题，更定位问题根源
- **自动修复能力**：一键修复低风险问题，人工确认高风险问题
- **验证闭环**：修复后自动回归测试，确保修复有效

### 1.2 解决的痛点

| 痛点 | 传统方案 | QA-Agent 方案 |
|------|---------|--------------|
| E2E测试编写维护成本高 | 手动编写，选择器易失效 | AI自然语言生成，智能选择器自愈 |
| 功能正常但体验差 | 不测UI/UX，用户流失 | UI/UX审查，视觉规范检查 |
| 发现问题修复周期长 | 工具只报告，人工修复 | AI自动修复，沙箱预览确认 |
| 修复后不敢确定 | 缺乏自动化验证 | 修复后自动回归验证 |
| 合规压力大 | WCAG需专业知识 | 自动扫描+自动修复 |

### 1.3 目标用户

| 用户类型 | 核心场景 | 价值 |
|----------|---------|------|
| 前端开发者 | "帮我生成登录流程测试" | 自然语言生成完整测试 |
| QA工程师 | "检查所有按钮可访问性" | 一键扫描，自动修复 |
| 设计师 | "代码是否符合设计稿" | UI/UX审查，像素级对比 |
| 技术负责人 | "上线前质量门禁" | CI/CD集成，质量报告 |
| 小团队 | "没有专业测试人员" | 一站式质量保障 |

### 1.4 产品形态

```
CLI 核心（必需）
    ├── 命令行交互
    ├── 脚本化执行
    └── CI/CD 集成

Desktop App（可选）
    ├── 可视化报告
    ├── 多项目并行
    └── 团队协作

IDE Plugin（可选）
    ├── 实时诊断
    ├── 快速修复
    └── 代码内联提示
```

---

## 二、核心功能

### 2.1 三层能力模型

```
┌─────────────────────────────────────────────────────────┐
│  第一层：发现问题（诊断）                                │
│  ├── E2E测试：自然语言生成，智能选择器自愈              │
│  ├── UI/UX审查：视觉规范、布局对齐、交互体验            │
│  ├── 可访问性：WCAG 2.2 AA/AAA自动扫描                  │
│  ├── 性能诊断：Lighthouse集成，核心Web指标              │
│  └── 安全扫描：依赖漏洞、XSS、敏感信息泄露              │
├─────────────────────────────────────────────────────────┤
│  第二层：定位根因（分析）                                │
│  ├── AI诊断：分析"为什么失败"                           │
│  ├── 影响评估：问题影响范围和严重程度                   │
│  └── 优先级排序：先修关键问题                           │
├─────────────────────────────────────────────────────────┤
│  第三层：自动修复（治愈）⭐核心差异化                    │
│  ├── 代码修复：自动生成修复补丁                         │
│  ├── 沙箱验证：预览修复效果，用户确认后应用             │
│  ├── 回归测试：修复后自动验证                           │
│  └── 一键回滚：修复不满意随时回退                       │
└─────────────────────────────────────────────────────────┘
```

### 2.2 CLI 命令

```bash
# 全面诊断
qa-agent diagnose
qa-agent diagnose --skills=e2e,uiux,a11y,perf

# UI/UX专项审查 ⭐
qa-agent ux-audit
qa-agent ux-audit --url=http://localhost:3000
qa-agent ux-audit --fix --preview

# 设计规范管理 ⭐
qa-agent design sync --figma-token=xxx
qa-agent design validate

# 交互式修复
qa-agent fix
qa-agent fix --auto-approve=low-risk
qa-agent fix --dry-run

# 项目审计
qa-agent audit
qa-agent audit --compliance=WCAG2.2

# 监控模式
qa-agent watch
qa-agent watch --auto-fix=low-risk

# Skills管理
qa-agent skill list
qa-agent skill install @qa-agent/skill-security
```

### 2.3 Skills 功能

#### Skill 1: E2E 测试

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 自然语言生成测试 | 输入需求描述，生成 Playwright 测试脚本 | P0 |
| 智能选择器 | 优先语义选择器，自动回退，支持自愈 | P0 |
| 测试执行 | 本地/云端执行，支持并行 | P0 |
| 失败分析 | 自动定位失败原因，生成修复建议 | P0 |
| 视觉回归 | 截图对比，检测 UI 变化 | P1 |

#### Skill 2: UI/UX 审查 ⭐核心差异化

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 设计令牌提取 | 自动从代码/Figma提取颜色、字体、间距规范 | P0 |
| 视觉规范检查 | 检查颜色、字体、间距、圆角、阴影一致性 | P0 |
| 布局对齐检查 | 检测元素对齐、网格系统、响应式问题 | P0 |
| 交互状态检查 | 检查 hover/active/focus/loading 状态完整性 | P0 |
| AI视觉理解 | 多模态分析截图，识别视觉问题 | P1 |
| 智能修复生成 | 自动生成CSS/样式修复代码 | P0 |
| 沙箱预览 | 修复前可视化对比，用户确认后应用 | P0 |
| 设计工具集成 | Figma/Sketch 双向同步设计规范 | P1 |

**UI/UX审查维度**

```
视觉规范 (Visual)
├── 颜色使用: 是否符合设计令牌
├── 字体规范: 字号、字重、行高
├── 间距系统: 8px网格对齐
├── 圆角规范: 小/中/大圆角使用场景
└── 阴影规范: 层级阴影一致性

布局质量 (Layout)
├── 对齐检查: 元素边缘对齐、网格对齐
├── 响应式: 断点处理、内容适配
├── 留白平衡: 间距一致性、呼吸感
└── 容器约束: 最大宽度、内边距规范

交互体验 (Interaction)
├── 状态完整: hover/active/focus/disabled/loading
├── 过渡动画: 时长、缓动函数
├── 反馈机制: 加载、成功、错误状态
└── 点击区域: 最小44px触摸目标

可用性 (Usability)
├── 对比度: WCAG AA标准 (4.5:1)
├── 可读性: 行长度、段落长度
├── 信息层级: 标题层级、内容分组
└── 认知负荷: 一次展示信息量
```

**修复能力分级**

| 问题类型 | 自动修复 | 人工确认 | 仅建议 |
|----------|---------|---------|--------|
| CSS变量替换 | ✅ | - | - |
| 间距调整 | ✅ | - | - |
| 圆角统一 | ✅ | - | - |
| 颜色规范化 | ✅ | ⚠️ | - |
| 布局对齐 | ⚠️ | ✅ | - |
| 响应式修复 | - | ✅ | - |
| 交互状态生成 | ✅ | ⚠️ | - |
| 视觉层级优化 | - | - | ✅ |

#### Skill 3: 可访问性

| 功能 | 描述 | 优先级 |
|------|------|--------|
| WCAG 规则扫描 | WCAG 2.2 A/AA/AAA 级别检查 | P0 |
| 色彩对比度 | 文本与背景对比度检查 | P0 |
| 键盘导航 | Tab 顺序、焦点管理检查 | P0 |
| 屏幕阅读器 | ARIA 标签、语义结构检查 | P0 |
| 自动修复 | 生成 ARIA/语义修复代码 | P0 |

#### Skill 4: 性能诊断

| 功能 | 描述 | 优先级 |
|------|------|--------|
| Lighthouse 跑分 | 性能、可访问性、最佳实践、SEO | P0 |
| 资源分析 | JS/CSS/图片大小、加载顺序 | P0 |
| 渲染性能 | FCP、LCP、CLS、FID 等核心指标 | P0 |
| 优化建议 | 代码分割、懒加载、压缩建议 | P1 |

#### Skill 5: 安全诊断

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 依赖漏洞 | npm audit / Snyk 集成 | P0 |
| XSS 检测 | 跨站脚本漏洞扫描 | P0 |
| 敏感信息泄露 | API Key、Token、密码检测 | P0 |

---

## 三、竞品对比

| 维度 | QA-Agent | Playwright | Applitools | axe DevTools |
|------|----------|------------|------------|--------------|
| 测试生成 | ✅ AI自然语言 | ❌ 手动编写 | ❌ 录制回放 | ❌ 不适用 |
| 选择器自愈 | ✅ 自动修复 | ❌ 手动维护 | ❌ 不适用 | ❌ 不适用 |
| UI/UX审查 | ✅ 视觉+布局+交互 | ❌ 仅功能 | ✅ 视觉对比 | ❌ 仅A11y |
| 自动修复 | ✅ 一键修复+沙箱 | ❌ 无 | ❌ 无 | ❌ 仅报告 |
| 验证闭环 | ✅ 修复后自动回归 | ❌ 需手动 | ❌ 需手动 | ❌ 需手动 |
| 多维度 | ✅ 功能+UI+A11y+性能+安全 | ❌ 仅功能 | ❌ 仅视觉 | ❌ 仅A11y |

**一句话总结**：QA-Agent 是**唯一能同时诊断功能、UI/UX、可访问性，并自动修复验证的AI质量平台**。

---

## 四、开发路线图

### Phase 1: 基础能力 ✅ 已完成
- [x] CLI 框架搭建（9 个命令）
- [x] 11 个诊断 Skills（a11y, e2e, performance, security, seo, dependency, best-practices, ui-ux, uiux, complexity, api）
- [x] 基础诊断引擎（基于正则）
- [x] 报告生成（text/JSON/HTML）
- [x] 修复引擎（原子回滚、风险评估）
- [x] 沙箱系统（screenshot + visual diff）
- [x] Figma 集成（设计令牌同步、截图对比）
- [x] CI/CD 配置生成（GitHub Actions, GitLab CI, Jenkins）

### Phase 2: AI Harness 工程 ✅ 已完成 (100%)
- [x] Golden Set 基准数据集
  - [x] 类型定义和数据结构
  - [x] A11y Golden Set (10 用例)
  - [x] Security Golden Set (10 用例)
  - [x] Performance Golden Set (10 用例)
- [x] 评估引擎（precision/recall/F1 计算）
  - [x] 回归检测
  - [x] 质量门禁
  - [x] 报告生成
- [x] `qa-agent eval` CLI 命令（--list, --stats, --skill, --difficulty, --threshold, --dashboard-only）
- [x] 验证引擎：
  - [x] Level 0: 格式验证
  - [x] Level 1: 编译验证（tsc 集成）
  - [x] Level 2: 测试验证（多 runner 支持 + 前后对比 + 新增失败检测）
  - [x] Level 3: AST diff 验证（@typescript-eslint/parser + 节点签名对比）
- [x] CI 集成 AI Harness 评估（GitHub Actions + eval:ci 脚本 + 质量门禁）
- [x] 监控面板（F1 趋势图、按 skill 分解、历史对比、Sparkline 迷你图）

### Phase 3: 诊断精度提升
- [x] AST 解析替代正则（Babel/ESLint/TsQuery 集成）
- [x] React 组件级检测（JSX 解析、props 分析）
- [x] Vue 组件级检测（SFC AST 解析、模板检测、Composition API 规则）
- [x] 框架感知诊断（Next.js/Nuxt 路由分析）

### Phase 4: 智能优化
- [x] Prompt 自动调优（基于评估结果优化）
- [x] 模型选择推荐（不同 skill 用不同模型）
- [x] A/B 测试框架（对比 prompt/模型效果）
- [x] 用户反馈回流（accept/reject 信号收集）

### Phase 5: 产品化
- [x] Web Dashboard（可视化报告、交互式修复）
- [x] 配置文件支持（config.yml）
- [x] Watch 监控模式
- [x] 真正的 CI/CD Action（不仅是 YAML 生成）
- [x] 文档与示例
- [x] 性能基准（大项目扫描优化）

### Phase 6: 高级 AI 集成 ✅ 已完成 (100%) — *v3.1*

#### 6.1 LLM 多 Provider 抽象
- [x] `ModelClient` 接口统一（`isMock` / `chat` / `embed`）
- [x] 6 大 provider 工厂（OpenAI / Anthropic / DeepSeek / Zhipu / Moonshot / Ollama）
- [x] `detectProvider()` 启发式自动检测（API key 前缀 + 模型名）
- [x] `getSupportedProviders()` 运行时枚举
- [x] 集成测试 11 pass / 7 skip（`describe.skipIf(!hasAnyApiKey)` 模式，无 key 也能跑 mock）

#### 6.2 E2E Skill 双路径生成
- [x] **真实 LLM 路径** — 通过 `ModelClient.chat()` 调用 API 生成 Playwright
- [x] **Template-based fallback** — 无 API key 时 keyword regex（中英双语）+ Playwright 模板
- [x] `model.isMock` 自动检测路径
- [x] `extractSelectors` regex 增强，支持 `getByRole('button', { name: 'X' })` 的 `name/label/text` 字段
- [x] Unit 测试 29 pass（mock 路径不调 LLM、真实路径正常、关键字提取、selector 解析）

#### 6.3 性能 Skill 评分体系
- [x] `estimatePerformanceScore(diagnoses)` — severity-weighted 0-100 估算
  - critical: -5, warning: -3, info: -1
  - >20 命中: 额外 -10
  - floor: 0
- [x] `performanceGrade(score)` — A/B/C/D/F 分级（90/80/70/50 分档）
- [x] `runLighthouseAudit(url) → null` — v0.3.0 占位（待 Chrome 二进制）
- [x] Unit 测试 17 pass

#### 6.4 跨文件测试隔离修复
- [x] 移除 `feedback-loop.test.ts` 的 `mock.module('fs', ...)` 污染
- [x] 移除 `ab-testing.test.ts` 的 `mock.module('fs', ...)` 污染
- [x] 改用真实 `tmpDir` + `basePath` / `storageDir` 参数化
- [x] 解决 bun:test 共享 module registry 的 cross-suite pollution 问题

---

## 五、成功指标

| 指标 | 目标 | 当前状态 (v3.1) |
|------|------|-----------------|
| 诊断精确率 (Precision) | > 90% | ✅ AST 驱动检测（a11y/security/performance/react/vue/nextjs/nuxt），E2E 评估通过 |
| 诊断召回率 (Recall) | > 85% | ✅ 7 个 Skill × 多规则覆盖，Golden Set 70 用例验证 |
| 低风险问题自动修复率 | > 80% | ✅ AST 修复 + 原子回滚 + 编译验证，支持 15+ 条可修复规则 |
| 修复后回归通过率 | > 95% | ✅ 编译验证 + 测试验证 + AST diff 验证（4 层验证引擎）|
| AI Harness 评估通过率 | ≥ 85% | ✅ 评估引擎 + 质量门禁 + 回归检测 + CI 集成 |
| Golden Set 覆盖率 | ≥ 50 用例 | ✅ 70 用例（a11y/security/performance/react/vue/nextjs/nuxt 各 10）|
| TypeScript 编译 | 零错误 | ✅ tsc --noEmit 通过 |
| Unit 测试 | 全部通过 | ✅ **448 pass / 0 fail / 1084 expect** (20 文件) |
| Integration 测试 | 全部通过 | ⚠️ 119 pass / 7 skip / 2 fail (5 文件，2 个 pre-existing 边界用例) |
| Eval Harness 评分 | ≥ 80% F1 | ✅ **87.1% pass / 89.8% F1** (per-skill F1: a11y 92.9% / security 88.6% / perf 87.7% / react 88.9% / vue 80.0% / nextjs 100% / nuxt 90.6%) |
| Skill 注册一致性 | 全入口统一 | ✅ eval/diagnose/CI 三入口均注册 13 个 Skill |
| CLI 命令 | 完整覆盖 | ✅ 14 个命令（init/diagnose/fix/audit/skill/ci/watch/dashboard/eval 等）|
| LLM Provider 支持 | 多家云端 + 本地 | ✅ OpenAI / Anthropic / DeepSeek / Zhipu / Moonshot / Ollama (6 个) |
| Mock 模式 | 无 key 也能跑 | ✅ `model.isMock` 检测 + 模板 fallback |

---

*文档版本: v3.1 | 最后更新: 2026-06-10*

### v3.1 更新摘要（2026-06-10）
- 新增 Phase 6：高级 AI 集成（LLM 多 Provider、E2E 双路径、性能评分）
- 修复 11 个 unit test 跨文件污染失败（mock.module('fs') → 真实 tmpDir）
- Unit 测试 399 → 448 (+49)，Integration 测试 117 → 119 (+2)
- 全部 7 个 Skill 评估 F1 ≥ 80% 门槛
- 6 个 commit 新增（LLM integration、E2E fallback、performance score、test refactor、history consolidation、performance 估算 + Lighthouse placeholder）
