# QA-Agent 开发文档

> 开发指南：如何参与 QA-Agent 项目开发

---

## 一、项目结构

```
qa-agent/
├── docs/                          # 文档
│   ├── PRD.md                     # 产品需求文档
│   ├── ARCHITECTURE.md            # 架构设计文档
│   ├── AI_FIX.md                  # AI 修复引擎文档
│   ├── FIGMA_INTEGRATION.md       # Figma 集成文档
│   ├── RULES.md                   # 编码规范
│   └── DEVELOPMENT.md             # 本文件
├── src/
│   ├── cli/                       # CLI 入口层
│   │   ├── index.ts               # Commander.js 主入口
│   │   ├── output/                # 输出格式化
│   │   │   └── formatter.ts
│   │   └── commands/              # 13 个命令
│   │       ├── diagnose.ts        # 诊断
│   │       ├── fix.ts             # 修复
│   │       ├── audit.ts           # 项目审计
│   │       ├── ux-audit.ts        # UI/UX 审查
│   │       ├── design.ts          # Figma 设计规范
│   │       ├── best-practices.ts  # 最佳实践
│   │       ├── seo.ts             # SEO 检查
│   │       ├── dependency.ts      # 依赖健康
│   │       ├── web.ts             # Web Dashboard
│   │       ├── ci.ts              # CI/CD 集成
│   │       ├── gui.ts             # GUI 自动化
│   │       ├── skill.ts           # Skill 管理
│   │       └── init.ts            # 初始化
│   ├── skills/                    # Skills 插件层
│   │   ├── index.ts               # 入口 + getRegisteredSkills()
│   │   ├── base-skill.ts          # BaseSkill 抽象基类
│   │   ├── registry.ts            # SkillRegistry（注册/调度）
│   │   ├── skill-manager.ts       # install/update/create/remove
│   │   └── builtin/               # 10 个内置 Skills
│   │       ├── a11y/              # 可访问性
│   │       ├── e2e/               # E2E 测试
│   │       ├── uiux/              # UI/UX 审查（含 checkers/fixers）
│   │       ├── ui-ux/             # UI/UX 别名（指向 uiux）
│   │       ├── best-practices/    # 最佳实践（含 checkers/fixers）
│   │       ├── seo/               # SEO（含 fixers）
│   │       ├── dependency/        # 依赖（含 fixers）
│   │       ├── security/          # 安全
│   │       ├── performance/       # 性能
│   │       ├── complexity/        # 复杂度
│   │       └── api/               # API 规范
│   ├── engines/                   # 核心引擎层
│   │   ├── diagnosis/             # 诊断引擎（去重/排序/汇总）
│   │   ├── fix/                   # 修复引擎
│   │   │   ├── index.ts           # 入口
│   │   │   ├── batch.ts           # 批量修复
│   │   │   ├── enhanced.ts        # 增强修复（replace/insert/delete）
│   │   │   ├── simple-fix.ts      # 简单修复
│   │   │   ├── debug.ts           # 调试模式
│   │   │   └── rollback.ts        # 回滚点
│   │   ├── verify/                # 验证引擎
│   │   ├── sandbox/               # 沙箱系统（隔离预览/截图/视觉对比）
│   │   ├── audit/                 # 审计引擎
│   │   │   ├── index.ts
│   │   │   └── checkers/          # 6 个审计检查器
│   │   ├── report/                # 报告生成
│   │   └── ai-fix/                # AI 修复（LLM 生成）
│   ├── gui/                       # GUI 自动化
│   │   ├── index.ts               # GUIAgent 入口
│   │   ├── browser/               # 浏览器控制（Playwright）
│   │   ├── actor/                 # 自然语言任务执行
│   │   ├── selector/              # 智能选择器
│   │   ├── recorder/              # 录制
│   │   ├── player/                # 回放
│   │   ├── visual/                # 视觉对比（pixelmatch）
│   │   ├── recovery/              # 失败恢复
│   │   └── report/                # GUI 报告
│   ├── integrations/              # 第三方集成
│   │   └── figma/                 # Figma 集成（client/sync/compare）
│   ├── models/                    # LLM 客户端
│   │   └── index.ts               # 多 provider 路由 + mock 兜底
│   ├── ci/                        # CI 配置生成
│   │   └── index.ts               # github/gitlab/jenkins/circleci
│   ├── web/                       # Web Dashboard
│   │   ├── server.ts              # Hono SSR
│   │   ├── App.tsx                # 路由
│   │   ├── main.tsx               # React 入口
│   │   ├── api/                   # REST API
│   │   ├── components/            # React 组件
│   │   └── pages/                 # 页面
│   ├── storage/                   # 存储
│   │   └── index.ts               # 内存 + 文件（懒加载+防抖）
│   ├── config/                    # 配置加载
│   │   └── index.ts               # yaml/json/ts 多格式
│   ├── tools/                     # 工具注册表
│   │   └── index.ts
│   ├── types/                     # 类型定义
│   │   └── index.ts
│   └── utils/                     # 工具函数
│       ├── logger.ts
│       ├── shell.ts
│       └── ignore.ts
├── tests/                         # 测试
│   ├── unit/                      # 14 个单元测试
│   └── fixtures/                  # 测试样本项目
└── package.json
```

> **注**：v0.1.x 已去除原文档中描述的 `src/scheduler/{intent-parser,task-planner,executor}` 任务调度层，
> 当前由 CLI 命令直接调度 Skills。架构图见 [ARCHITECTURE.md](./ARCHITECTURE.md#一整体架构)。

---

## 二、开发环境

### 2.1 环境要求

- **Bun** >= 1.0.0（运行时 + 包管理）
- Node.js >= 18（可选，仅用于交叉编译）
- Git
- Playwright 浏览器（仅 GUI / 视觉测试需要）

> 项目实际使用 **Bun** 作为运行和构建工具，并非 pnpm。
> `package.json` 中 `engines.bun` 明确要求 `>=1.0.0`。

### 2.2 快速开始

```bash
# 克隆项目
git clone https://github.com/your-org/qa-agent.git
cd qa-agent

# 安装依赖
bun install

# 安装 Playwright 浏览器（可选，仅 GUI 测试需要）
bunx playwright install

# 配置环境变量
cp .env.example .env
# 编辑 .env 添加你的 LLM API Key

# 开发模式（直接 bun 运行）
bun run src/cli/index.ts diagnose

# 运行测试
bun test

# 类型检查
bun run typecheck

# 构建为单一可执行文件
bun run build               # 当前平台
bun run build:linux         # 显式 Linux
bun run build:mac           # macOS
bun run build:windows       # Windows
```

### 2.3 环境变量

```bash
# LLM（任选其一；未设置时降级为 mock client）
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-xxx
# 或自定义 OpenAI 兼容端点
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4

# Figma 集成（design sync/compare 需要）
FIGMA_ACCESS_TOKEN=figd_xxx
```

---

## 三、开发指南

### 3.1 开发一个 Skill

Skills 继承 `BaseSkill` 抽象类：

```typescript
// src/skills/builtin/my-skill/index.ts
import { BaseSkill } from '../../base-skill';
import { SkillContext, Diagnosis, Fix, SkillTrigger, SkillCapability } from '../../../types';

export class MySkill extends BaseSkill {
  name = 'my-skill';
  version = '1.0.0';
  description = '我的自定义 Skill';

  triggers: SkillTrigger[] = [
    { type: 'keyword', pattern: /my-skill|我的/i },
  ];

  capabilities: SkillCapability[] = [
    {
      name: 'diagnosis',
      description: '执行我的诊断',
      autoFixable: true,
      riskLevel: 'low',
    },
  ];

  // 必须实现
  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const { project, logger } = context;
    logger.info('开始 my-skill 诊断...');

    // 扫描文件、调用 LLM、组装 Diagnosis 列表
    return [];
  }

  // 可选：自动修复
  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      description: '自动修复',
      changes: [
        { file: 'src/example.ts', type: 'replace', oldContent: '...', content: '...' },
      ],
      riskLevel: 'low',
      autoApplicable: true,
    };
  }
}
```

注册 Skill（`src/skills/index.ts`）：

```typescript
import { MySkill } from './builtin/my-skill';

export function getRegisteredSkills(): Skill[] {
  return [
    // ... 已有 10 个
    new MySkill(),
  ];
}
```

生成 Skill 模板（推荐方式）：

```bash
bun run src/cli/index.ts skill create my-skill --description "我的 Skill"
# 自动生成 .qa-agent/skills/my-skill/{index.ts,checkers/,fixers/,package.json,README.md}
```

### 3.2 UI/UX Skill 开发要点 ⭐

UI/UX Skill 由 4 个子模块组成（[src/skills/builtin/ui-ux/](file:///workspace/src/skills/builtin/ui-ux)）：

| 文件 | 职责 |
|------|------|
| `index.ts` | 入口，串行调用下面 3 个 checker |
| `design-token-extractor.ts` | 从代码提取颜色/字体/间距令牌 |
| `checkers/visual-checker.ts` | 颜色/字体/间距/圆角/阴影一致性 |
| `checkers/layout-checker.ts` | 对齐/响应式/容器约束 |
| `checkers/interaction-checker.ts` | hover/active/focus/disabled 状态完整性 |
| `fixers/css-fix-generator.ts` | 生成 CSS 修复代码 |

调用链：

```typescript
async diagnose(context: SkillContext): Promise<Diagnosis[]> {
  const issues: Diagnosis[] = [];
  issues.push(...await new VisualChecker().check(projectPath));
  issues.push(...await new LayoutChecker().check(projectPath));
  issues.push(...await new InteractionChecker().check(projectPath));
  return issues;
}
```

### 3.3 添加 CLI 命令

CLI 命令注册在 [src/cli/index.ts](file:///workspace/src/cli/index.ts)。新增命令步骤：

1. 在 `src/cli/commands/<name>.ts` 实现 `action` 回调
2. 在 [src/cli/index.ts](file:///workspace/src/cli/index.ts) 注册 `program.command('xxx').description(...).option(...).action(...)`
3. 如需要子命令，使用 `program.command('xxx').addCommand(new Command('sub')...)`
4. 关键：Commander.js 的 `action` 回调签名是 `(command, options)`，
   第一个参数其实是**子 Command 实例**，要 `command.opts()` 才能拿到选项

```typescript
// src/cli/commands/my-command.ts
import { Command } from 'commander';
import { createFormatter } from '../output/formatter';

export async function myCommand(command: any, _actionOptions?: unknown) {
  // 关键：Commander 把子 command 作为第一参数
  const opts = command && typeof command === 'object' && 'opts' in command
    ? command.opts()
    : (command || {});

  const formatter = createFormatter();
  formatter.info('My command running...');
  // 实现逻辑
}
```

---

## 四、测试

### 4.1 测试结构

```
tests/
├── unit/                  # 14 个单元测试
│   ├── a11y.test.ts
│   ├── diagnosis-engine.test.ts
│   ├── e2e.test.ts
│   ├── fix-engine.test.ts
│   ├── ignore.test.ts
│   ├── logger.test.ts
│   ├── model.test.ts
│   ├── report.test.ts
│   ├── rollback.test.ts
│   ├── sandbox.test.ts
│   ├── security.test.ts
│   ├── skill-registry.test.ts
│   ├── storage.test.ts
│   └── utils.test.ts
└── fixtures/              # 测试样本项目
    └── sample-project/
```

### 4.2 运行测试

```bash
# 全部测试（当前 179 个 case / 14 个文件）
bun test

# 单个文件
bun test tests/unit/fix-engine.test.ts

# 覆盖率
bun run test:coverage

# 类型检查
bun run typecheck

# Lint
bun run lint
```

### 4.3 编写测试

测试用 **`bun test`**（内置，无需 vitest/jest）。

```typescript
// tests/unit/my-skill.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MySkill } from '../../src/skills/builtin/my-skill';

let projectDir: string;

beforeEach(async () => {
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-myskill-'));
});

afterEach(async () => {
  await fs.rm(projectDir, { recursive: true, force: true });
});

describe('MySkill', () => {
  it('detects a problem', async () => {
    await fs.writeFile(path.join(projectDir, 'a.ts'), '// ...', 'utf-8');
    const skill = new MySkill();
    const result = await skill.diagnose({
      project: { path: projectDir, name: 'p', type: 'webapp' },
      config: {} as any,
      logger: {} as any,
      tools: {} as any,
      model: {} as any,
      storage: {} as any,
    });
    expect(result.length).toBeGreaterThan(0);
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

### 5.2 代码风格

- TypeScript 严格模式（`tsconfig.json` 已开启）
- 优先 `const` / `let`，避免 `var`
- **异步统一用 `fs/promises`，禁止 `fs.readFileSync/writeFileSync/existsSync` 等同步 API**
- 函数返回 `Promise` 时显式 `async`
- 错误用 try/catch 显式处理，避免静默吞错
- 注释使用 JSDoc 格式

### 5.3 关键约束

- **Commander.js**：action 回调第一参数是子 Command 实例，必须 `command.opts()` 取选项
- **fs/promises**：`mkdir({ recursive: true })` 是幂等的，不需要预先 `existsSync`
- **路径处理**：用 `path.join` / `path.resolve`，避免字符串拼接
- **技能注册**：新增 builtin skill 必须在 [src/skills/index.ts](file:///workspace/src/skills/index.ts) 的 `getRegisteredSkills()` 中注册

---

## 六、发布流程

### 6.1 版本规范

遵循 [Semantic Versioning](https://semver.org/):
- `MAJOR`: 不兼容的 API 更改
- `MINOR`: 向后兼容的功能添加
- `PATCH`: 向后兼容的问题修复

### 6.2 发布步骤

```bash
# 1. 更新版本（手动编辑 package.json）
# 2. 跑测试 + 类型检查
bun test
bun run typecheck

# 3. 构建当前平台二进制
bun run build

# 4. 跨平台构建
bun run build:linux
bun run build:mac
bun run build:windows

# 5. 发布
bun publish

# 6. 打标签
git tag v0.1.0
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
- **更新文档**（特别是 ARCHITECTURE.md / 本文档）
- 通过 CI 检查（typecheck + test）

---

## 八、常见问题

### Q: 如何调试 Skill?

```bash
# 直接 bun 运行
bun run src/cli/index.ts diagnose --skills my-skill --path ./demo -v
```

### Q: 如何添加新的 LLM 提供商?

修改 [src/models/index.ts](file:///workspace/src/models/index.ts)：

```typescript
case 'my-provider':
  return createMyProviderClient({ apiKey, model });
```

`createModelClient()` 已经支持 `deepseek` / `openai` / `claude` / `siliconflow` / `groq` / `minimax` 以及 mock 兜底。

### Q: 沙箱如何工作?

[src/engines/sandbox/index.ts](file:///workspace/src/engines/sandbox/index.ts) 的实现：

1. 在 `.qa-agent/sandbox/<id>/` 创建临时目录，拷贝项目（排除 `node_modules` 等）
2. 启动 dev server（`npm run dev/start/serve`，无 `package.json` 时 fallback `npx serve`）
3. Playwright 截图（不可用时降级为 1×1 PNG 占位）
4. 用 `pixelmatch + pngjs` 做前后视觉 diff
5. 销毁时 `SIGTERM → SIGKILL → rm -rf` 沙箱目录

> **不依赖 Docker**。隔离粒度是"独立临时目录 + 独立进程"，与 [ARCHITECTURE.md §3.4](./ARCHITECTURE.md#34-沙箱系统-srcenginessandbox) 一致。
> DEVELOPMENT.md 旧版"沙箱使用 Docker"描述与代码不符，已修正。

---

*文档版本: v2.0 | 最后更新: 2026-06-03（与 v0.1.x 代码实现对齐）*
