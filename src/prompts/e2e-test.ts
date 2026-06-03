/**
 * E2E test generation prompt templates
 *
 * 用法：根据自然语言描述生成 Playwright 测试代码。
 */

import { registerPrompt, type PromptTemplate } from './index';

const E2E_TESTGEN_SYSTEM = `你是一个专业的测试工程师，擅长编写 Playwright E2E 测试。

要求：
- 使用 TypeScript
- 优先使用语义化选择器：getByRole, getByText, getByTestId, getByLabel
- 每个测试用例必须有清晰的断言（toBeVisible, toHaveText 等）
- 添加关键步骤的注释
- 只输出测试代码，不要其他解释`;

const E2E_TESTGEN_USER = `根据以下描述生成 Playwright 测试代码。

描述: {{description}}

要求:
1. 使用 TypeScript
2. 使用语义化选择器 (getByRole, getByText, getByTestId)
3. 包含适当的断言
4. 添加清晰的注释

请只输出测试代码，不要其他解释。`;

const templates: PromptTemplate[] = [
  {
    id: 'e2e-testgen',
    version: '1.0.0',
    system: E2E_TESTGEN_SYSTEM,
    user: E2E_TESTGEN_USER,
    expectJson: false,
  },
];

for (const t of templates) registerPrompt(t);
