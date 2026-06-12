# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **LLM 多 Provider 抽象** (`src/models/`)：OpenAI / Anthropic / DeepSeek / Zhipu / Moonshot / Ollama 6 大工厂
- **E2E Skill 双路径生成** (`src/skills/builtin/e2e/index.ts`)：真实 LLM 路径 + template-based fallback（无 API key 时启用）
- **E2E `extractSelectors` regex 增强**：支持 `getByRole('button', { name: 'X' })` 的 `name/label/text` 字段提取
- **性能 Skill 评分体系** (`src/skills/builtin/performance/index.ts`)：
  - `estimatePerformanceScore(diagnoses)` — severity-weighted 0-100 估算
  - `performanceGrade(score)` — A/B/C/D/F 分级
  - `runLighthouseAudit(url)` — v0.3.0 占位（待 Chrome 二进制）
- **Unit tests**：
  - `tests/unit/performance.test.ts` — 17 cases (estimatePerformanceScore / performanceGrade / runLighthouseAudit)
  - `tests/unit/e2e.test.ts` 增加 8 cases (mock fallback 路径)
  - `tests/integration/llm-eval.integration.test.ts` — 11 pass / 7 skip（`describe.skipIf(!hasAnyApiKey)` 模式）

### Fixed
- **11 个 unit test 跨文件污染失败**：`feedback-loop.test.ts` + `ab-testing.test.ts` 的 `mock.module('fs', ...)` 顶层调用污染 module registry，破坏 phase5-engines + prompt-tuner 的真实 fs 调用。改用真实 `tmpDir` + `basePath` / `storageDir` 参数化实现文件隔离。
- **`Severity` 类型 mismatch**：`SEVERITY_WEIGHT` 中 `'error' → 'critical'`，同步 tests 中 3 处字面量
- **`gitignore` 噪音 commit 治本**：加 `qa-eval-report.json` + `qa-dashboard.html` 阻止 Trae IDE 自动 commit 钩子

### Changed
- **历史 commit 合并** (`cecd725`)：36 个噪音 commit + 真实改动通过 `git reset --soft 1960088` 合并成 1 个 consolidated commit，force-push 清理
- **Eval-harness baseline 维持**：87.1% pass / 89.8% F1（7 个 Skill 全部 ≥ 80% F1）

### Stats (v3.1)
- Unit tests: **448 pass / 0 fail / 1084 expect** (20 文件)
- Integration tests: **119 pass / 7 skip / 2 fail** (5 文件，2 个 pre-existing 边界用例)
- TSC: **0 errors**
- Eval-harness: **87.1% / 89.8% F1** (a11y 92.9% / security 88.6% / perf 87.7% / react 88.9% / vue 80.0% / nextjs 100% / nuxt 90.6%)
- Commits this session: **5 new commits** (LLM integration, E2E fallback, performance score, test refactor, history consolidation)

## [0.1.0] - 2025-05-02

### Added
- Initial release of QA-Agent
- CLI framework with 6 core commands: diagnose, fix, audit, web, ci, skill
- 5 built-in Skills:
  - E2E testing with Playwright integration
  - UI/UX audit with design token extraction
  - Accessibility (a11y) checking with WCAG 2.2 support
  - Performance auditing
  - Security scanning
- Auto-fix capabilities for a11y and E2E skills
- Web Dashboard with React + Hono
- CI/CD integration for GitHub Actions, GitLab CI, Jenkins, and CircleCI
- Sandbox system for previewing fixes
- Project health audit
- Figma integration for design token sync
- Report generation (HTML, JSON, Markdown)

### Features
- Natural language test generation
- Smart selector healing
- Visual regression testing
- Design token extraction and validation
- Interactive fix preview
- Multi-format output support

## Future Roadmap

### [0.2.0] - Planned
- Complete auto-fix for all Skills (performance, security, ui-ux)
- Skill management commands (install, update, create)
- Configuration file support (.qa-agent/config.yml)
- Watch mode for continuous monitoring

### [0.3.0] - Planned
- Enhanced test coverage (target: 80%+)
- Web UI production build optimization
- Integration tests
- IDE plugins (VS Code)

### [1.0.0] - Planned
- Skill marketplace
- Enterprise features (team collaboration, permissions)
- Internationalization support
- Stable API

[unreleased]: https://github.com/your-org/qa-agent/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/your-org/qa-agent/releases/tag/v0.1.0
