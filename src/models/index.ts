/**
 * Model Client
 * Provides LLM integration for diagnosis and fix generation
 */

import { ModelClient, ModelMessage } from '../types';

/**
 * Create model client
 */
export function createModelClient(): ModelClient {
  // For MVP, use a simple mock that returns helpful responses
  // In production, this would integrate with OpenAI, Claude, etc.
  
  return {
    async chat(messages: ModelMessage[]): Promise<string> {
      // Mock implementation for MVP
      // In production, this would call actual LLM API
      
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage) {
        return '请提供更多信息';
      }
      
      // Simple pattern matching for common requests
      if (lastMessage.content.includes('Playwright 测试')) {
        return generateMockPlaywrightTest(lastMessage.content);
      }
      
      if (lastMessage.content.includes('可访问性') || lastMessage.content.includes('accessibility')) {
        return generateMockA11yAdvice(lastMessage.content);
      }
      
      return `我理解您的请求。这是一个 MVP 版本，完整的 AI 功能将在后续版本中提供。

您的请求: ${lastMessage.content.slice(0, 100)}...

要启用完整的 AI 功能，请配置 API Key:

\`\`\`bash
export OPENAI_API_KEY=your-key
# 或
export ANTHROPIC_API_KEY=your-key
\`\`\``;
    },

    async embed(_text: string): Promise<number[]> {
      // Mock embedding - returns random vector
      return Array(384).fill(0).map(() => Math.random() * 2 - 1);
    },
  };
}

/**
 * Generate mock Playwright test
 */
function generateMockPlaywrightTest(description: string): string {
  return `import { test, expect } from '@playwright/test';

test.describe('Generated Test', () => {
  test('should work correctly', async ({ page }) => {
    // Navigate to the page
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // TODO: Add specific test steps based on:
    // ${description}
    
    // Example assertion
    await expect(page).toHaveTitle(/.*/);
  });
});`;
}

/**
 * Generate mock accessibility advice
 */
function generateMockA11yAdvice(_description: string): string {
  return `可访问性建议:

1. 确保所有图片都有 alt 属性
2. 使用语义化 HTML 标签
3. 确保色彩对比度符合 WCAG 标准
4. 为交互元素添加键盘支持
5. 使用 ARIA 属性增强可访问性

具体建议:
- 检查所有 <img> 标签是否有 alt 属性
- 确保表单元素有对应的 <label>
- 验证焦点顺序是否合理

运行 \`qa-agent diagnose --skills=a11y\` 获取详细诊断结果。`;
}

/**
 * Create OpenAI client (for future use)
 */
export function createOpenAIClient(_apiKey: string): ModelClient {
  // Placeholder for OpenAI integration
  return createModelClient();
}

/**
 * Create Claude client (for future use)
 */
export function createClaudeClient(_apiKey: string): ModelClient {
  // Placeholder for Claude integration
  return createModelClient();
}
