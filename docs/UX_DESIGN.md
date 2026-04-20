# QA-Agent 交互体验设计文档

## 一、设计理念

CLI 不仅仅是命令行工具，更是 Agent 与人类沟通的窗口。在 2026 年，用户对 CLI 的视觉体验和交互流畅度要求已经很高。我们的目标是：

> **让 CLI 像 IDE 一样直观，像聊天一样自然，像脚本一样高效**

### 设计原则

1. **渐进式披露**：简单任务简单显示，复杂任务逐步展开
2. **即时反馈**：每个操作都有视觉响应，不让用户等待焦虑
3. **可控性**：高风险操作必须确认，用户始终掌握控制权
4. **可组合性**：支持管道、重定向、JSON 输出，便于自动化集成

---

## 二、视觉设计系统

### 2.1 ASCII 状态机

**思考状态**

```
┌─────────────────────────────────────────────────────────────┐
│  🧠 Agent Thinking...                                       │
│                                                             │
│     ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│     │  Parse   │───▶│ Analyze  │───▶│  Plan    │           │
│     │ Intent   │ ✓  │ Context  │ ✓  │ Actions  │ ●         │
│     └──────────┘    └──────────┘    └──────────┘           │
│                                                             │
│  Current: Planning fix strategy for A11y-001               │
└─────────────────────────────────────────────────────────────┘
```

**诊断状态**

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 Diagnosing...                                           │
│                                                             │
│  Skills:                                                    │
│  ├── e2e-test      ████████████████████░░░░  85% ✓         │
│  ├── a11y-check    ████████████████████████  100% ✓        │
│  ├── perf-audit    ████████████░░░░░░░░░░░░  55% ●         │
│  └── security      ░░░░░░░░░░░░░░░░░░░░░░░░  0% ○          │
│                                                             │
│  Issues found: 23                                           │
│  ├── 🔴 Critical: 3                                         │
│  ├── 🟡 Warning:  12                                        │
│  └── 🔵 Info:     8                                         │
└─────────────────────────────────────────────────────────────┘
```

**修复状态**

```
┌─────────────────────────────────────────────────────────────┐
│  🔧 Fixing...                                               │
│                                                             │
│  Fix: A11y-001 - Add label for input element               │
│  File: src/components/LoginForm.tsx                         │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  -  <input type="text" className="form-input" />           │
│  +  <label htmlFor="username">用户名</label>                │
│  +  <input                                                  │
│  +    id="username"                                         │
│  +    type="text"                                           │
│  +    className="form-input"                                │
│  +  />                                                      │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Risk: Low  │  Auto-applicable: Yes                        │
│                                                             │
│  [y] Apply  [n] Skip  [e] Edit  [d] Diff  [?] Help        │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 进度指示器

**Spinner 变体**

```typescript
// 不同状态使用不同动画
const spinners = {
  thinking: ['🧠', '🧠.', '🧠..', '🧠...'],
  scanning: ['🔍', '🔍', '🔍', '🔍'],
  fixing: ['🔧', '🔧', '🔧', '🔧'],
  verifying: ['✅', '✅', '✅', '✅'],
};
```

**进度条**

```
E2E Tests     ████████████████████░░░░  85%  12/14 passed
A11y Check    ████████████████████████  100% 45 rules checked
Performance   ████████████░░░░░░░░░░░░  55%  Running...
```

### 2.3 颜色系统

```typescript
// 语义化颜色
const colors = {
  // 状态色
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.blue,
  
  // 强调色
  highlight: chalk.cyan.bold,
  muted: chalk.gray,
  
  // 交互色
  prompt: chalk.white.bgBlue,
  selected: chalk.black.bgCyan,
};
```

---

## 三、交互模式设计

### 3.1 交互式确认

**高风险操作确认**

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️  High Risk Operation                                    │
│                                                             │
│  You are about to modify a core file:                       │
│  • File: src/auth/login.ts                                  │
│  • Changes: 15 lines added, 8 lines removed                 │
│  • Impact: Authentication flow                              │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  -  const token = localStorage.getItem('token');           │
│  +  const token = await secureStorage.getToken();          │
│  +  if (!token || isExpired(token)) {                      │
│  +    throw new AuthError('Token expired');                │
│  +  }                                                       │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  [y] Apply anyway  [n] Reject  [e] Edit manually           │
│  [v] View full diff  [s] Show affected tests  [?] Help     │
└─────────────────────────────────────────────────────────────┘
```

**交互按键**

| 按键 | 功能 |
|------|------|
| `y` | 确认应用 |
| `n` | 拒绝跳过 |
| `e` | 打开编辑器手动编辑 |
| `v` | 查看完整 diff |
| `s` | 显示受影响的测试 |
| `d` | 查看依赖关系 |
| `?` | 显示帮助 |
| `q` | 退出 |

### 3.2 静默模式

**设计目标**

为 CI/CD 和自动化工具调用设计，只输出结构化数据，不输出任何花哨的 UI。

**使用方式**

```bash
# 静默模式（只输出结果）
qa-agent diagnose --quiet

# JSON 输出（便于程序解析）
qa-agent diagnose --output=json

# 组合使用
qa-agent diagnose --quiet --output=json > report.json
```

**JSON 输出格式**

```json
{
  "version": "1.0",
  "timestamp": "2026-04-19T10:30:00Z",
  "project": {
    "name": "my-project",
    "path": "/path/to/project"
  },
  "summary": {
    "score": 72,
    "totalIssues": 23,
    "critical": 3,
    "warning": 12,
    "info": 8
  },
  "issues": [
    {
      "id": "A11y-001",
      "skill": "a11y-check",
      "severity": "critical",
      "title": "Missing form label",
      "location": {
        "file": "src/components/LoginForm.tsx",
        "line": 45,
        "column": 10
      },
      "fixable": true,
      "autoFixable": true
    }
  ],
  "duration": 45000,
  "exitCode": 1
}
```

**退出码**

| 退出码 | 含义 |
|--------|------|
| 0 | 成功，无问题 |
| 1 | 发现问题，但无 critical |
| 2 | 发现 critical 问题 |
| 3 | 执行错误 |
| 4 | 配置错误 |

### 3.3 详细模式

**使用方式**

```bash
# 显示详细信息
qa-agent diagnose --verbose

# 显示调试信息
qa-agent diagnose --debug

# 显示追踪信息（含 LLM 调用）
qa-agent diagnose --trace
```

**详细输出**

```
[10:30:01.234] INFO  Starting diagnosis...
[10:30:01.456] DEBUG Loading skills: e2e-test, a11y-check, perf-audit
[10:30:01.567] DEBUG Skill e2e-test initialized in 111ms
[10:30:01.678] DEBUG Skill a11y-check initialized in 89ms
[10:30:01.789] DEBUG Skill perf-audit initialized in 56ms
[10:30:02.123] INFO  Running e2e-test skill...
[10:30:02.234] TRACE LLM request: {"model":"claude-sonnet","tokens":1234}
[10:30:05.678] TRACE LLM response: {"tokens":567,"duration":3444ms}
[10:30:05.789] DEBUG Generated 3 test cases
[10:30:06.123] INFO  Running tests with Playwright...
```

---

## 四、输出格式设计

### 4.1 终端输出

**表格格式**

```
┌──────────────────────────────────────────────────────────────────────┐
│                           Diagnosis Report                           │
├──────────────────────────────────────────────────────────────────────┤
│  Project: my-project                              Score: 72/100      │
│  Path: /Users/dev/projects/my-project                               │
│  Duration: 45.2s                                   Issues: 23        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  🔴 Critical (3)                                                     │
│  ├── A11y-001  Missing form label                    src/auth.ts:45  │
│  ├── SEC-001  Potential XSS vulnerability            src/api.ts:123  │
│  └── PERF-001  LCP exceeds 4s                        index.html      │
│                                                                      │
│  🟡 Warning (12)                                                     │
│  ├── A11y-002  Low color contrast (3.2:1)            styles.css:89   │
│  ├── A11y-003  Missing alt text                      Logo.tsx:12     │
│  └── ... 10 more warnings                                            │
│                                                                      │
│  🔵 Info (8)                                                         │
│  └── ... 8 suggestions                                               │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  💡 Quick Fix: 15 issues can be auto-fixed                           │
│     Run: qa-agent fix --auto-approve=low                             │
└──────────────────────────────────────────────────────────────────────┘
```

**紧凑格式**

```
qa-agent diagnose --format=compact

✓ E2E: 12/14 passed (2 failures)
✗ A11y: 23 issues (3 critical, 12 warning, 8 info)
⚠ PERF: Score 62/100 (LCP: 4.2s, FID: 120ms)
✓ SEC: No critical issues

Total: 23 issues | Score: 72/100 | Duration: 45.2s
Run `qa-agent fix` to resolve 15 auto-fixable issues.
```

### 4.2 HTML 报告

**交互式报告**

```html
<!DOCTYPE html>
<html>
<head>
  <title>QA-Agent Report - my-project</title>
  <style>
    /* 现代化设计 */
    :root {
      --primary: #3b82f6;
      --success: #10b981;
      --warning: #f59e0b;
      --error: #ef4444;
    }
    
    .score-ring {
      /* 圆环进度条 */
    }
    
    .issue-card {
      /* 可展开的问题卡片 */
    }
    
    .code-diff {
      /* 语法高亮的 diff */
    }
  </style>
</head>
<body>
  <header>
    <h1>QA-Agent Report</h1>
    <div class="score-ring" data-score="72">72</div>
  </header>
  
  <main>
    <section class="summary">
      <!-- 概览卡片 -->
    </section>
    
    <section class="issues">
      <!-- 问题列表，支持筛选、排序 -->
    </section>
    
    <section class="trends">
      <!-- 历史趋势图 -->
    </section>
  </main>
  
  <script>
    // 交互逻辑：筛选、排序、展开详情
  </script>
</body>
</html>
```

### 4.3 Markdown 报告

**PR 评论格式**

```markdown
## 🔍 QA-Agent Report

**Score: 72/100** | **23 issues found** | **15 auto-fixable**

### 🔴 Critical (3)

#### A11y-001: Missing form label
- **File**: `src/components/LoginForm.tsx:45`
- **Rule**: WCAG 2.2 - 1.3.1 Info and Relationships
- **Fix**: Add label element for input

```diff
- <input type="text" className="form-input" />
+ <label htmlFor="username">用户名</label>
+ <input id="username" type="text" className="form-input" />
```

---

### Quick Fix

Run the following command to auto-fix 15 issues:

```bash
qa-agent fix --auto-approve=low
```

<details>
<summary>📊 Full Report</summary>

<!-- 详细报告 -->
</details>
```

---

## 五、Watch 模式设计

### 5.1 实时监控界面

```
┌─────────────────────────────────────────────────────────────┐
│  👁️  QA-Agent Watch Mode                                   │
│                                                             │
│  Watching: src/                                             │
│  Skills: e2e-test, a11y-check                               │
│  Auto-fix: low-risk issues                                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [10:30:01] File changed: src/components/Button.tsx        │
│  [10:30:01] → Running diagnosis...                         │
│  [10:30:03] ✓ No issues found                              │
│                                                             │
│  [10:31:15] File changed: src/components/Form.tsx          │
│  [10:31:15] → Running diagnosis...                         │
│  [10:31:18] ⚠ 2 issues found                               │
│  [10:31:18] → A11y-012: Missing aria-label                 │
│  [10:31:18] → Auto-fixing...                               │
│  [10:31:19] ✓ Fixed: Added aria-label attribute            │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  Session Stats:                                             │
│  Files checked: 15                                          │
│  Issues found: 8                                            │
│  Auto-fixed: 6                                              │
│  Pending: 2 (require manual review)                         │
└─────────────────────────────────────────────────────────────┘

Press [q] to quit, [p] to pause, [s] for stats, [h] for history
```

### 5.2 通知机制

**桌面通知**

```typescript
// 使用 node-notifier 发送桌面通知
import notifier from 'node-notifier';

function notify(issue: Issue) {
  notifier.notify({
    title: 'QA-Agent: Issue Found',
    message: `${issue.severity}: ${issue.title}`,
    sound: issue.severity === 'critical',
    wait: true,
    actions: ['Fix', 'Ignore', 'View'],
  });
}
```

**Webhook 通知**

```yaml
# .qa-agent/config.yaml
notifications:
  webhook:
    url: https://hooks.slack.com/services/xxx
    events: [critical, fix_applied]
```

---

## 六、错误处理与帮助

### 6.1 错误提示

**友好错误**

```
┌─────────────────────────────────────────────────────────────┐
│  ❌ Error: Failed to connect to Playwright                  │
│                                                             │
│  The browser could not be launched. This might be because:  │
│  • Playwright browsers are not installed                    │
│  • System dependencies are missing                          │
│  • The browser binary is corrupted                          │
│                                                             │
│  Try running:                                               │
│    pnpm exec playwright install                             │
│                                                             │
│  If the problem persists, run with --debug for more info.   │
│                                                             │
│  Need help? https://qa-agent.dev/docs/troubleshooting       │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 帮助系统

**上下文帮助**

```
qa-agent diagnose --help

Usage: qa-agent diagnose [options]

Run quality diagnosis on your project.

Options:
  --skills <list>      Skills to run (default: all)
                       Available: e2e, a11y, perf, security, ui-ux
                       
  --output <format>    Output format (default: html)
                       Formats: html, json, markdown, compact
                       
  --fail-on <level>    Exit with error if issues found at this level
                       Levels: critical, warning, info
                       
  --quiet              Suppress all output except results
  --verbose            Show detailed progress
  --debug              Show debug information

Examples:
  # Run all skills
  $ qa-agent diagnose
  
  # Run specific skills
  $ qa-agent diagnose --skills=e2e,a11y
  
  # Output JSON for CI
  $ qa-agent diagnose --quiet --output=json
  
  # Fail CI on critical issues
  $ qa-agent diagnose --fail-on=critical

Documentation: https://qa-agent.dev/docs/diagnose
```

**交互式帮助**

```
qa-agent help diagnose

? What would you like to know about diagnose?
  ❯ Basic usage
    Output formats
    CI/CD integration
    Troubleshooting
    Exit codes
```

---

## 七、可访问性

### 7.1 终端可访问性

- 支持屏幕阅读器友好的输出模式
- 不依赖颜色传达信息（同时使用符号）
- 高对比度模式支持

```bash
# 高对比度模式
qa-agent diagnose --high-contrast

# 无颜色模式
qa-agent diagnose --no-color
```

### 7.2 键盘导航

所有交互界面完全支持键盘操作：

- `Tab` / `Shift+Tab`：在选项间导航
- `Enter`：确认选择
- `Escape`：取消/返回
- `Arrow keys`：滚动列表

---

## 八、性能体验

### 8.1 响应时间目标

| 操作 | 目标时间 | 可接受时间 |
|------|----------|------------|
| CLI 启动 | < 100ms | < 500ms |
| 显示帮助 | < 50ms | < 100ms |
| 开始诊断 | < 1s | < 2s |
| 单文件诊断 | < 5s | < 10s |
| 生成报告 | < 2s | < 5s |

### 8.2 感知优化

**骨架屏**

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 Diagnosing...                                           │
│                                                             │
│  Skills:                                                    │
│  ├── e2e-test      ░░░░░░░░░░░░░░░░░░░░░░░░  Loading...    │
│  ├── a11y-check    ░░░░░░░░░░░░░░░░░░░░░░░░  Loading...    │
│  └── perf-audit    ░░░░░░░░░░░░░░░░░░░░░░░░  Loading...    │
│                                                             │
│  Issues: Loading...                                         │
└─────────────────────────────────────────────────────────────┘
```

**乐观更新**

```typescript
// 在等待 LLM 响应时，先显示预期结果
async function diagnose() {
  // 立即显示进度
  showProgress('Analyzing project structure...');
  
  // 并行执行
  const [structure, issues] = await Promise.all([
    analyzeStructure(),
    detectIssues(),
  ]);
  
  // 乐观更新 UI
  updateUI(structure, issues);
}
```
