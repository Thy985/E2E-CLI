# QA-Agent

> AI 质量医生 — 能诊断、能开药、能验证疗效

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/qa-agent.svg)](https://nodejs.org)
[![npm version](https://img.shields.io/npm/v/qa-agent.svg)](https://www.npmjs.com/package/qa-agent)

## 简介

QA-Agent 是一款 AI 驱动的质量诊断与自愈平台，通过 CLI 原生交互，提供从问题发现、根因定位、自动修复到验证闭环的全流程自动化能力。

### 核心特性

- **多维度诊断**：功能、UI/UX、可访问性、性能、安全、代码质量全覆盖
- **智能根因分析**：不只是发现问题，更定位问题根源
- **自动修复能力**：一键修复低风险问题，人工确认高风险问题
- **验证闭环**：修复后自动回归测试，确保修复有效
- **Skills 插件系统**：可扩展的诊断能力，支持自定义

## 快速开始

### 安装

```bash
# npm
npm install -g qa-agent

# pnpm
pnpm add -g qa-agent

# yarn
yarn global add qa-agent
```

### 基本使用

```bash
# 全面诊断
qa-agent diagnose

# 指定维度诊断
qa-agent diagnose --skills=e2e,a11y,perf

# 修复问题
qa-agent fix

# 自动修复低风险问题
qa-agent fix --auto-approve=low

# 项目健康度审计
qa-agent audit
```

## 文档

- [产品需求文档 (PRD)](./docs/PRD.md)
- [技术架构文档](./docs/ARCHITECTURE.md)
- [开发文档](./docs/DEVELOPMENT.md)

## 命令概览

### diagnose - 诊断

```bash
qa-agent diagnose [options]

选项:
  --skills <list>      指定诊断维度 (e2e,a11y,perf,security,ui-ux)
  --path <path>        指定项目路径
  --url <url>          指定诊断 URL
  --output <format>    输出格式 (html,json,markdown)
  --fail-on <level>    失败级别 (critical,warning)
```

### fix - 修复

```bash
qa-agent fix [options]

选项:
  --issue <id>         指定修复问题 ID
  --auto-approve <levels>  自动批准级别 (low,medium,high)
  --dry-run            预览修复，不实际修改
  --create-pr          创建修复 PR
```

### audit - 审计

```bash
qa-agent audit [options]

选项:
  --comprehensive      全面审计（含安全扫描）
  --compliance <list>  合规标准 (WCAG2.2,ADA,GDPR)
```

### watch - 监控

```bash
qa-agent watch [options]

选项:
  --path <path>        监控路径
  --skills <list>      监控维度
  --auto-fix <levels>  自动修复级别
```

### skill - Skills 管理

```bash
qa-agent skill <command>

命令:
  list                 列出已安装 Skills
  install <name>       安装 Skill
  update <name>        更新 Skill
  create <name>        创建自定义 Skill
```

## Skills 生态

### 内置 Skills

| Skill | 描述 | 自动修复 |
|-------|------|----------|
| e2e-test | E2E 功能测试 | ✅ |
| a11y-check | WCAG 可访问性检查 | ✅ |
| ui-ux-audit | UI/UX 设计规范检查 | ✅ |
| perf-audit | 性能分析 | ⚠️ |
| security-scan | 安全漏洞扫描 | ⚠️ |

### 创建自定义 Skill

```bash
# 创建 Skill 骨架
qa-agent skill create my-custom-skill

# Skill 结构
my-custom-skill/
├── skill.yaml      # 配置
├── index.ts        # 实现
└── README.md       # 文档
```

## CI/CD 集成

### GitHub Actions

```yaml
# .github/workflows/qa-check.yml
name: QA Check

on: [pull_request]

jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install QA-Agent
        run: npm install -g qa-agent
      
      - name: Run Diagnosis
        run: qa-agent diagnose --skills=e2e,a11y --fail-on=critical
      
      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: qa-report
          path: .qa-agent/reports/
```

### GitLab CI

```yaml
# .gitlab-ci.yml
qa-check:
  image: node:20
  script:
    - npm install -g qa-agent
    - qa-agent diagnose --skills=e2e,a11y --fail-on=critical
  artifacts:
    paths:
      - .qa-agent/reports/
```

## 配置

### 项目配置文件

```yaml
# .qa-agent/config.yaml
version: 1

project:
  name: my-project
  type: webapp

skills:
  - name: e2e-test
    enabled: true
    config:
      browser: chromium
  - name: a11y-check
    enabled: true
    config:
      level: AA

model:
  provider: claude
  model: claude-sonnet-4.5

output:
  format: html
  path: .qa-agent/reports

ignore:
  - node_modules/
  - dist/
```

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
pnpm run test
```

### 项目结构

```
qa-agent/
├── docs/           # 文档
├── src/
│   ├── cli/        # CLI 模块
│   ├── skills/     # Skills 插件
│   ├── engines/    # 核心引擎
│   ├── models/     # 模型服务
│   └── tools/      # 工具集
├── tests/          # 测试
└── examples/       # 示例
```

## 路线图

### v0.1.0 (MVP)
- [x] CLI 基础框架
- [x] Skills 插件系统
- [x] E2E 测试 Skill
- [x] 可访问性 Skill
- [x] 诊断报告生成

### v0.2.0
- [ ] 自动修复引擎
- [ ] E2E 测试失败修复
- [ ] 可访问性自动修复

### v0.3.0
- [ ] UI/UX 审美 Skill
- [ ] 性能诊断 Skill
- [ ] watch 监控模式

### v0.4.0
- [ ] 安全诊断 Skill
- [ ] CI/CD 集成模板
- [ ] 团队协作功能

### v1.0.0
- [ ] Skills 市场
- [ ] 企业级支持

## 贡献

欢迎贡献！请查看 [贡献指南](./CONTRIBUTING.md)。

## 许可证

[MIT](./LICENSE)
