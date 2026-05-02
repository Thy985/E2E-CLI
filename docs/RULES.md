# QA-Agent 规则引擎文档

> 完整的规则检测清�?
---

## 规则引擎概览

QA-Agent 使用基于规则的静态分析引擎，无需 AI 即可检测和修复常见问题�?
### 规则类型

| 类型 | 说明 | 示例 |
|------|------|------|
| **Pattern** | 正则匹配 | 检测硬编码颜色 |
| **AST** | 语法树分�?| 检测嵌套层�?|
| **Semantic** | 语义分析 | 检测未使用的变�?|
| **Heuristic** | 启发式规�?| 检测可疑代码模�?|

---

## 1. UI/UX 规则

### 1.1 视觉规范

| 规则 ID | 描述 | 严重程度 | 自动修复 |
|---------|------|---------|---------|
| `color-mismatch` | 使用非设计令牌颜�?| Warning | �?|
| `spacing-inconsistent` | 间距不符�?8px 网格 | Info | �?|
| `border-radius-mismatch` | 圆角值不规范 | Info | �?|
| `font-size-hardcoded` | 硬编码字体大�?| Warning | �?|
| `line-height-missing` | 缺少行高定义 | Info | �?|

### 1.2 布局对齐

| 规则 ID | 描述 | 严重程度 | 自动修复 |
|---------|------|---------|---------|
| `flex-missing-align` | Flex 容器缺少 align-items | Info | �?|
| `grid-inconsistent` | Grid 间距不一�?| Warning | �?|
| `fixed-width-responsive` | 固定宽度未处理响应式 | Warning | �?|
| `container-no-max-width` | 容器缺少最大宽�?| Info | �?|

### 1.3 交互状�?
| 规则 ID | 描述 | 严重程度 | 自动修复 |
|---------|------|---------|---------|
| `missing-hover-state` | 缺少 hover 状�?| Warning | �?|
| `missing-focus-state` | 缺少 focus 状�?| Warning | �?|
| `missing-active-state` | 缺少 active 状�?| Info | �?|
| `missing-disabled-state` | 缺少 disabled 状�?| Info | �?|

---

## 2. 最佳实践规�?
### 2.1 HTML 语义�?
| 规则 ID | 描述 | 严重程度 | 自动修复 |
|---------|------|---------|---------|
| `missing-lang` | html 缺少 lang 属�?| Warning | �?|
| `heading-hierarchy` | 标题层级跳跃 | Warning | �?|
| `missing-label` | 表单输入缺少 label | Warning | �?|
| `missing-alt` | 图片缺少 alt 属�?| Warning | �?|
| `missing-viewport` | 缺少 viewport meta | Warning | �?|
| `missing-title` | 缺少 title 元素 | Warning | �?|
| `multiple-h1` | 多个 H1 标签 | Warning | �?|

### 2.2 CSS 最佳实�?
| 规则 ID | 描述 | 严重程度 | 自动修复 |
|---------|------|---------|---------|
| `at-import-performance` | @import 性能问题 | Info | �?|
| `deep-nesting` | CSS 嵌套超过 4 �?| Info | �?|
| `important-overuse` | 过度使用 !important | Warning | �?|
| `id-selector` | 使用 ID 选择�?| Info | �?|
| `universal-selector` | 使用通用选择�?| Warning | �?|
| `empty-rule` | �?CSS 规则 | Info | �?|

### 2.3 图片优化

| 规则 ID | 描述 | 严重程度 | 自动修复 |
|---------|------|---------|---------|
| `missing-dimensions` | 图片缺少 width/height | Info | �?|
| `missing-lazy-loading` | 图片缺少 loading="lazy" | Info | �?|
| `legacy-image-format` | 使用传统图片格式 | Info | �?|
| `missing-srcset` | 缺少响应�?srcset | Info | �?|
| `non-descriptive-filename` | 图片文件名不描述�?| Info | �?|

### 2.4 性能优化

| 规则 ID | 描述 | 严重程度 | 自动修复 |
|---------|------|---------|---------|
| `render-blocking-script` | 阻塞渲染�?script | Warning | �?|
| `css-in-body` | CSS �?body �?| Warning | �?|
| `large-inline-style` | 大型内联样式 | Info | �?|
| `heavy-dependency` | 重型依赖�?| Info | �?|
| `dom-in-loop` | 循环�?DOM 操作 | Warning | �?|
| `function-in-loop` | 循环中创建函�?| Info | �?|
| `event-listener-leak` | 未清理事件监听器 | Warning | �?|
| `timer-leak` | 未清理定时器 | Warning | �?|
| `large-node-modules` | 大型 node_modules | Warning | �?|
| `large-bundle` | 大型构建输出 | Info | �?|

---

## 3. SEO 规则

### 3.1 Meta 标签

| 规则 ID | 描述 | 严重程度 | 自动修复 |
|---------|------|---------|---------|
| `missing-description` | 缺少 meta description | Warning | �?|
| `missing-keywords` | 缺少 meta keywords | Info | �?|
| `missing-og-title` | 缺少 Open Graph title | Info | �?|
| `missing-og-description` | 缺少 Open Graph description | Info | �?|
| `missing-og-image` | 缺少 Open Graph image | Info | �?|
| `missing-og-url` | 缺少 Open Graph url | Info | �?|
| `missing-twitter-card` | 缺少 Twitter Card | Info | �?|
| `missing-canonical` | 缺少 canonical 链接 | Warning | �?|
| `missing-robots` | 缺少 robots meta | Info | �?|

### 3.2 内容优化

| 规则 ID | 描述 | 严重程度 | 自动修复 |
|---------|------|---------|---------|
| `title-length` | 标题长度不合�?| Warning | �?|
| `description-length` | 描述长度不合�?| Warning | �?|
| `multiple-h1` | 多个 H1 标签 | Warning | �?|
| `external-link-security` | 外部链接缺少 rel="noopener" | Warning | �?|
| `empty-link` | 空链接或占位链接 | Warning | �?|
| `image-filename` | 图片文件名不描述�?| Info | �?|

### 3.3 结构化数�?
| 规则 ID | 描述 | 严重程度 | 自动修复 |
|---------|------|---------|---------|
| `missing-structured-data` | 缺少结构化数�?| Info | �?|

---

## 4. 依赖规则

### 4.1 版本管理

| 规则 ID | 描述 | 严重程度 | 自动修复 |
|---------|------|---------|---------|
| `outdated-dependency` | 依赖过时 | Warning/Info | �?|
| `unsafe-version-range` | 不安全的版本范围 | Warning | �?|
| `exact-version` | 锁定精确版本 | Info | �?|
| `git-url-dependency` | 使用 git URL | Warning | �?|
| `local-path-dependency` | 使用本地路径 | Info | �?|

### 4.2 依赖组织

| 规则 ID | 描述 | 严重程度 | 自动修复 |
|---------|------|---------|---------|
| `duplicate-dependency` | 重复依赖 | Warning | �?|
| `peer-in-deps` | peer 依赖�?dependencies �?| Warning | �?|
| `wrong-placement` | 依赖位置错误 | Warning | �?|

---

## 5. 可访问性规�?(A11y)

| 规则 ID | 描述 | 严重程度 | 自动修复 |
|---------|------|---------|---------|
| `missing-alt` | 图片缺少 alt | Warning | �?|
| `low-contrast` | 对比度不�?| Critical | �?|
| `missing-aria-label` | 缺少 ARIA 标签 | Warning | �?|
| `missing-focus-indicator` | 缺少焦点指示�?| Warning | �?|
| `keyboard-navigation` | 键盘导航问题 | Warning | �?|

---

## 6. E2E 测试规则

| 规则 ID | 描述 | 严重程度 | 自动修复 |
|---------|------|---------|---------|
| `fragile-selector` | 脆弱的选择�?| Warning | �?|
| `missing-test-id` | 缺少 test-id | Info | �?|
| `hardcoded-wait` | 硬编码等待时�?| Warning | �?|
| `missing-assertion` | 缺少断言 | Warning | �?|

---

## 规则配置

### 启用/禁用规则

```yaml
# .qa-agent/config.yml
rules:
  uiux:
    color-mismatch:
      enabled: true
      severity: warning
    spacing-inconsistent:
      enabled: true
      severity: info
    
  best-practices:
    missing-alt:
      enabled: true
      severity: error
    
  seo:
    missing-description:
      enabled: true
      severity: warning
```

### 自定义规�?
```typescript
// custom-rule.ts
export default {
  id: 'custom-rule',
  name: 'Custom Rule',
  description: 'My custom rule',
  severity: 'warning',
  
  check(content: string, file: string): Issue[] {
    const issues: Issue[] = [];
    // 自定义检测逻辑
    return issues;
  },
  
  fix(issue: Issue): Fix {
    // 自定义修复逻辑
    return {
      type: 'replace',
      search: /pattern/,
      replace: 'replacement',
    };
  },
};
```

---

## 规则统计

| Skill | 规则数量 | 规则引擎修复 | AI 辅助修复 | 总覆盖率 |
|-------|---------|-------------|------------|---------|
| UI/UX | 15 | 8 (53%) | 5 (33%) | **12 (80%)** ⬆️ |
| Best Practices | 25 | 16 (64%) | 6 (24%) | **22 (88%)** |
| SEO | 15 | 8 (53%) | 5 (33%) | **13 (87%)** ⬆️ |
| Dependency | 10 | 5 (50%) | 3 (30%) | **8 (80%)** ⬆️ |
| A11y | 10 | 2 (20%) | 6 (60%) | **8 (80%)** ⬆️ |
| E2E | 8 | 2 (25%) | 5 (63%) | **7 (88%)** ⬆️ |
| **总计** | **83** | **41 (49%)** | **30 (36%)** | **71 (86%)** ⬆️ |

---

*最后更�? 2026-04-29*
