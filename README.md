# QA-Agent

> AI 质量医生 — 能诊断、能开药、能验证疗效

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/runtime-bun-black)](https://bun.sh)

## 简介

QA-Agent 是一个 AI 驱动的质量诊断与自愈平台，通过 CLI 原生交互，提供从问题发现、根因定位、自动修复到验证闭环的全流程自动化能力。

### 核心特性

- **多维度诊断**：E2E 测试、UI/UX、可访问性、性能、安全、最佳实践、SEO、依赖健康全覆盖
- **智能根因分析**：不只是发现问题，更定位问题根源
- **自动修复能力**：一键修复低风险问题，人工确认高风险问题
- **沙箱预览系统**：修复前可视化预览，用户确认后应用 ⭐核心差异化
- **Figma 集成**：设计令牌同步、设计稿对比、设计变更检测
- **最佳实践检查**：HTML 语义化、CSS 优化、图片优化、性能优化
- **SEO 优化**：Meta 标签、结构化数据、链接优化、内容优化
- **依赖健康**：过时依赖、安全漏洞、重复依赖、版本范围检查
- **项目健康审计**：代码质量、依赖安全、配置完整性检查
- **Web Dashboard**：可视化报告、交互式修复、历史趋势
- **CI/CD 集成**：GitHub Actions、GitLab CI、Jenkins、CircleCI

## 快速开始

### 安装

```bash
# 使用 bun (推荐)
bun install -g qa-agent

# 使用 npm
npm install -g qa-agent

# 使用 pnpm
pnpm add -g qa-agent
```

### 基本使用

```bash
# 全面诊断
qa-agent diagnose

# UI/UX 专项审查
qa-agent ux-audit

# 预览修复效果
qa-agent ux-audit --fix --preview

# 最佳实践检查
qa-agent best-practices

# 从 Figma 同步设计令牌
qa-agent design sync --file YOUR_FILE_KEY --format css

# 对比代码与 Figma 设计
qa-agent design compare --file YOUR_FILE_KEY

# 修复问题
qa-agent fix

# 预览修复（不实际修改）
qa-agent fix --dry-run

# 项目健康度审计
qa-agent audit

# 启动 Web Dashboard
qa-agent web

# 生成 CI 配置
qa-agent ci init --platform github

# SEO 检查
qa-agent seo

# 依赖健康检查
qa-agent dependency
```

## 命令概览

### diagnose - 诊断

```bash
qa-agent diagnose [options]

选项:
  -s, --skills <list>    指定诊断维度 (e2e,a11y,performance,security,ui-ux,seo,dependency)
  -p, --path <path>      指定项目路径
  -o, --output <format>  输出格式 (html,json,markdown,compact)
  --fail-on <level>      失败级别 (critical,warning)
  --ci                   CI 模式（非交互、JSON 输出）
```

### ux-audit - UI/UX 审查 ⭐

```bash
qa-agent ux-audit [options]

选项:
  -u, --url <url>        目标 URL
  -p, --path <path>      项目路径
  -f, --focus <dims>     审查维度 (visual,layout,interaction)
  --fix                  自动修复
  --preview              沙箱预览修复效果
  --dry-run              仅预览不应用
  -o, --output <format>  输出格式 (text,json,html)
```

### design - 设计规范管理 ⭐

```bash
# 从 Figma 同步设计令牌
qa-agent design sync --file <fileKey> --format <css|scss|js|ts|json>

# 对比代码与 Figma 设计
qa-agent design compare --file <fileKey>

# 导出设计文档
qa-agent design export --output DESIGN_TOKENS.md
```

### fix - 修复

```bash
qa-agent fix [options]

选项:
  -p, --path <path>      项目路径
  -r, --report <path>    指定诊断报告路径
  --dry-run              预览修复，不实际修改
  -y, --yes              跳过确认，自动应用修复
```

### audit - 审计

```bash
qa-agent audit [options]

选项:
  -p, --path <path>          项目路径
  --comprehensive            全面审计（含安全扫描）
  --compliance <standards>   合规标准 (WCAG2.2,ADA,GDPR)
  -o, --output <format>      输出格式 (html,json,markdown,compact)
```

### seo - SEO 检查

```bash
qa-agent seo [options]

选项:
  -p, --path <path>      项目路径
  --fix                  自动修复 SEO 问题
  -o, --output <format>  输出格式
```

### dependency - 依赖检查

```bash
qa-agent dependency [options]

选项:
  -p, --path <path>      项目路径
  --fix                  自动修复依赖问题
  --outdated            检查过时依赖
  --duplicates          检查重复依赖
```

### best-practices - 最佳实践

```bash
qa-agent best-practices [options]

选项:
  -p, --path <path>      项目路径
  --fix                  自动修复
  --html                 HTML 最佳实践
  --css                  CSS 最佳实践
  --image                图片优化
  --performance          性能最佳实践
```

### web - Web Dashboard

```bash
qa-agent web [options]

选项:
  -p, --port <port>    端口号 (默认 3000)
  --no-open            不自动打开浏览器
```

### ci - CI/CD 集成

```bash
qa-agent ci <action> [options]

操作:
  init                 生成 CI 配置
  detect               检测现有 CI 平台
  run                  CI 模式运行

选项:
  --platform <name>    CI 平台 (github,gitlab,jenkins,circleci)
  --skills <list>       诊断维度
  --fail-on <level>    失败级别
```

### skill - Skills 管理

```bash
qa-agent skill <action> [name]

操作:
  list                 列出已安装 Skills
  install              安装新 Skill (待实现)
  update               更新 Skill (待实现)
  create               创建新 Skill (待实现)
```

## Skills 生态

### 内置 Skills (10个)

| Skill | 描述 | 自动修复 |
|-------|------|----------|
| a11y | WCAG 可访问性检查 | ✅ |
| e2e | E2E 端到端测试 | ✅ |
| performance | 性能优化检查 | ✅ |
| security | 安全漏洞检查 | ✅ |
| ui-ux | UI/UX 体验检查 | ✅ |
| seo | SEO 优化检查 | ✅ |
| dependency | 依赖健康检查 | ✅ |
| best-practices | 最佳实践检查 | ✅ |
| complexity | 代码复杂度检查 | ❌ |
| api | API 规范检查 | ❌ |

### 检测能力

| 维度 | 检测项 |
|------|--------|
| 可访问性 | 图片 alt、表单标签、按钮名称、ARIA 属性 |
| E2E 测试 | 测试覆盖、选择器稳定性、Playwright 配置 |
| 性能 | 大依赖、console 语句、大文件、同步脚本 |
| 安全 | 硬编码敏感信息、SQL 注入、XSS、eval |
| UI/UX | 表单标签、焦点样式、加载状态、响应式 |
| SEO | Meta 标签、结构化数据、链接完整性 |
| 依赖 | 过时依赖、安全漏洞、重复依赖 |
| 最佳实践 | HTML 语义化、CSS 优化、图片优化 |

## CI/CD 集成

### 快速配置

```bash
# 生成 GitHub Actions 配置
qa-agent ci init --platform github

# 生成 GitLab CI 配置
qa-agent ci init --platform gitlab

# 检测现有 CI 平台
qa-agent ci detect
```

### GitHub Actions 示例

```yaml
name: QA-Agent

on: [push, pull_request]

jobs:
  quality-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v1

      - run: bun install

      - run: bunx qa-agent diagnose --ci
        continue-on-error: true

      - run: bunx qa-agent audit --ci
        continue-on-error: true

      - uses: actions/upload-artifact@v4
        with:
          name: qa-reports
          path: .qa-agent/reports/
```

## Web Dashboard

启动可视化界面：

```bash
qa-agent web
```

功能：
- 📊 仪表盘 - 统计概览、最新报告、趋势图表
- 🔍 诊断 - 选择维度、运行诊断、交互式修复
- 📈 历史 - 历史记录、趋势分析

## 输出示例

```
📊 诊断摘要
──────────────────────────────────────────────────

  综合得分: 86/100    质量等级: B

  问题总数: 3
    - 严重: 1
    - 警告: 1
    - 建议: 1

  💡 2 个问题可自动修复
     运行 qa-agent fix 进行修复
```

## 文档

- [产品需求文档 (PRD)](./docs/PRD.md)
- [技术架构文档](./docs/ARCHITECTURE.md)
- [开发文档](./docs/DEVELOPMENT.md)

## 开发

### 环境搭建

```bash
# 克隆项目
git clone https://github.com/your-org/qa-agent.git
cd qa-agent

# 安装依赖
pnpm install

# 开发模式
pnpm run dev

# 运行测试
pnpm test

# 类型检查
pnpm run typecheck

# 构建
pnpm run build

# 构建 Windows 可执行文件
pnpm run build:windows
```

### 项目结构

```
qa-agent/
├── docs/               # 文档
├── src/
│   ├── cli/            # CLI 入口
│   │   ├── commands/   # 命令实现
│   │   └── output/     # 输出格式化
│   ├── skills/         # Skills 插件
│   │   └── builtin/    # 内置 Skills
│   ├── engines/        # 核心引擎
│   │   ├── ai-fix/     # AI 修复
│   │   ├── audit/      # 审计引擎
│   │   ├── diagnosis/  # 诊断引擎
│   │   ├── fix/        # 修复引擎
│   │   ├── report/     # 报告生成
│   │   ├── sandbox/    # 沙箱系统
│   │   └── verify/     # 验证引擎
│   ├── gui/            # GUI 组件
│   ├── integrations/    # 第三方集成
│   ├── models/         # LLM 客户端
│   ├── scheduler/      # 任务调度
│   ├── storage/        # 存储
│   ├── tools/          # 工具集
│   ├── types/          # 类型定义
│   ├── utils/          # 工具函数
│   └── web/            # Web UI
├── tests/              # 测试
└── dist/               # 构建输出
```

## 路线图

### v0.1.x (当前)
- [x] CLI 基础框架
- [x] Skills 插件系统
- [x] 10 个诊断 Skills
- [x] 自动修复能力
- [x] 项目健康审计
- [x] Web Dashboard
- [x] CI/CD 集成

### v0.2.0
- [ ] skill install/update/create 命令
- [ ] watch 监控模式
- [ ] 配置文件支持
- [ ] Sandbox 系统完善

### v0.3.0
- [ ] 所有 Skills 完整自动修复
- [ ] Web UI 生产构建
- [ ] 测试覆盖率 > 80%

### v1.0.0
- [ ] Skills 插件市场
- [ ] 企业级功能
- [ ] 国际化和本地化

## 许可

[MIT](./LICENSE)