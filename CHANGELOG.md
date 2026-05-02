# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Fixed accessibility issue in Diagnose.tsx: added aria-label to checkbox input
- Fixed encoding issues in e2e/index.ts: corrected garbled Chinese characters in suggestion messages

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
