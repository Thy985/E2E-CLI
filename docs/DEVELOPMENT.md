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
│   │   ├── index.ts         # CLI主入口
│   │   └── commands/        # 命令实现
│   │       ├── diagnose.ts
│   │       ├── ux-audit.ts  # UI/UX审查 ⭐
│   │       ├── design.ts    # 设计规范管理 ⭐
│   │       └── fix.ts
│   ├── scheduler/            # 任务调度
│   │   ├── intent-parser.ts
│   │   ├── task-planner.ts
│   │   └── executor.ts
│   ├── skills/               # Skills插件
│   │   ├── registry.ts      # Skill注册表
│   │   ├── loader.ts        # Skill加载器
│   │   ├── base-skill.ts    # Skill基类
│   │   └── builtin/         # 内置Skills
│   │       ├── e2e/         # E2E测试
│   │       ├── uiux/        # UI/UX审查 ⭐
│   │       ├── a11y/        # 可访问性
│   │       ├── perf/        # 性能诊断
│   │       └── security/    # 安全扫描
│   ├── engines/              # 核心引擎
│   │   ├── diagnosis/       # 诊断引擎
│   │   ├── fix/             # 修复引擎
│   │   ├── verify/          # 验证引擎
│   │   └── sandbox/         # 沙箱系统 ⭐
│   ├── models/               # LLM服务
│   ├── tools/                # 工具集
│   └── types/                # 类型定义
├── tests/
├── examples/
└── package.json
```

---

## 二、开发环境

### 2.1 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0（推荐）
- Git
- Docker（用于沙箱测试）

### 2.2 快速开始

```bash
# 克隆项目
git clone https://github.com/your-org/qa-agent.git
cd qa-agent

# 安装依赖
pnpm install

# 安装 Playwright
pnpm exec playwright install

# 配置环境变量
cp .env.example .env
# 编辑 .env 添加你的 LLM API Key

# 开发模式
pnpm dev

# 运行测试
pnpm test

# 构建
pnpm build
```

### 2.3 环境变量

```bash
# LLM配置
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-xxx

# 可选：自定义模型端点
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4

# Figma集成（UI/UX功能）
FIGMA_ACCESS_TOKEN=figd_xxx
```

---

## 三、开发指南

### 3.1 开发一个 Skill

```typescript
// src/skills/builtin/my-skill/index.ts
import { defineSkill } from '../../base-skill';

export default defineSkill({
  name: 'my-skill',
  version: '1.0.0',
  description: '我的自定义Skill',
  
  // 诊断：发现问题
  async diagnose(context) {
    const issues = [];
    
    // 分析代码/页面
    // ...
    
    return issues;
  },
  
  // 修复：生成修复方案
  async fix(issue) {
    return {
      type: 'code-change',
      file: issue.file,
      changes: [
        {
          search: /old-pattern/,
          replace: 'new-pattern'
        }
      ]
    };
  },
  
  // 验证：确认修复有效
  async verify(fix) {
    // 运行测试或检查
    return { success: true };
  }
});
```

### 3.2 UI/UX Skill 开发要点 ⭐

```typescript
// src/skills/builtin/uiux/index.ts
export default defineSkill({
  name: 'uiux-audit',
  
  async diagnose(context) {
    const issues = [];
    
    // 1. 提取设计令牌
    const designTokens = await extractDesignTokens(context);
    
    // 2. 分析CSS
    const cssIssues = await analyzeCSS(context, designTokens);
    issues.push(...cssIssues);
    
    // 3. 检查布局
    const layoutIssues = await checkLayout(context);
    issues.push(...layoutIssues);
    
    // 4. 检查交互状态
    const interactionIssues = await checkInteractions(context);
    issues.push(...interactionIssues);
    
    // 5. AI视觉分析（可选）
    if (context.options.aiVision) {
      const visionIssues = await analyzeWithAI(context);
      issues.push(...visionIssues);
    }
    
    return issues;
  },
  
  async fix(issue) {
    switch (issue.type) {
      case 'color-mismatch':
        return fixColor(issue);
      case 'spacing-inconsistent':
        return fixSpacing(issue);
      case 'missing-hover-state':
        return generateHoverState(issue);
      // ...
    }
  }
});
```

### 3.3 添加 CLI 命令

```typescript
// src/cli/commands/ux-audit.ts
import { Command } from 'commander';

export const uxAuditCommand = new Command('ux-audit')
  .description('UI/UX审查')
  .option('-u, --url <url>', '目标URL')
  .option('-f, --focus <dimensions>', '审查维度', 'visual,layout,interaction')
  .option('--strict', '严格模式')
  .option('--fix', '自动修复')
  .option('--preview', '沙箱预览')
  .option('--dry-run', '仅预览不应用')
  .action(async (options) => {
    const scheduler = await createScheduler();
    const result = await scheduler.execute('ux-audit', options);
    console.log(result);
  });
```

---

## 四、测试

### 4.1 测试结构

```bash
tests/
├── unit/              # 单元测试
│   ├── skills/
│   ├── engines/
│   └── utils/
├── integration/       # 集成测试
│   └── cli/
└── e2e/              # 端到端测试
    └── fixtures/
```

### 4.2 运行测试

```bash
# 全部测试
pnpm test

# 单元测试
pnpm test:unit

# 集成测试
pnpm test:integration

# 带覆盖率
pnpm test:coverage

# 监听模式
pnpm test:watch
```

### 4.3 编写测试

```typescript
// tests/unit/skills/uiux.test.ts
import { describe, it, expect } from 'vitest';
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
pnpm version patch|minor|major

# 2. 构建
pnpm build

# 3. 测试
pnpm test

# 4. 发布
pnpm publish

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
# 使用 VS Code 调试
# .vscode/launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Skill",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": ["tsx", "src/cli/index.ts", "diagnose", "--skill=uiux"],
  "env": { "DEBUG": "true" }
}
```

### Q: 如何添加新的 LLM 提供商?

```typescript
// src/models/providers/my-provider.ts
export class MyProvider implements LLMProvider {
  async chat(messages: Message[]): Promise<string> {
    // 实现调用逻辑
  }
}

// 在 router.ts 中注册
```

### Q: 沙箱如何工作?

沙箱使用 Docker 或 Node.js VM 创建隔离环境：
1. 复制项目到临时目录
2. 应用代码变更
3. 启动开发服务器
4. 运行测试/截图
5. 销毁环境

---

*文档版本: v1.0 | 最后更新: 2026-04-27*
