# Contributing to QA-Agent

Thank you for your interest in contributing to QA-Agent! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Submitting Changes](#submitting-changes)
- [Coding Standards](#coding-standards)
- [Commit Message Guidelines](#commit-message-guidelines)

## Code of Conduct

This project and everyone participating in it is governed by our commitment to:
- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Prioritize user experience and code quality

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/qa-agent.git
   cd qa-agent
   ```
3. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

### Prerequisites

- **Node.js** >= 18.0.0
- **Bun** >= 1.0.0 (recommended) or **pnpm** >= 8.0.0
- **Git**
- **Docker** (optional, for sandbox testing)

### Installation

```bash
# Install dependencies
bun install

# Install Playwright browsers
bunx playwright install

# Copy environment variables
cp .env.example .env
# Edit .env to add your API keys

# Verify setup
bun run typecheck
bun test
```

### Development Commands

```bash
# Run in development mode
bun run dev

# Run tests
bun test

# Run tests with coverage
bun run test:coverage

# Type checking
bun run typecheck

# Linting
bun run lint

# Build
bun run build
```

## Making Changes

### Project Structure

```
src/
├── cli/           # CLI commands
├── skills/        # Skill implementations
├── engines/       # Core engines (diagnosis, fix, verify)
├── web/           # Web Dashboard
├── models/        # LLM clients
└── types/         # TypeScript definitions
```

### Adding a New Skill

1. Create a new directory under `src/skills/builtin/your-skill/`
2. Implement the Skill interface:

```typescript
import { BaseSkill } from '../../base-skill';

export default class YourSkill extends BaseSkill {
  name = 'your-skill';
  version = '1.0.0';
  description = 'Description of your skill';

  async diagnose(context) {
    // Implement diagnosis logic
    return issues;
  }

  async fix(issue) {
    // Implement fix logic (optional)
    return fixResult;
  }
}
```

3. Register your skill in `src/skills/registry.ts`
4. Add tests in `tests/unit/skills/your-skill.test.ts`

### Adding a New CLI Command

1. Create a new file in `src/cli/commands/your-command.ts`
2. Implement using Commander.js:

```typescript
import { Command } from 'commander';

export const yourCommand = new Command('your-command')
  .description('Description of your command')
  .option('-f, --flag', 'Description')
  .action(async (options) => {
    // Implement command logic
  });
```

3. Register in `src/cli/index.ts`

## Submitting Changes

### Before Submitting

1. **Run all tests** and ensure they pass
2. **Check type safety**: `bun run typecheck`
3. **Update documentation** if needed
4. **Add tests** for new functionality
5. **Update CHANGELOG.md** with your changes

### Pull Request Process

1. **Update your branch** with the latest main:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Push your branch**:
   ```bash
   git push origin feature/your-feature-name
   ```

3. **Create a Pull Request** on GitHub with:
   - Clear title describing the change
   - Detailed description of what changed and why
   - Reference to any related issues
   - Screenshots (if UI changes)

4. **Address review feedback** promptly and professionally

### PR Checklist

- [ ] Tests pass locally
- [ ] Type checking passes
- [ ] Code follows project style guidelines
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Commits follow commit message guidelines

## Coding Standards

### TypeScript

- Use **strict mode** TypeScript
- Prefer `const` and `let`, avoid `var`
- Use `async/await` instead of callbacks
- Explicit return types for public functions
- Use interfaces over types when possible

### Code Style

```typescript
// Good
const result = await fetchData();
if (result.success) {
  return result.data;
}

// Avoid
fetchData().then((result) => {
  if (result.success) {
    return result.data;
  }
});
```

### Error Handling

```typescript
// Use custom error classes
class SkillError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'SkillError';
  }
}

// Throw with context
try {
  await skill.diagnose(context);
} catch (error) {
  throw new SkillError(
    `Failed to diagnose: ${error.message}`,
    'DIAGNOSE_FAILED'
  );
}
```

### Documentation

- Use JSDoc for public APIs
- Include examples in documentation
- Keep README.md up to date

```typescript
/**
 * Diagnoses accessibility issues in the given context
 * @param context - The skill context containing files and tools
 * @returns Array of diagnosed issues
 * @example
 * const issues = await skill.diagnose({
 *   files: ['src/App.tsx'],
 *   tools: { fs, browser }
 * });
 */
async diagnose(context: SkillContext): Promise<Diagnosis[]> {
  // Implementation
}
```

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, no logic change)
- **refactor**: Code refactoring
- **test**: Adding or updating tests
- **chore**: Build process or auxiliary tool changes

### Scopes

Common scopes:
- `cli`: CLI commands
- `skill`: Skill implementations
- `engine`: Core engines
- `web`: Web Dashboard
- `docs`: Documentation

### Examples

```
feat(skill): add performance auto-fix capability

- Implement bundle size optimization
- Add lazy loading suggestions
- Include image optimization fixes

Closes #123
```

```
fix(cli): resolve skill install command error

Handle missing skill name parameter gracefully
Add helpful error message

Fixes #456
```

```
docs(readme): update installation instructions

Add Windows-specific setup steps
Include troubleshooting section
```

## Testing Guidelines

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';

describe('YourSkill', () => {
  it('should detect specific issue', async () => {
    const skill = new YourSkill();
    const context = { /* test context */ };
    
    const issues = await skill.diagnose(context);
    
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('expected-type');
  });
});
```

### Integration Tests

Place in `tests/integration/` and test complete workflows.

### Test Coverage

Aim for:
- **80%+** overall coverage
- **100%** coverage for critical paths
- All public methods tested

## Questions?

- **Discord**: [Join our community](https://discord.gg/qa-agent)
- **Issues**: [GitHub Issues](https://github.com/your-org/qa-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/qa-agent/discussions)

Thank you for contributing to QA-Agent! 🎉
