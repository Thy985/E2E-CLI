# QA-Agent 开发文档

## 一、项目结构

```
qa-agent/
├── docs/                     # 文档
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   └── DEVELOPMENT.md
├── src/
│   ├── cli/                  # CLI 模块
│   │   ├── index.ts
│   │   ├── commands/
│   │   ├── options/
│   │   ├── output/
│   │   └── config/
│   ├── scheduler/            # 任务调度
│   │   ├── index.ts
│   │   ├── intent-parser.ts
│   │   ├── task-planner.ts
│   │   ├── executor.ts
│   │   └── aggregator.ts
│   ├── skills/               # Skills 插件
│   │   ├── index.ts
│   │   ├── registry.ts
│   │   ├── loader.ts
│   │   ├── base-skill.ts
│   │   └── builtin/
│   │       ├── e2e/
│   │       ├── a11y/
│   │       ├── ui-ux/
│   │       ├── perf/
│   │       └── security/
│   ├── engines/              # 核心引擎
│   │   ├── diagnosis/
│   │   ├── fix/
│   │   ├── verify/
│   │   └── report/
│   ├── models/               # 模型服务
│   │   ├── index.ts
│   │   ├── router.ts
│   │   └── providers/
│   ├── tools/                # 工具集
│   │   ├── fs.ts
│   │   ├── browser.ts
│   │   ├── git.ts
│   │   └── shell.ts
│   ├── storage/              # 存储
│   │   ├── database.ts
│   │   ├── cache.ts
│   │   └── config.ts
│   ├── utils/                # 工具函数
│   │   ├── logger.ts
│   │   ├── hash.ts
│   │   └── format.ts
│   └── types/                # 类型定义
│       ├── index.ts
│       ├── skill.ts
│       ├── diagnosis.ts
│       └── fix.ts
├── tests/                    # 测试
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── examples/                 # 示例
│   ├── basic-usage/
│   ├── custom-skill/
│   └── ci-integration/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

---

## 二、开发环境搭建

### 2.1 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0（推荐）
- Git
- Docker（可选，用于沙盒测试）

### 2.2 安装依赖

```bash
# 克隆项目
git clone https://github.com/your-org/qa-agent.git
cd qa-agent

# 安装依赖
pnpm install

# 安装 Playwright 浏览器
pnpm exec playwright install

# 初始化数据库
pnpm run db:init
```

### 2.3 开发命令

```bash
# 开发模式（热重载）
pnpm run dev

# 构建
pnpm run build

# 测试
pnpm run test

# 测试覆盖率
pnpm run test:coverage

# Lint
pnpm run lint

# 类型检查
pnpm run typecheck

# 本地安装（全局）
pnpm run link
```

### 2.4 IDE 配置

**VS Code 推荐扩展**

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-playwright.playwright",
    "usernamehw.errorlens",
    "streetsidesoftware.code-spell-checker"
  ]
}
```

**VS Code settings.json**

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

---

## 三、核心模块开发指南

### 3.1 CLI 模块开发

**创建新命令**

```typescript
// src/cli/commands/my-command.ts
import { Command } from '@oclif/core';

export default class MyCommand extends Command {
  static description = 'My custom command';
  
  static examples = [
    '<%= config.bin %> <%= command.id %> --option value',
  ];
  
  static flags = {
    option: Flags.string({
      description: 'Option description',
      default: 'default-value',
    }),
  };
  
  static args = {
    file: Args.string({
      description: 'File to process',
    }),
  };
  
  async run(): Promise<void> {
    const { args, flags } = await this.parse(MyCommand);
    
    this.log('Running my command...');
    this.log(`File: ${args.file}`);
    this.log(`Option: ${flags.option}`);
    
    // 执行逻辑
    const result = await this.execute(args.file, flags.option);
    
    this.log('Command completed successfully');
  }
  
  private async execute(file: string, option: string): Promise<void> {
    // 实现逻辑
  }
}
```

**输出格式化**

```typescript
// src/cli/output/formatter.ts
import chalk from 'chalk';
import ora from 'ora';

export class OutputFormatter {
  private spinner = ora();
  
  start(message: string): void {
    this.spinner.start(message);
  }
  
  succeed(message: string): void {
    this.spinner.succeed(message);
  }
  
  fail(message: string): void {
    this.spinner.fail(message);
  }
  
  info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
  }
  
  warn(message: string): void {
    console.log(chalk.yellow('⚠'), message);
  }
  
  error(message: string): void {
    console.log(chalk.red('✖'), message);
  }
  
  table(data: any[], columns: string[]): void {
    console.table(data, columns);
  }
  
  json(data: any): void {
    console.log(JSON.stringify(data, null, 2));
  }
}
```

### 3.2 Skills 开发

**创建新 Skill**

```typescript
// src/skills/builtin/my-skill/index.ts
import { BaseSkill, SkillContext, Diagnosis, Fix } from '../../base-skill';

export default class MySkill extends BaseSkill {
  name = 'my-skill';
  version = '1.0.0';
  description = 'My custom diagnostic skill';
  
  triggers = [
    { type: 'command', pattern: 'my-skill' },
    { type: 'keyword', pattern: /check my feature/i },
  ];
  
  capabilities = [
    {
      name: 'feature-check',
      description: 'Check feature implementation',
      autoFixable: true,
      riskLevel: 'low',
    },
  ];
  
  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];
    
    // 1. 获取项目文件
    const files = await context.tools.fs.glob('src/**/*.ts');
    
    // 2. 分析文件
    for (const file of files) {
      const content = await context.tools.fs.readFile(file);
      const issues = await this.analyzeFile(content, file);
      diagnoses.push(...issues);
    }
    
    return diagnoses;
  }
  
  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    // 生成修复方案
    const fix = await this.generateFix(diagnosis, context);
    return fix;
  }
  
  private async analyzeFile(content: string, file: string): Promise<Diagnosis[]> {
    // 实现分析逻辑
    return [];
  }
  
  private async generateFix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    // 实现修复逻辑
    return {
      id: 'fix-001',
      diagnosisId: diagnosis.id,
      description: 'Fix description',
      changes: [],
      riskLevel: 'low',
      autoApplicable: true,
    };
  }
}
```

**Skill 配置文件**

```yaml
# src/skills/builtin/my-skill/skill.yaml
name: my-skill
version: 1.0.0
description: My custom diagnostic skill
author: Your Name

triggers:
  - type: command
    pattern: my-skill
  - type: keyword
    pattern: /check my feature/i

capabilities:
  - name: feature-check
    description: Check feature implementation
    autoFixable: true
    riskLevel: low

dependencies:
  - playwright

config:
  defaultOption: value
```

### 3.3 诊断引擎开发

**实现诊断分析器**

```typescript
// src/engines/diagnosis/analyzer.ts
import { Diagnosis, AnalysisContext } from './types';

export interface Analyzer {
  analyze(diagnosis: Diagnosis, context: AnalysisContext): Promise<AnalysisResult>;
}

export class CodeAnalyzer implements Analyzer {
  async analyze(diagnosis: Diagnosis, context: AnalysisContext): Promise<AnalysisResult> {
    // 1. 读取相关代码
    const code = await context.fs.readFile(diagnosis.location.file);
    
    // 2. 解析 AST
    const ast = this.parseCode(code);
    
    // 3. 分析问题
    const analysis = this.analyzeAst(ast, diagnosis);
    
    return {
      diagnosis,
      rootCause: analysis.rootCause,
      relatedCode: analysis.relatedCode,
      suggestions: analysis.suggestions,
    };
  }
  
  private parseCode(code: string): any {
    // 使用 TypeScript/Babel 解析
  }
  
  private analyzeAst(ast: any, diagnosis: Diagnosis): any {
    // 分析 AST
  }
}
```

### 3.4 修复引擎开发

**实现修复生成器**

```typescript
// src/engines/fix/generator.ts
import { Diagnosis, Fix, FixContext } from './types';

export interface FixGenerator {
  generate(diagnosis: Diagnosis, context: FixContext): Promise<Fix>;
}

export class A11yFixGenerator implements FixGenerator {
  async generate(diagnosis: Diagnosis, context: FixContext): Promise<Fix> {
    const ruleId = diagnosis.metadata?.ruleId;
    
    const generator = this.getGenerator(ruleId);
    return generator(diagnosis, context);
  }
  
  private getGenerator(ruleId: string): (d: Diagnosis, c: FixContext) => Promise<Fix> {
    const generators: Record<string, (d: Diagnosis, c: FixContext) => Promise<Fix>> = {
      'label': this.generateLabelFix.bind(this),
      'aria-label': this.generateAriaLabelFix.bind(this),
      'color-contrast': this.generateContrastFix.bind(this),
    };
    
    return generators[ruleId] || this.generateGenericFix.bind(this);
  }
  
  private async generateLabelFix(diagnosis: Diagnosis, context: FixContext): Promise<Fix> {
    const { location } = diagnosis;
    const content = await context.tools.fs.readFile(location.file);
    
    // 解析代码，找到 input 元素
    const ast = this.parse(content);
    const inputElement = this.findElement(ast, location);
    
    // 生成 label
    const labelElement = this.createLabel(inputElement);
    
    return {
      id: this.generateId(),
      diagnosisId: diagnosis.id,
      description: `Add label for input element`,
      changes: [{
        file: location.file,
        type: 'insert',
        position: inputElement.loc.start,
        content: labelElement,
      }],
      riskLevel: 'low',
      autoApplicable: true,
    };
  }
}
```

### 3.5 模型服务开发

**实现模型提供者**

```typescript
// src/models/providers/openai.ts
import OpenAI from 'openai';
import { ModelProvider, ModelRequest, ModelResponse } from '../types';

export class OpenAIProvider implements ModelProvider {
  name = 'openai';
  private client: OpenAI;
  private model: string;
  
  constructor(config: { apiKey: string; model: string }) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model;
  }
  
  async chat(request: ModelRequest): Promise<ModelResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
    });
    
    return {
      content: response.choices[0].message.content || '',
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  }
  
  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    
    return response.data[0].embedding;
  }
}
```

---

## 四、测试指南

### 4.1 单元测试

```typescript
// tests/unit/skills/e2e.test.ts
import { describe, it, expect, vi } from 'vitest';
import E2ESkill from '../../../src/skills/builtin/e2e';

describe('E2E Skill', () => {
  it('should generate test from natural language', async () => {
    const skill = new E2ESkill();
    const context = createMockContext();
    
    const result = await skill.generateTest('测试用户登录功能', context);
    
    expect(result).toBeDefined();
    expect(result.code).toContain('test(');
    expect(result.code).toContain('login');
  });
  
  it('should detect selector issues', async () => {
    const skill = new E2ESkill();
    const diagnosis = createMockDiagnosis('selector_not_found');
    
    const rootCause = await skill.analyzeRootCause(diagnosis);
    
    expect(rootCause.type).toBe('selector');
    expect(rootCause.confidence).toBeGreaterThan(0.8);
  });
});
```

### 4.2 集成测试

```typescript
// tests/integration/diagnose.test.ts
import { describe, it, expect } from 'vitest';
import { QAAgent } from '../../../src';

describe('Diagnose Command', () => {
  it('should run all skills and generate report', async () => {
    const agent = new QAAgent();
    
    const result = await agent.diagnose({
      path: './tests/fixtures/sample-project',
      skills: ['e2e', 'a11y'],
    });
    
    expect(result.summary.totalIssues).toBeGreaterThan(0);
    expect(result.report).toBeDefined();
  });
  
  it('should fix issues and verify', async () => {
    const agent = new QAAgent();
    
    // 诊断
    const diagnoseResult = await agent.diagnose({
      path: './tests/fixtures/sample-project',
      skills: ['a11y'],
    });
    
    // 修复
    const fixResult = await agent.fix({
      issueIds: [diagnoseResult.issues[0].id],
      autoApprove: ['low'],
    });
    
    expect(fixResult.success).toBe(true);
    
    // 验证
    const verifyResult = await agent.verify(fixResult.fixes[0]);
    expect(verifyResult.success).toBe(true);
  });
});
```

### 4.3 E2E 测试

```typescript
// tests/e2e/cli.test.ts
import { describe, it, expect } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('CLI E2E', () => {
  it('should show help', async () => {
    const { stdout } = await execAsync('node dist/cli/index.js --help');
    
    expect(stdout).toContain('qa-agent');
    expect(stdout).toContain('diagnose');
    expect(stdout).toContain('fix');
  });
  
  it('should diagnose a project', async () => {
    const { stdout } = await execAsync(
      'node dist/cli/index.js diagnose --path ./tests/fixtures/sample-project'
    );
    
    expect(stdout).toContain('Diagnosis completed');
    expect(stdout).toContain('issues found');
  });
});
```

---

## 五、调试指南

### 5.1 日志调试

```typescript
// 启用调试日志
process.env.LOG_LEVEL = 'debug';

// 使用 logger
import { logger } from './utils/logger';

logger.debug('Detailed information', { data });
logger.info('General information');
logger.warn('Warning message');
logger.error('Error message', { error });
```

### 5.2 断点调试

**VS Code launch.json**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug CLI",
      "runtimeExecutable": "node",
      "runtimeArgs": ["--loader", "ts-node/esm", "src/cli/index.ts"],
      "args": ["diagnose", "--path", "./tests/fixtures/sample-project"],
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

### 5.3 常见问题

**问题 1: Playwright 浏览器未安装**

```bash
# 解决方案
pnpm exec playwright install
```

**问题 2: 模型 API 超时**

```typescript
// 增加超时时间
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000, // 60 秒
});
```

**问题 3: 内存不足**

```bash
# 增加 Node.js 内存限制
NODE_OPTIONS="--max-old-space-size=4096" pnpm run dev
```

---

## 六、发布流程

### 6.1 版本管理

```bash
# 补丁版本
pnpm version patch

# 小版本
pnpm version minor

# 大版本
pnpm version major
```

### 6.2 发布前检查

```bash
# 运行所有测试
pnpm run test:all

# 类型检查
pnpm run typecheck

# Lint 检查
pnpm run lint

# 构建
pnpm run build
```

### 6.3 发布到 npm

```bash
# 登录 npm
npm login

# 发布
npm publish

# 发布 beta 版本
npm publish --tag beta
```

---

## 七、贡献指南

### 7.1 代码规范

- 使用 TypeScript，所有代码必须有类型定义
- 遵循 ESLint 规则
- 函数和类必须有 JSDoc 注释
- 单元测试覆盖率 > 80%

### 7.2 提交规范

```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型**
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具

**示例**

```
feat(e2e): add natural language test generation

Add support for generating Playwright tests from natural language
descriptions using LLM.

Closes #123
```

### 7.3 PR 流程

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request
6. 等待代码审查
7. 合并到 main 分支

---

## 八、扩展开发

### 8.1 创建自定义 Skill

```bash
# 使用脚手架创建
qa-agent skill create my-custom-skill

# 生成的结构
my-custom-skill/
├── skill.yaml          # Skill 配置
├── index.ts            # Skill 入口
├── README.md           # 文档
└── tests/
    └── index.test.ts   # 测试
```

**skill.yaml**

```yaml
name: my-custom-skill
version: 1.0.0
description: My custom diagnostic skill
author: Your Name

triggers:
  - type: command
    pattern: my-custom

capabilities:
  - name: custom-check
    description: Custom diagnostic check
    autoFixable: true
    riskLevel: low

dependencies:
  - some-package

config:
  option1: default-value
```

**index.ts**

```typescript
import { BaseSkill, SkillContext, Diagnosis, Fix } from 'qa-agent';

export default class MyCustomSkill extends BaseSkill {
  name = 'my-custom-skill';
  version = '1.0.0';
  description = 'My custom diagnostic skill';
  
  triggers = [
    { type: 'command', pattern: 'my-custom' },
  ];
  
  capabilities = [
    {
      name: 'custom-check',
      description: 'Custom diagnostic check',
      autoFixable: true,
      riskLevel: 'low',
    },
  ];
  
  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    // 实现诊断逻辑
    return [];
  }
  
  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    // 实现修复逻辑
    return {
      id: 'fix-001',
      diagnosisId: diagnosis.id,
      description: 'Fix description',
      changes: [],
      riskLevel: 'low',
      autoApplicable: true,
    };
  }
}
```

### 8.2 集成第三方工具

```typescript
// src/tools/custom-tool.ts
import { Tool } from './types';

export class CustomTool implements Tool {
  name = 'custom-tool';
  
  async execute(input: any): Promise<any> {
    // 实现工具逻辑
  }
}

// 注册工具
// src/tools/index.ts
import { CustomTool } from './custom-tool';

export const tools = {
  custom: new CustomTool(),
};
```

---

## 九、性能优化

### 9.1 懒加载

```typescript
// 懒加载 Skill
class SkillLoader {
  private cache = new Map<string, Promise<Skill>>();
  
  async load(name: string): Promise<Skill> {
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }
    
    const promise = this.doLoad(name);
    this.cache.set(name, promise);
    return promise;
  }
  
  private async doLoad(name: string): Promise<Skill> {
    const module = await import(`./builtin/${name}`);
    return new module.default();
  }
}
```

### 9.2 并行执行

```typescript
// 并行执行多个 Skill
async function diagnoseParallel(skills: Skill[], context: SkillContext): Promise<Diagnosis[]> {
  const results = await Promise.all(
    skills.map(skill => skill.diagnose(context))
  );
  
  return results.flat();
}
```

### 9.3 缓存优化

```typescript
// 文件内容缓存
class FileCache {
  private cache = new Map<string, { content: string; hash: string }>();
  
  async readFile(path: string): Promise<string> {
    const hash = await this.hashFile(path);
    const cached = this.cache.get(path);
    
    if (cached && cached.hash === hash) {
      return cached.content;
    }
    
    const content = await fs.readFile(path, 'utf-8');
    this.cache.set(path, { content, hash });
    return content;
  }
}
```

---

## 十、常见问题

### Q1: 如何添加新的诊断规则？

在对应 Skill 的 `diagnose` 方法中添加新的检测逻辑。

### Q2: 如何支持新的模型？

实现 `ModelProvider` 接口，并在 `ModelRouter` 中注册。

### Q3: 如何自定义报告格式？

实现 `ReportGenerator` 接口，或在配置中指定自定义模板。

### Q4: 如何处理大型项目？

使用增量分析、并行执行、缓存优化。

### Q5: 如何保证修复的安全性？

通过风险评估、变更预览、自动验证三层保障。

---

## 十一、CI/CD 集成方案

CLI 最终要跑在服务器上，不仅仅是开发者的本地电脑。提供完整的 CI/CD 集成方案。

### 11.1 GitHub Actions 集成

#### 基础配置

```yaml
# .github/workflows/qa-check.yml
name: QA Check

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  qa:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # 完整历史用于增量分析
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install Dependencies
        run: npm ci
      
      - name: Install QA-Agent
        run: npm install -g qa-agent
      
      - name: Install Playwright Browsers
        run: npx playwright install --with-deps
      
      - name: Run QA Diagnosis
        run: |
          qa-agent diagnose \
            --skills=e2e,a11y,perf,security \
            --output=json \
            --output-file=qa-report.json \
            --fail-on=critical
      
      - name: Upload Report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: qa-report
          path: |
            qa-report.json
            .qa-agent/reports/
          retention-days: 30
      
      - name: Comment PR
        uses: actions/github-script@v7
        if: github.event_name == 'pull_request'
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('qa-report.json', 'utf8'));
            
            const body = `## 🔍 QA-Agent Report
            
            **Score: ${report.summary.score}/100** | **${report.summary.totalIssues} issues found**
            
            | Dimension | Score | Issues |
            |-----------|-------|--------|
            | Functionality | ${report.dimensions.functionality}% | ${report.issues.filter(i => i.skill === 'e2e').length} |
            | Accessibility | ${report.dimensions.accessibility}% | ${report.issues.filter(i => i.skill === 'a11y').length} |
            | Performance | ${report.dimensions.performance}% | ${report.issues.filter(i => i.skill === 'perf').length} |
            | Security | ${report.dimensions.security}% | ${report.issues.filter(i => i.skill === 'security').length} |
            
            ${report.summary.critical > 0 ? '### 🔴 Critical Issues\\n' + report.issues.filter(i => i.severity === 'critical').map(i => `- **${i.id}**: ${i.title}`).join('\\n') : ''}
            
            ---
            
            Run \`qa-agent fix\` locally to resolve ${report.summary.autoFixable} auto-fixable issues.
            `;
            
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: body
            });
```

#### 质量门禁配置

```yaml
# .github/workflows/quality-gate.yml
name: Quality Gate

on:
  pull_request:
    branches: [main]

jobs:
  quality-gate:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install QA-Agent
        run: npm install -g qa-agent
      
      - name: Run Quality Gate Check
        id: quality
        run: |
          qa-agent diagnose \
            --skills=e2e,a11y,security \
            --output=json \
            --output-file=report.json \
            --gate=release
          
          # 解析结果
          SCORE=$(jq -r '.summary.score' report.json)
          CRITICAL=$(jq -r '.summary.critical' report.json)
          
          echo "score=$SCORE" >> $GITHUB_OUTPUT
          echo "critical=$CRITICAL" >> $GITHUB_OUTPUT
          
          # 门禁检查
          if [ "$SCORE" -lt 80 ]; then
            echo "::error::Quality score ($SCORE) is below threshold (80)"
            exit 1
          fi
          
          if [ "$CRITICAL" -gt 0 ]; then
            echo "::error::Found $CRITICAL critical issues"
            exit 1
          fi
      
      - name: Update Status Badge
        run: |
          # 更新 README 中的徽章
          SCORE=${{ steps.quality.outputs.score }}
          COLOR="green"
          if [ "$SCORE" -lt 80 ]; then COLOR="yellow"; fi
          if [ "$SCORE" -lt 60 ]; then COLOR="red"; fi
          
          echo "Quality Score: $SCORE ($COLOR)"
```

### 11.2 GitLab CI 集成

```yaml
# .gitlab-ci.yml
stages:
  - test
  - quality
  - deploy

qa-check:
  stage: quality
  image: node:20
  cache:
    paths:
      - node_modules/
      - .qa-agent/cache/
  
  before_script:
    - npm ci
    - npm install -g qa-agent
    - npx playwright install
  
  script:
    - qa-agent diagnose
        --skills=e2e,a11y,perf,security
        --output=json
        --output-file=qa-report.json
        --fail-on=critical
  
  artifacts:
    when: always
    paths:
      - qa-report.json
      - .qa-agent/reports/
    expire_in: 30 days
  
  # 质量门禁
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      allow_failure: false
    - if: $CI_COMMIT_BRANCH == "main"
      allow_failure: false
    - allow_failure: true

# 合并请求评论
mr-comment:
  stage: quality
  image: node:20
  needs: [qa-check]
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - |
      REPORT=$(cat qa-report.json)
      SCORE=$(echo $REPORT | jq -r '.summary.score')
      ISSUES=$(echo $REPORT | jq -r '.summary.totalIssues')
      
      curl -X POST \
        -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"body\": \"## QA-Agent Report\n\n**Score: $SCORE/100** | **$ISSUES issues found**\n\n[View Full Report]($CI_PROJECT_URL/-/jobs/$CI_JOB_ID/artifacts/file/.qa-agent/reports/latest.html)\"}" \
        "$CI_API_V4_URL/projects/$CI_PROJECT_ID/merge_requests/$CI_MERGE_REQUEST_IID/notes"
```

### 11.3 Jenkins 集成

```groovy
// Jenkinsfile
pipeline {
  agent any
  
  stages {
    stage('Install') {
      steps {
        sh 'npm ci'
        sh 'npm install -g qa-agent'
        sh 'npx playwright install'
      }
    }
    
    stage('QA Check') {
      steps {
        sh '''
          qa-agent diagnose \
            --skills=e2e,a11y,perf,security \
            --output=json \
            --output-file=qa-report.json
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'qa-report.json, .qa-agent/reports/**/*', allowEmptyArchive: true
          publishHTML target: [
            allowMissing: true,
            alwaysLinkToLastBuild: true,
            keepAll: true,
            reportDir: '.qa-agent/reports',
            reportFiles: 'latest.html',
            reportName: 'QA Report'
          ]
        }
      }
    }
    
    stage('Quality Gate') {
      steps {
        script {
          def report = readJSON file: 'qa-report.json'
          
          if (report.summary.score < 80) {
            error "Quality score (${report.summary.score}) is below threshold (80)"
          }
          
          if (report.summary.critical > 0) {
            error "Found ${report.summary.critical} critical issues"
          }
        }
      }
    }
  }
  
  post {
    failure {
      emailext (
        subject: "QA Check Failed: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
        body: """
          QA Check failed!
          
          Job: ${env.JOB_NAME}
          Build: ${env.BUILD_NUMBER}
          URL: ${env.BUILD_URL}
          
          Please check the QA Report for details.
        """,
        to: '${env.CHANGE_AUTHOR_EMAIL}'
      )
    }
  }
}
```

### 11.4 失败门禁配置

定义什么样的错误级别会触发 CI 失败。

```yaml
# .qa-agent/gates.yaml
gates:
  # 发布门禁 - 最严格
  release:
    minScore: 80
    maxCritical: 0
    maxWarning: 5
    blockOn:
      - security.critical
      - accessibility.critical
    dimensions:
      security: 90
      accessibility: 70
      performance: 60
      
  # PR 门禁 - 中等严格
  pull_request:
    minScore: 70
    maxCritical: 2
    blockOn:
      - security.critical
    warnOn:
      - accessibility.warning
      - performance.warning
      
  # 开发门禁 - 宽松
  development:
    minScore: 60
    warnOn:
      - security.critical
      - accessibility.critical
      
  # 合规门禁 - 特定检查
  compliance:
    blockOn:
      - security.critical
      - security.high
      - accessibility.critical
    dimensions:
      security: 95
      accessibility: 80
```

### 11.5 通知集成

#### Slack 通知

```yaml
# .github/workflows/qa-check.yml (续)
      - name: Notify Slack
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          channel-id: 'C0123456789'
          slack-message: |
            :x: QA Check Failed
            
            *Repository:* ${{ github.repository }}
            *Branch:* ${{ github.ref_name }}
            *Commit:* ${{ github.sha }}
            
            <${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Details>
        env:
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

#### 飞书通知

```yaml
      - name: Notify Feishu
        if: failure()
        run: |
          curl -X POST \
            -H 'Content-Type: application/json' \
            -d '{
              "msg_type": "interactive",
              "card": {
                "header": {
                  "title": { "tag": "plain_text", "content": "QA Check Failed" },
                  "template": "red"
                },
                "elements": [
                  { "tag": "div", "text": { "tag": "lark_md", "content": "**Repository:** ${{ github.repository }}\n**Branch:** ${{ github.ref_name }}" } },
                  { "tag": "action", "actions": [{ "tag": "button", "text": { "tag": "plain_text", "content": "View Details" }, "url": "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}" }] }
                ]
              }
            }' \
            ${{ secrets.FEISHU_WEBHOOK }}
```

### 11.6 缓存优化

在 CI 中复用缓存，加速诊断过程。

```yaml
      - name: Cache QA-Agent
        uses: actions/cache@v4
        with:
          path: |
            ~/.cache/qa-agent
            .qa-agent/cache
          key: qa-agent-${{ runner.os }}-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            qa-agent-${{ runner.os }}-
```

### 11.7 矩阵测试

在多个环境下运行测试。

```yaml
jobs:
  qa-matrix:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [18, 20, 22]
      fail-fast: false
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js ${{ matrix.node }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      
      - name: Run QA Check
        run: qa-agent diagnose --skills=e2e,a11y
```

### 11.8 定时扫描

定期扫描项目质量。

```yaml
name: Scheduled QA Scan

on:
  schedule:
    # 每天 UTC 0:00 运行
    - cron: '0 0 * * *'
  workflow_dispatch:

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Full Scan
        run: |
          qa-agent diagnose \
            --skills=all \
            --comprehensive \
            --output=json \
            --output-file=daily-scan.json
      
      - name: Check Score Trend
        run: |
          # 获取历史评分
          PREV_SCORE=$(gh api repos/$GITHUB_REPOSITORY/contents/.qa-agent/last-score.json --jq '.score' 2>/dev/null || echo "0")
          CURRENT_SCORE=$(jq -r '.summary.score' daily-scan.json)
          
          echo "Previous: $PREV_SCORE, Current: $CURRENT_SCORE"
          
          # 如果下降超过 5 分，发送告警
          if [ "$((PREV_SCORE - CURRENT_SCORE))" -gt 5 ]; then
            echo "::warning::Quality score dropped by more than 5 points"
          fi
          
          # 更新历史记录
          echo "{\"score\": $CURRENT_SCORE, \"date\": \"$(date -I)\"}" > .qa-agent/last-score.json
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 11.9 Docker 镜像

提供官方 Docker 镜像，简化 CI 配置。

```dockerfile
# Dockerfile
FROM node:20-slim

# 安装依赖
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# 安装 Playwright 依赖
RUN npx playwright install-deps

# 安装 QA-Agent
RUN npm install -g qa-agent

# 安装 Playwright 浏览器
RUN npx playwright install

WORKDIR /app

ENTRYPOINT ["qa-agent"]
CMD ["--help"]
```

**使用方式**

```yaml
jobs:
  qa:
    runs-on: ubuntu-latest
    container:
      image: qa-agent/runner:latest
    steps:
      - uses: actions/checkout@v4
      - run: qa-agent diagnose
```
