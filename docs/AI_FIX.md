# AI Fix Engine

> 突破规则引擎限制，实现智能自动修复

## 概述

AI Fix Engine 使用 LLM (Large Language Model) 来生成智能修复代码，突破传统规则引擎的修复能力上限。

## 修复能力对比

| 修复方式 | 覆盖率 | 适用场景 | 优点 | 缺点 |
|---------|--------|---------|------|------|
| **规则引擎** | ~50% | 简单、标准化问题 | 快速、确定性强、无需网络 | 无法处理复杂逻辑 |
| **AI 辅助** | +30% | 复杂、上下文相关的问题 | 智能、灵活、可处理复杂情况 | 需要 API key、有成本 |
| **混合模式** | ~85% | 所有场景 | 最佳平衡 | 需要配置 |

## 配置

### 环境变量

```bash
# OpenAI API (推荐)
export OPENAI_API_KEY=sk-xxx

# 或自定义 LLM 端点
export LLM_BASE_URL=https://api.openai.com/v1
export LLM_MODEL=gpt-4
```

### 配置文件

```yaml
# .qa-agent/config.yml
ai_fix:
  enabled: true
  model: gpt-4
  temperature: 0.3
  max_tokens: 2000
  
  # 风险等级控制
  auto_approve:
    low: true      # 自动批准低风险修复
    medium: false  # 人工确认中风险修复
    high: false    # 从不自动批准高风险修复
```

## 使用方式

### 1. 自动使用 AI 修复

当规则引擎无法修复时，自动尝试 AI 修复：

```bash
qa-agent fix --batch --path ./my-project
```

### 2. 仅使用规则引擎

```bash
qa-agent fix --batch --no-ai --path ./my-project
```

### 3. 预览 AI 生成的修复

```bash
qa-agent fix --batch --preview --path ./my-project
```

## AI 修复流程

```
┌─────────────────┐
│  检测问题        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 规则引擎能否修复? │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
   能         不能
   │          │
   ▼          ▼
┌──────┐   ┌─────────────────┐
│应用修复│   │ AI Fix Engine   │
└──────┘   │ 1. 构建 Prompt  │
           │ 2. 调用 LLM      │
           │ 3. 解析响应      │
           │ 4. 验证修复      │
           └────────┬────────┘
                    │
                    ▼
           ┌─────────────────┐
           │  应用 AI 生成的修复 │
           └─────────────────┘
```

## 支持的 AI 修复场景

### 1. 复杂 CSS 重构

**问题**：深层嵌套的选择器

```css
/* Before */
.nav .list .item .link .icon {
  color: red;
}

/* AI 生成的修复 */
.nav-link-icon {
  color: red;
}
```

### 2. JavaScript 逻辑优化

**问题**：DOM 操作在循环中

```javascript
// Before
for (let i = 0; i < items.length; i++) {
  document.getElementById('list').innerHTML += `<li>${items[i]}</li>`;
}

// AI 生成的修复
const list = document.getElementById('list');
const fragment = document.createDocumentFragment();
for (let i = 0; i < items.length; i++) {
  const li = document.createElement('li');
  li.textContent = items[i];
  fragment.appendChild(li);
}
list.appendChild(fragment);
```

### 3. 智能 ARIA 标签生成

**问题**：复杂的组件缺少 ARIA 标签

```html
<!-- Before -->
<div class="tabs">
  <div class="tab">Tab 1</div>
  <div class="tab">Tab 2</div>
</div>

<!-- AI 生成的修复 -->
<div class="tabs" role="tablist">
  <div class="tab" role="tab" aria-selected="true" aria-controls="panel-1" id="tab-1">Tab 1</div>
  <div class="tab" role="tab" aria-selected="false" aria-controls="panel-2" id="tab-2" tabindex="-1">Tab 2</div>
</div>
```

### 4. 性能优化建议

**问题**：未优化的图片加载

```html
<!-- Before -->
<img src="large-photo.jpg">

<!-- AI 生成的修复 -->
<picture>
  <source srcset="large-photo.avif" type="image/avif">
  <source srcset="large-photo.webp" type="image/webp">
  <img src="large-photo.jpg" 
       loading="lazy" 
       decoding="async"
       width="1200" 
       height="800"
       alt="Description">
</picture>
```

## 成本估算

| 使用场景 | 平均 Token 数 | 预估成本 (USD) |
|---------|-------------|---------------|
| 单次简单修复 | 500 | ~$0.01 |
| 单次复杂修复 | 2000 | ~$0.04 |
| 批量修复 (10个问题) | 5000 | ~$0.10 |
| 月度使用 (1000个问题) | 500,000 | ~$10 |

*基于 GPT-4 价格：$0.03/1K input tokens, $0.06/1K output tokens*

## 最佳实践

### 1. 渐进式采用

```bash
# 第1周：仅使用规则引擎
qa-agent fix --no-ai

# 第2周：对低风险问题启用 AI
qa-agent fix --auto-approve low

# 第3周：完全启用
qa-agent fix
```

### 2. 质量监控

```bash
# 记录 AI 修复的成功率
qa-agent fix --batch --log-ai-results

# 分析哪些类型的问题 AI 修复效果好
cat .qa-agent/ai-fix-report.json
```

### 3. 混合策略

```yaml
# 对不同类型的修复使用不同策略
ai_fix:
  strategies:
    css:
      use_ai: false  # CSS 用规则引擎足够
    html:
      use_ai: true   # HTML 语义化用 AI
    javascript:
      use_ai: true   # JS 逻辑用 AI
```

## 故障排除

### 问题：AI 修复失败

**检查清单**：
1. API key 是否正确配置
2. 网络是否畅通
3. LLM 服务是否可用
4. Token 限制是否足够

### 问题：AI 修复质量不佳

**解决方案**：
1. 提高 temperature 参数（增加创造性）
2. 提供更多代码上下文
3. 使用更强的模型（GPT-4 vs GPT-3.5）
4. 人工审查后应用

### 问题：成本过高

**优化方案**：
1. 仅对复杂问题使用 AI
2. 批量处理减少 API 调用
3. 缓存常见修复模式
4. 使用本地模型（如 CodeLlama）

## 未来规划

- [ ] 支持更多 LLM 提供商（Claude、Gemini、本地模型）
- [ ] 修复模式学习（从成功案例中学习）
- [ ] 自动验证生成的修复
- [ ] 修复质量评分系统
- [ ] 团队协作共享修复知识

---

*AI Fix Engine 让自动修复从 66% 提升到 85%+*
