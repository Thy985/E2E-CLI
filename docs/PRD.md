# QA-Agent 产品需求文档 (PRD)

> AI 质量医生 — 能诊断、能开药、能验证疗效

## 一、产品概述

### 1.1 产品定位

QA-Agent 是一款 AI 驱动的质量诊断与自愈平台，通过 CLI 原生交互，提供从问题发现、根因定位、自动修复到验证闭环的全流程自动化能力。

**核心价值主张**
- **多维度诊断**：功能、UI/UX、可访问性、性能、安全、代码质量全覆盖
- **智能根因分析**：不只是发现问题，更定位问题根源
- **自动修复能力**：一键修复低风险问题，人工确认高风险问题
- **验证闭环**：修复后自动回归测试，确保修复有效

### 1.2 目标用户

| 用户类型 | 痛点 | 核心需求 |
|----------|------|----------|
| 前端开发者 | E2E 测试编写维护成本高 | 自然语言生成测试，自动修复选择器 |
| QA 工程师 | 测试覆盖不足，回归效率低 | 自动生成边界场景，智能回归 |
| 技术负责人 | 质量门禁不完善 | CI/CD 集成，质量报告 |
| 小团队 | 缺乏专业测试人员 | 一站式质量保障 |
| 企业用户 | 合规要求（WCAG/ADA） | 可访问性自动检测与修复 |

### 1.3 产品形态

```
CLI 核心（必需）
    ├── 命令行交互
    ├── 脚本化执行
    └── CI/CD 集成

Desktop App（可选）
    ├── 可视化报告
    ├── 多项目并行
    └── 团队协作

IDE Plugin（可选）
    ├── 实时诊断
    ├── 快速修复
    └── 代码内联提示
```

---

## 二、核心功能需求

### 2.1 功能架构

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI 入口层                            │
│  diagnose │ fix │ audit │ watch │ skill │ config           │
├─────────────────────────────────────────────────────────────┤
│                     任务调度层                               │
│  意图解析 │ 任务编排 │ 并行执行 │ 进度追踪 │ 结果聚合       │
├─────────────────────────────────────────────────────────────┤
│                     Skills 插件层                           │
│  E2E Test │ UI/UX Audit │ A11y Check │ Perf │ Security     │
├─────────────────────────────────────────────────────────────┤
│                     诊断引擎                                 │
│  问题分类 │ 根因定位 │ 影响分析 │ 优先级评估               │
├─────────────────────────────────────────────────────────────┤
│                     修复引擎                                 │
│  方案生成 │ 代码变更 │ 风险评估 │ 变更预览 │ 回滚机制      │
├─────────────────────────────────────────────────────────────┤
│                     验证引擎                                 │
│  回归测试 │ 视觉对比 │ 性能对比 │ 安全扫描                 │
├─────────────────────────────────────────────────────────────┤
│                     报告引擎                                 │
│  HTML 报告 │ JSON 导出 │ CI 集成 │ 通知推送                │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 CLI 命令设计

#### 2.2.1 诊断命令

```bash
# 全面诊断
qa-agent diagnose

# 指定维度诊断
qa-agent diagnose --skills=e2e,a11y,perf

# 指定 URL 诊断
qa-agent diagnose --url=https://example.com

# 指定文件/目录诊断
qa-agent diagnose --path=src/components

# 输出格式
qa-agent diagnose --output=json --output-file=report.json
```

#### 2.2.2 修复命令

```bash
# 交互式修复
qa-agent fix

# 修复指定问题
qa-agent fix --issue=A11y-001

# 自动修复低风险问题
qa-agent fix --auto-approve=low-risk

# 预览修复（不实际修改）
qa-agent fix --dry-run

# 创建修复 PR
qa-agent fix --create-pr --branch=fix/a11y-issues
```

#### 2.2.3 审计命令

```bash
# 项目健康度审计
qa-agent audit

# 全面审计（含安全扫描）
qa-agent audit --comprehensive

# 合规审计
qa-agent audit --compliance=WCAG2.2,ADA,GDPR
```

#### 2.2.4 监控命令

```bash
# 文件变化监控
qa-agent watch

# 指定监控范围
qa-agent watch --path=src --skills=e2e,a11y

# 监控并自动修复
qa-agent watch --auto-fix=low-risk
```

#### 2.2.5 Skills 管理

```bash
# 列出已安装 Skills
qa-agent skill list

# 安装 Skill
qa-agent skill install @qa-agent/skill-security

# 更新 Skill
qa-agent skill update @qa-agent/skill-e2e

# 创建自定义 Skill
qa-agent skill create my-custom-skill
```

### 2.3 Skills 功能需求

#### Skill 1: E2E 测试诊断

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 自然语言生成测试 | 输入需求描述，生成 Playwright 测试脚本 | P0 |
| 智能选择器 | 优先语义选择器，自动回退，支持自愈 | P0 |
| 测试执行 | 本地/云端执行，支持并行 | P0 |
| 失败分析 | 自动定位失败原因，生成修复建议 | P0 |
| 测试录制 | 录制用户操作，生成测试脚本 | P1 |
| 视觉回归 | 截图对比，检测 UI 变化 | P1 |

#### Skill 2: UI/UX 审美诊断

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 设计规范检查 | 间距、颜色、字体、圆角等一致性检查 | P0 |
| 视觉层次分析 | 对比度、层次感、焦点引导分析 | P1 |
| 响应式检查 | 多设备/分辨率适配检查 | P0 |
| 品牌一致性 | Logo、配色、组件风格一致性 | P2 |
| 自动修复建议 | 生成 CSS/样式修复代码 | P0 |

#### Skill 3: 可访问性诊断

| 功能 | 描述 | 优先级 |
|------|------|--------|
| WCAG 规则扫描 | WCAG 2.2 A/AA/AAA 级别检查 | P0 |
| 色彩对比度 | 文本与背景对比度检查 | P0 |
| 键盘导航 | Tab 顺序、焦点管理检查 | P0 |
| 屏幕阅读器 | ARIA 标签、语义结构检查 | P0 |
| 自动修复 | 生成 ARIA/语义修复代码 | P0 |

#### Skill 4: 性能诊断

| 功能 | 描述 | 优先级 |
|------|------|--------|
| Lighthouse 跑分 | 性能、可访问性、最佳实践、SEO | P0 |
| 资源分析 | JS/CSS/图片大小、加载顺序 | P0 |
| 渲染性能 | FCP、LCP、CLS、FID 等核心指标 | P0 |
| 优化建议 | 代码分割、懒加载、压缩建议 | P1 |
| 性能对比 | 修复前后性能对比 | P1 |

#### Skill 5: 安全诊断

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 依赖漏洞 | npm audit / Snyk 集成 | P0 |
| XSS 检测 | 跨站脚本漏洞扫描 | P0 |
| 敏感信息泄露 | API Key、Token、密码泄露检测 | P0 |
| CSP 检查 | 内容安全策略配置检查 | P1 |
| 自动修复 | 生成安全补丁 | P1 |

### 2.4 诊断报告需求

#### 报告内容

```markdown
# QA-Agent 诊断报告

## 概览

| 维度 | 得分 | 状态 | 问题数 |
|------|------|------|--------|
| 功能正确性 | 82% | ⚠️ | 3 |
| UI/UX 审美 | 71% | ⚠️ | 12 |
| 可访问性 | 45% | ❌ | 23 |
| 性能 | 63% | ⚠️ | 5 |
| 安全 | 85% | ✅ | 1 |

## 问题详情

### 🔴 Critical (3)

#### A11y-001: 缺少表单标签
- **位置**: src/components/LoginForm.tsx:45
- **规则**: WCAG 2.2 - 1.3.1 Info and Relationships
- **影响**: 屏幕阅读器用户无法理解表单字段用途
- **修复建议**: 
  ```tsx
  <label htmlFor="username">用户名</label>
  <input id="username" ... />
  ```

### 🟡 Warning (12)

...

## 快速修复

运行以下命令自动修复 34 个低风险问题：
```bash
qa-agent fix --quick
```
```

#### 报告格式

- HTML（默认）：交互式报告，支持筛选、排序
- JSON：CI/CD 集成、程序化处理
- Markdown：文档集成、PR 评论
- JUnit XML：CI 系统兼容

### 2.5 质量评分模型

"质量"是抽象的，需要量化为具体指标，让用户有成就感和改进动力。

#### 2.5.1 健康度评分

每次诊断后，给项目打一个综合分数（0-100），让用户直观了解项目质量状态。

**评分维度**

| 维度 | 权重 | 评分依据 |
|------|------|----------|
| 功能正确性 | 25% | E2E 测试通过率、测试覆盖率 |
| 代码规范 | 20% | Lint 错误数、代码复杂度 |
| 可访问性 | 20% | WCAG 违规数、A11y 得分 |
| 性能 | 20% | Lighthouse 性能分数、核心指标 |
| 安全 | 15% | 漏洞数、依赖风险 |

**评分公式**

```
总分 = Σ (维度得分 × 权重)

维度得分 = 100 - (问题扣分 × 严重程度系数)

严重程度系数:
- Critical: 10分/个
- Warning: 3分/个  
- Info: 1分/个
```

**评分等级**

| 分数 | 等级 | 状态 | 描述 |
|------|------|------|------|
| 90-100 | A | ✅ 优秀 | 质量优秀，可放心发布 |
| 80-89 | B | ✅ 良好 | 质量良好，有小问题待优化 |
| 70-79 | C | ⚠️ 一般 | 存在问题，建议修复后发布 |
| 60-69 | D | ⚠️ 较差 | 问题较多，建议修复后再发布 |
| 0-59 | F | ❌ 不合格 | 质量不合格，禁止发布 |

#### 2.5.2 趋势分析

记录历史评分，让用户看到质量变化趋势。

**数据存储**

```json
// .qa-agent/health_history.json
{
  "project": "my-project",
  "records": [
    {
      "date": "2026-04-19T10:30:00Z",
      "commit": "abc123",
      "score": 72,
      "dimensions": {
        "functionality": 82,
        "codeQuality": 78,
        "accessibility": 45,
        "performance": 63,
        "security": 85
      },
      "issues": {
        "critical": 3,
        "warning": 12,
        "info": 8
      }
    },
    {
      "date": "2026-04-18T10:30:00Z",
      "commit": "def456",
      "score": 68,
      "dimensions": {
        "functionality": 80,
        "codeQuality": 75,
        "accessibility": 42,
        "performance": 60,
        "security": 85
      },
      "issues": {
        "critical": 4,
        "warning": 15,
        "info": 10
      }
    }
  ]
}
```

**趋势报告**

```
┌─────────────────────────────────────────────────────────────┐
│                    📊 Quality Trends                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Overall Score                                              │
│  100 ┤                                                      │
│   90 ┤                                                      │
│   80 ┤    ●────────●                                        │
│   70 ┤ ●──●        ●────────●──────●                       │
│   60 ┤                                            ●         │
│   50 ┤                                                      │
│      └────┬────┬────┬────┬────┬────┬────┬────              │
│          4/13 4/14 4/15 4/16 4/17 4/18 4/19                │
│                                                             │
│  📈 This Week: +4 points                                    │
│  📉 Performance: -2 points                                  │
│  📈 Accessibility: +8 points                                │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Dimension Changes                                          │
│                                                             │
│  Accessibility  ████████████████████░░░░  +8 (+3 issues fixed)
│  Performance    ████████████░░░░░░░░░░░░  -2 (LCP increased)
│  Security       ████████████████████████  0  (no change)
│  Code Quality   ████████████████░░░░░░░░  +2 (lint fixes)
│  Functionality  ████████████████████░░░░  +1 (test added)
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 2.5.3 质量门禁

定义质量标准，用于 CI/CD 流程中的自动化检查。

**门禁配置**

```yaml
# .qa-agent/gates.yaml
gates:
  # 发布门禁
  release:
    minScore: 80
    maxCritical: 0
    maxWarning: 5
    dimensions:
      security: 90
      accessibility: 70
      
  # PR 门禁
  pull_request:
    minScore: 70
    maxCritical: 2
    blockOn:
      - security.critical
      - accessibility.critical
      
  # 开发门禁
  development:
    minScore: 60
    warnOn:
      - performance.warning
      - codeQuality.warning
```

**门禁检查**

```typescript
interface QualityGate {
  name: string;
  rules: GateRule[];
  action: 'block' | 'warn' | 'pass';
}

interface GateResult {
  passed: boolean;
  score: number;
  violations: GateViolation[];
  recommendation: string;
}

class QualityGateChecker {
  async check(gate: QualityGate, report: DiagnosisReport): Promise<GateResult> {
    const violations: GateViolation[] = [];
    
    // 检查最低分数
    if (report.score < gate.minScore) {
      violations.push({
        rule: 'minScore',
        expected: gate.minScore,
        actual: report.score,
      });
    }
    
    // 检查问题数量
    if (report.criticalCount > gate.maxCritical) {
      violations.push({
        rule: 'maxCritical',
        expected: gate.maxCritical,
        actual: report.criticalCount,
      });
    }
    
    // 检查各维度
    for (const [dimension, minScore] of Object.entries(gate.dimensions || {})) {
      if (report.dimensions[dimension] < minScore) {
        violations.push({
          rule: `dimensions.${dimension}`,
          expected: minScore,
          actual: report.dimensions[dimension],
        });
      }
    }
    
    return {
      passed: violations.length === 0,
      score: report.score,
      violations,
      recommendation: this.generateRecommendation(violations),
    };
  }
}
```

#### 2.5.4 成就系统

通过游戏化机制激励用户持续改进质量。

**成就徽章**

| 徽章 | 条件 | 描述 |
|------|------|------|
| 🏆 完美主义 | 单次诊断得分 100 | 所有检查项完美通过 |
| 🛡️ 安全卫士 | 连续 30 天无安全漏洞 | 安全意识优秀 |
| ♿ 无障碍先锋 | WCAG AA 级别通过 | 关注可访问性 |
| ⚡ 性能大师 | Lighthouse 性能 90+ | 性能优化出色 |
| 📈 持续改进 | 连续 7 天评分上升 | 持续关注质量 |
| 🔧 修复达人 | 累计修复 100 个问题 | 积极修复问题 |

**进度追踪**

```
┌─────────────────────────────────────────────────────────────┐
│                    🏆 Achievements                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🛡️ Security Guardian                                       │
│  Progress: 23/30 days without vulnerabilities               │
│  ████████████████████████░░░░░░░░  77%                      │
│                                                             │
│  🔧 Fix Master                                              │
│  Progress: 87/100 issues fixed                              │
│  ████████████████████████████████░░░░  87%                  │
│                                                             │
│  📈 Continuous Improvement                                  │
│  Progress: 5/7 days of score improvement                    │
│  ██████████████████████████████░░░░░░  71%                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、非功能需求

### 3.1 性能需求

| 指标 | 要求 |
|------|------|
| 诊断启动时间 | < 2s |
| 单页面诊断时间 | < 30s（含 E2E 测试） |
| 报告生成时间 | < 5s |
| 内存占用 | < 500MB（基础运行） |
| 并行任务数 | 支持 4+ 并行诊断 |

### 3.2 可靠性需求

| 指标 | 要求 |
|------|------|
| 诊断准确率 | > 95% |
| 修复成功率 | > 90%（低风险问题） |
| 自愈选择器成功率 | > 85% |
| 系统可用性 | 99.5%（云端服务） |

### 3.3 安全需求

- 本地优先：敏感代码不上传云端
- 数据加密：传输和存储加密
- 权限控制：最小权限原则
- 审计日志：所有操作可追溯
- 沙盒执行：测试在隔离环境运行

### 3.4 兼容性需求

| 维度 | 支持 |
|------|------|
| 操作系统 | Windows 10+, macOS 11+, Ubuntu 20.04+ |
| Node.js | 18.x, 20.x, 22.x |
| 浏览器 | Chrome, Firefox, Safari, Edge |
| CI/CD | GitHub Actions, GitLab CI, Jenkins, Azure DevOps |
| 框架 | React, Vue, Angular, Svelte, Next.js, Nuxt |

### 3.5 可扩展性需求

- Skills 插件系统：支持第三方/自定义 Skills
- 模型适配：支持多种 LLM（OpenAI、Claude、本地模型）
- 规则自定义：支持自定义诊断规则
- 集成扩展：Webhook、API、SDK

---

## 四、用户故事

### 4.1 E2E 测试场景

**US-001: 自然语言生成测试**
```
作为 前端开发者
我希望 用自然语言描述测试需求
以便于 快速生成 E2E 测试脚本

验收标准：
- 输入："测试用户登录功能，验证登录成功后跳转到首页"
- 输出：完整的 Playwright 测试脚本
- 脚本可直接执行
- 选择器使用语义化方式（text、role）
```

**US-002: 测试失败自动修复**
```
作为 QA 工程师
我希望 测试失败时自动分析原因并修复
以便于 减少维护成本

验收标准：
- 测试失败时自动截图
- 自动定位失败原因（选择器失效/元素不存在/断言失败）
- 提供修复建议或自动修复
- 修复后自动重新执行验证
```

### 4.2 可访问性场景

**US-003: WCAG 合规检查**
```
作为 技术负责人
我希望 自动检查 WCAG 合规性
以便于 满足法规要求

验收标准：
- 支持 WCAG 2.2 A/AA/AAA 级别
- 检测所有常见违规项
- 提供修复代码示例
- 可导出合规报告
```

**US-004: 可访问性自动修复**
```
作为 前端开发者
我希望 一键修复可访问性问题
以便于 快速达到合规要求

验收标准：
- 识别可自动修复的问题
- 显示修复预览
- 确认后应用修复
- 自动验证修复有效
```

### 4.3 CI/CD 集成场景

**US-005: PR 质量门禁**
```
作为 技术负责人
我希望 PR 提交时自动运行质量检查
以便于 阻止低质量代码合并

验收标准：
- PR 创建/更新时自动触发
- 运行配置的诊断 Skills
- 失败时阻止合并
- 在 PR 中显示详细报告
```

---

## 五、优先级规划

### 5.1 MVP (Phase 1)

**目标**：验证核心价值，E2E 测试 + 可访问性诊断

| 功能 | 优先级 | 工期 |
|------|--------|------|
| CLI 框架 | P0 | 1 周 |
| Skills 插件系统 | P0 | 1 周 |
| E2E 测试 Skill（基础） | P0 | 2 周 |
| 可访问性 Skill（基础） | P0 | 1 周 |
| 诊断报告生成 | P0 | 1 周 |
| **MVP 总计** | | **6 周** |

### 5.2 Phase 2

**目标**：修复能力 + 高级诊断

| 功能 | 优先级 | 工期 |
|------|--------|------|
| 自动修复引擎 | P0 | 2 周 |
| E2E 测试失败自动修复 | P0 | 1 周 |
| 可访问性自动修复 | P0 | 1 周 |
| UI/UX 审美 Skill | P1 | 2 周 |
| 性能诊断 Skill | P1 | 1 周 |
| **Phase 2 总计** | | **7 周** |

### 5.3 Phase 3

**目标**：企业级能力 + 生态

| 功能 | 优先级 | 工期 |
|------|--------|------|
| 安全诊断 Skill | P1 | 1 周 |
| CI/CD 集成模板 | P1 | 1 周 |
| watch 监控模式 | P1 | 1 周 |
| 团队协作功能 | P2 | 2 周 |
| Skills 市场 | P2 | 2 周 |
| **Phase 3 总计** | | **7 周** |

---

## 六、成功指标

### 6.1 产品指标

| 指标 | MVP 目标 | 1 年目标 |
|------|----------|----------|
| GitHub Stars | 1,000 | 10,000 |
| 周活跃用户 | 500 | 5,000 |
| 付费转化率 | 2% | 5% |
| NPS | 40 | 60 |

### 6.2 质量指标

| 指标 | MVP 目标 | 1 年目标 |
|------|----------|----------|
| 诊断准确率 | 90% | 95% |
| 修复成功率 | 80% | 90% |
| 用户满意度 | 4.0/5 | 4.5/5 |

---

## 七、风险与应对

| 风险 | 影响 | 概率 | 应对策略 |
|------|------|------|----------|
| Playwright 官方 AI 功能竞争 | 高 | 中 | 差异化：多维度诊断 + 自动修复 |
| 模型成本高 | 中 | 高 | 模型分级 + 本地模型支持 |
| 选择器识别准确率不足 | 高 | 中 | 多策略回退 + 人工确认 |
| 用户习惯改变难 | 中 | 中 | IDE 插件 + 文档 + 示例 |
| 安全合规问题 | 高 | 低 | 本地优先 + 数据加密 |

---

## 八、版本规划

### v0.1.0 - MVP
- CLI 基础框架
- E2E 测试 Skill（自然语言生成、执行、报告）
- 可访问性 Skill（WCAG 检查、报告）
- 基础诊断报告

### v0.2.0 - 修复能力
- 自动修复引擎
- E2E 测试失败修复
- 可访问性自动修复
- 修复预览与确认

### v0.3.0 - 诊断扩展
- UI/UX 审美 Skill
- 性能诊断 Skill
- watch 监控模式

### v0.4.0 - 企业级
- 安全诊断 Skill
- CI/CD 集成模板
- 团队协作功能

### v1.0.0 - 正式版
- Skills 市场
- 完整文档
- 企业级支持
