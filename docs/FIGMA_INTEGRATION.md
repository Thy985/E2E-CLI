# Figma Integration Guide

QA-Agent 提供强大的 Figma 集成功能，让设计与开发无缝协作。

## 功能概览

- ✅ **设计令牌同步**：从 Figma 提取颜色、字体、间距等设计规范
- ✅ **设计对比**：对比代码实现与 Figma 设计稿的差异
- ✅ **设计文档导出**：自动生成设计规范文档

---

## 前置准备

### 1. 获取 Figma Access Token

1. 登录 [Figma](https://www.figma.com/)
2. 进入 **Settings** → **Personal Access Tokens**
3. 点击 **Generate new token**
4. 复制 token 并保存

### 2. 获取 Figma File Key

从 Figma 文件 URL 中提取 file key：

```
https://www.figma.com/file/FILE_KEY/File-Name
                              ^^^^^^^^
                              这就是 file key
```

### 3. 设置环境变量

```bash
# Windows
set FIGMA_ACCESS_TOKEN=your_token_here

# macOS/Linux
export FIGMA_ACCESS_TOKEN=your_token_here
```

---

## 使用指南

### 1. 同步设计令牌

从 Figma 提取设计令牌并同步到项目：

```bash
# 同步为 CSS 变量
qa-agent design sync \
  --file YOUR_FILE_KEY \
  --format css \
  --output src/styles/tokens.css

# 同步为 SCSS 变量
qa-agent design sync \
  --file YOUR_FILE_KEY \
  --format scss \
  --output src/styles/_tokens.scss

# 同步为 TypeScript
qa-agent design sync \
  --file YOUR_FILE_KEY \
  --format ts \
  --output src/tokens/index.ts

# 使用自定义前缀
qa-agent design sync \
  --file YOUR_FILE_KEY \
  --format css \
  --prefix my-app
```

**生成的 CSS 示例：**

```css
:root {
  --color-primary: #1890ff;
  --color-secondary: #52c41a;
  --color-error: #ff4d4f;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --radius-sm: 4px;
  --radius-md: 8px;
}
```

### 2. 对比设计与代码

检查代码实现是否符合 Figma 设计规范：

```bash
# 对比并输出到终端
qa-agent design compare \
  --file YOUR_FILE_KEY \
  --path ./your-project

# 生成对比报告
qa-agent design compare \
  --file YOUR_FILE_KEY \
  --path ./your-project \
  --output DESIGN_COMPARISON.md
```

**对比报告示例：**

```markdown
# Figma Design Comparison Report

## Summary

- **Match Rate**: 85.7%
- **Matches**: 12
- **Mismatches**: 2
- **Missing**: 1
- **Extra**: 0

## Mismatches

| Name | Figma | Code |
|------|-------|------|
| color/primary | #1890ff | #1890fe |
| spacing/md | 16px | 15px |

## Missing in Code

| Name | Figma Value |
|------|-------------|
| color/warning | #faad14 |
```

### 3. 导出设计文档

生成项目的设计规范文档：

```bash
qa-agent design export \
  --path ./your-project \
  --output DESIGN_TOKENS.md
```

**生成的文档示例：**

```markdown
# Design Tokens

## Colors

| Name | Value |
|------|-------|
| color-primary | #1890ff |
| color-secondary | #52c41a |
| color-error | #ff4d4f |

## Spacing

| Name | Value |
|------|-------|
| spacing-sm | 8px |
| spacing-md | 16px |
| spacing-lg | 24px |
```

---

## 工作流集成

### CI/CD 集成

在 CI/CD 中自动检查设计一致性：

```yaml
# .github/workflows/design-check.yml
name: Design Check

on: [push, pull_request]

jobs:
  design-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install QA-Agent
        run: npm install -g qa-agent
      
      - name: Compare with Figma
        env:
          FIGMA_ACCESS_TOKEN: ${{ secrets.FIGMA_ACCESS_TOKEN }}
        run: |
          qa-agent design compare \
            --file ${{ secrets.FIGMA_FILE_KEY }} \
            --path . \
            --output design-report.md
      
      - name: Upload Report
        uses: actions/upload-artifact@v3
        with:
          name: design-report
          path: design-report.md
```

### 定期同步

使用 cron job 定期同步设计令牌：

```yaml
# .github/workflows/sync-design.yml
name: Sync Design Tokens

on:
  schedule:
    - cron: '0 0 * * 1'  # 每周一凌晨
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Sync from Figma
        env:
          FIGMA_ACCESS_TOKEN: ${{ secrets.FIGMA_ACCESS_TOKEN }}
        run: |
          qa-agent design sync \
            --file ${{ secrets.FIGMA_FILE_KEY }} \
            --format css
      
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v5
        with:
          title: 'chore: sync design tokens from Figma'
          body: 'Auto-generated PR to sync design tokens'
          branch: sync-design-tokens
```

---

## 最佳实践

### 1. 设计令牌命名规范

在 Figma 中使用清晰的命名：

```
✅ 推荐：
- color/primary
- color/secondary
- spacing/sm
- spacing/md

❌ 避免：
- blue
- red
- 8px
- 16px
```

### 2. 定期同步

- 每次设计更新后同步
- 在 CI/CD 中自动检查
- 使用版本控制跟踪变更

### 3. 文档化

- 导出设计文档到项目
- 在 README 中说明设计规范
- 团队共享 Figma 文件链接

---

## 故障排除

### Token 无效

```bash
❌ Figma API error: 403 Forbidden
```

**解决方案：**
1. 检查 token 是否正确
2. 确认 token 有文件访问权限
3. 重新生成 token

### File Key 错误

```bash
❌ Figma API error: 404 Not Found
```

**解决方案：**
1. 检查 file key 是否正确
2. 确认文件是否存在
3. 确认有文件访问权限

### 提取不到设计令牌

**可能原因：**
1. Figma 文件中没有定义样式
2. 样式命名不规范
3. 使用了旧版 Figma 功能

**解决方案：**
1. 在 Figma 中创建颜色/文本样式
2. 使用 Figma 变量功能
3. 按照命名规范组织样式

---

## 示例项目

查看完整示例：

```bash
git clone https://github.com/qa-agent/examples
cd examples/figma-integration
qa-agent design sync --file YOUR_FILE_KEY
```

---

## 相关资源

- [Figma API 文档](https://www.figma.com/developers/api)
- [设计令牌规范](https://design-tokens.github.io/community-group/)
- [QA-Agent 文档](https://qa-agent.dev/docs)

---

*最后更新: 2026-04-29*
