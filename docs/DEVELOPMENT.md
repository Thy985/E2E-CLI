# QA-Agent 开发文档

> 开发指南：如何参与 QA-Agent 项目开发

---

## 一、项目结构

```
qa-agent/
├── docs/                     # 文档
│   ├── PRD.md               # 产品需求文档
│   ├── ARCHITECTURE.md      # 架构设计文档
│   └── DEVELOPMENT.md       # 本文件
├── src/
│   ├── cli/                  # CLI 入口
│   │   ├── index.ts         # CLI 主入口
│   │   ├── commands/        # 命令实现
│   │   │   ├── audit.ts
│   │   │   ├── best-practices.ts
│   │   │   ├── ci.ts
│   │   │   ├── dependency.ts
│   │   │   ├── design.ts
│   │   │   ├── diagnose.ts
│   │   │   ├── fix.ts
│   │   │   ├── init.ts
│   │   │   ├── seo.ts
│   │   │   ├── skill.ts
│   │   │   └── ux-audit.ts
│   │   └── output/          # 输出渲染
│   │       ├── formatter.ts
│   │       └── report-renderer.ts
│   ├── ci/                   # CI 集成
│   │   └── index.ts
│   ├── config/               # 配置管理
│   │   └── index.ts
│   ├── engines/              # 核心引擎
│   │   ├── ai-fix/          # AI 修复引擎
│   │   │   └── index.ts
│   │   ├── audit/           # 审计引擎
│   │   │   ├── checkers/
│   │   │   │   ├── code-quality.ts
│   │   │   │   ├── config.ts
│   │   │   │   ├── dependency.ts
│   │   │   │   ├── documentation.ts
│   │   │   │   ├── security.ts
│   │   │   │   └── test.ts
│   │   │   └── index.ts
│   │   ├── fix/             # 修复引擎
│   │   │   ├── batch.ts
│   │   │   ├── debug.ts
│   │   │   ├── enhanced.ts
│   │   │   ├── errors.ts
│   │   │   ├── index.ts
│   │   │   ├── rollback.ts
│   │   │   └── simple-fix.ts
│   │   ├── report/          # 报告引擎
│   │   │   └── index.ts
│   │   ├── sandbox/         # 沙箱系统
│   │   │   └── index.ts
│   │   └── verify/          # 验证引擎
│   │       └── index.ts
│   ├── integrations/         # 外部集成
│   │   ├── figma/           # Figma 集成
│   │   │   ├── client.ts
│   │   │   ├── compare.ts
│   │   │   ├── index.ts
│   │   │   └── sync.ts
│   │   └── index.ts
│   ├── models/               # LLM 模型客户端
│   │   └── index.ts
│   ├── skills/               # Skills 插件系统
│   │   ├── builtin/         # 内置 Skills
│   │   │   ├── a11y/        # 可访问性
│   │   │   ├── api/         # API 审查
│   │   │   ├── best-practices/  # 最佳实践
│   │   │   ├── complexity/  # 复杂度分析
│   │   │   ├── dependency/  # 依赖审计
│   │   │   ├── e2e/         # E2E 测试
│   │   │   ├── performance/ # 性能诊断
│   │   │   ├── security/    # 安全扫描
│   │   │   ├── seo/         # SEO 审查
│   │   │   ├── ui-ux/       # UI/UX 审查 (新版)
│   │   │   └── uiux/        # UI/UX 审查 (旧版)
│   │   ├── base-skill.ts    # Skill 基类
│   │   ├── index.ts
│   │   ├── registry.ts      # Skill 注册表
│   │   └── skill-manager.ts # Skill 管理器
│   ├── storage/              # 存储抽象
│   │   └── index.ts
│   ├── tools/                # 工具集
│   │   └── index.ts
│   ├── types/                # 类型定义
│   │   ├── index.ts
│   │   └── pixelmatch.d.ts
│   └── utils/                # 工具函数
│       ├── file-ops.ts
│       ├── ignore.ts
│       ├── image.ts
│       ├── index.ts
│       ├── logger.ts
│       └── shell.ts
├── tests/
│   ├── fixtures/
│   ├── integration/         # 集成测试
│   │   ├── fix-engine.integration.test.ts
│   │   ├── sandbox.integration.test.ts
│   │   └── skill-diagnose.integration.test.ts
│   └── unit/                # 单元测试
│       ├── a11y.test.ts
│       ├── config.test.ts
│       ├── e2e.test.ts
│       ├── logger.test.ts
│       ├── model.test.ts
│       ├── report.test.ts
│       ├── security.test.ts
│       └── skill-registry.test.ts
├── package.json
└── tsconfig.json
```

---

## 二、开发环境

### 2.1 环境要求

- Node.js >= 18
- Bun >= 1.0（推荐，项目主包管理器）
- Git

> 注意：沙箱使用本地临时目录，不需要 Docker。

### 2.2 快速开始

```bash
# 克隆项目
git clone https://github.com/your-org/qa-agent.git
cd qa-agent

# 安装依赖
bun install

# 配置环境变量
cp .env.example .env
# 编辑 .env 添加你的 LLM API Key

# 开发模式
bun run dev

# 类型检查
bun run typecheck

# 运行测试
bun test

# 构建
bun run build
```

### 2.3 环境变量

```bash
# LLM 配置（通用模型配置）
MODEL_API_KEY=sk-xxx          # 你的模型 API Key
MODEL_PROVIDER=openai         # 模型提供商：openai, anthropic, 等
MODEL_BASE_URL=https://api.openai.com/v1  # 自定义端点（可选）

# Figma 集成
FIGMA_ACCESS_TOKEN=figd_xxx
```

---

## 三、开发指南

### 3.1 开发一个 Skill

```typescript
// src/skills/builtin/my-skill/index.ts
import { Skill, SkillContext, Diagnosis, Issue } from '../../types';
import { BaseSkill } from '../../base-skill';
import { SkillTrigger, SkillCapability } from '../../../types';

export class MySkill extends BaseSkill {
  name = 'my-skill';
  version = '1.0.0';
  description = '描述';

  triggers: SkillTrigger[] = [
    { type: 'command', pattern: 'my-skill', priority: 100 },
    { type: 'keyword', pattern: /my-keyword/i, priority: 80 },
  ];

  capabilities: SkillCapability[] = [
    { name: 'my-check', description: '检查项', autoFixable: true, riskLevel: 'low' },
  ];

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];

    // 分析代码/页面
    // ...

    return issues;
  }

  async fix(diagnosis: Diagnosis, context: SkillContext) {
    // 生成修复方案
    return {
      id: 'fix-1',
      diagnosisId: diagnosis.id,
      description: '修复描述',
      changes: [],
      riskLevel: 'low',
      autoApplicable: true,
    };
  }
}

export default MySkill;
```

### 3.2 UI/UX Skill 开发要点 ⭐

```typescript
// src/skills/builtin/uiux/index.ts
export class UIUXSkill extends BaseSkill {
  name = 'ui-ux';
  version = '1.0.0';
  description = 'UI/UX视觉规范审查与修复';

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];

    // 1. 提取设计令牌
    const designTokens = await this.designTokenExtractor.extract(project.path, config);

    // 2. 视觉规范检查
    const visualIssues = await this.visualChecker.check(project.path, designTokens, config);
    issues.push(...visualIssues);

    // 3. 布局对齐检查
    const layoutIssues = await this.layoutChecker.check(project.path, designTokens, config);
    issues.push(...layoutIssues);

    // 4. 交互状态检查
    const interactionIssues = await this.interactionChecker.check(project.path, config);
    issues.push(...interactionIssues);

    return issues;
  }

  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    // 根据问题类型选择修复策略
    switch (diagnosis.metadata?.category) {
      case 'visual':
        return await this.cssFixGenerator.generateVisualFix(diagnosis, project.path);
      case 'interaction':
        return await this.cssFixGenerator.generateInteractionFix(diagnosis, project.path);
      // ...
    }
  }
}

export default UIUXSkill;
```

### 3.3 添加 CLI 命令

```typescript
// src/cli/commands/my-command.ts
import { Command } from 'commander';
import { createLogger } from '../../utils/logger';
import { outputResult } from '../output/report-renderer';

export function registerMyCommand(program: Command) {
  program
    .command('my-command')
    .description('我的命令描述')
    .option('-p, --path <path>', '目标路径', '.')
    .option('-o, --output <format>', '输出格式', 'compact')
    .action(async (options) => {
      const logger = createLogger(options);
      logger.info('正在执行...');

      // 执行逻辑
      const result = { /* ... */ };

      // 输出结果
      outputResult(result, options);
    });
}
```

---

## 四、测试

### 4.1 测试结构

```
tests/
├── fixtures/             # 测试夹具
│   └── sample-project/   # 示例项目
├── integration/          # 集成测试（53 个）
│   ├── fix-engine.integration.test.ts
│   ├── sandbox.integration.test.ts
│   └── skill-diagnose.integration.test.ts
└── unit/                 # 单元测试（129 个）
    ├── a11y.test.ts
    ├── config.test.ts
    ├── e2e.test.ts
    ├── logger.test.ts
    ├── model.test.ts
    ├── report.test.ts
    ├── security.test.ts
    └── skill-registry.test.ts
```

### 4.2 运行测试

```bash
# 全部测试（129 单元测试 + 53 集成测试 = 182 测试）
bun test

# 运行特定测试文件
bun test tests/unit/skill-registry.test.ts

# 运行集成测试
bun test tests/integration/
```

### 4.3 编写测试

```typescript
// tests/unit/skills/uiux.test.ts
import { describe, it, expect } from 'bun:test';
import uiuxSkill from '../../../src/skills/builtin/uiux';

describe('UI/UX Skill', () => {
  it('should detect color inconsistency', async () => {
    const context = {
      files: ['Button.tsx'],
      code: 'color: #ff0000;' // 不规范的颜色
    };
    
    const issues = await uiuxSkill.diagnose(context);
    
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('color-mismatch');
  });
  
  it('should generate color fix', async () => {
    const issue = {
      type: 'color-mismatch',
      file: 'Button.tsx',
      current: '#ff0000',
      expected: 'var(--color-primary)'
    };
    
    const fix = await uiuxSkill.fix(issue);
    
    expect(fix.changes[0].replace).toContain('var(--color-primary)');
  });
});
```

---

## 五、代码规范

### 5.1 提交规范

```
<type>(<scope>): <subject>

<body>

<footer>
```

类型：
- `feat`: 新功能
- `fix`: 修复
- `docs`: 文档
- `style`: 格式
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建

示例：
```
feat(uiux): add design token extractor

- Support CSS variable extraction
- Support Figma sync
- Add unit tests

Closes #123
```

### 5.2 代码风格

- 使用 TypeScript 严格模式
- 优先使用 `const` 和 `let`，避免 `var`
- 异步使用 `async/await`，避免回调
- 错误处理使用自定义错误类
- 注释使用 JSDoc 格式

---

## 六、发布流程

### 6.1 版本规范

遵循 [Semantic Versioning](https://semver.org/):
- `MAJOR`: 不兼容的API更改
- `MINOR`: 向后兼容的功能添加
- `PATCH`: 向后兼容的问题修复

### 6.2 发布步骤

```bash
# 1. 更新版本
bun run version patch  # 或 minor/major

# 2. 构建
bun run build

# 3. 测试
bun test

# 4. 发布
npm publish

# 5. 打标签
git push --follow-tags
```

---

## 七、贡献指南

### 7.1 贡献流程

1. Fork 项目
2. 创建分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### 7.2 PR 规范

- 标题清晰描述变更
- 关联相关 Issue
- 包含测试
- 更新文档
- 通过 CI 检查

---

## 八、常见问题

### Q: 如何调试 Skill?

```bash
# 使用 bun run 直接运行
bun run src/cli/index.ts diagnose --skill=ui-ux

# 使用 VS Code 调试
# .vscode/launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Skill",
  "runtimeExecutable": "bun",
  "runtimeArgs": ["run", "src/cli/index.ts", "diagnose", "--skill=ui-ux"],
  "env": { "DEBUG": "true" }
}
```

### Q: 如何添加新的 LLM 提供商?

```typescript
// src/models/index.ts
// 项目使用统一的 ModelClient 接口，通过 MODEL_PROVIDER 和 MODEL_API_KEY
// 环境变量配置。支持 openai、anthropic 等提供商。
// 在 ModelClient 中根据 provider 选择对应的 SDK 客户端即可。
```

### Q: 沙箱如何工作?

沙箱使用本地临时目录创建隔离环境：
1. 复制项目到临时目录
2. 应用代码变更
3. 启动开发服务器
4. 运行测试/截图
5. 清理临时目录

---

*文档版本: v2.0 | 最后更新: 2026-06-05*
