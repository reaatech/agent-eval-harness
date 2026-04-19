# Contributing to agent-eval-harness

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/reaatech/agent-eval-harness.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature`

## Development

### Setup

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint

# Typecheck
npm run typecheck
```

### Code Style

- Use TypeScript strict mode
- Follow existing code patterns
- Use single quotes for strings
- Include trailing commas in objects
- 2-space indentation

### Testing

- Write tests for new features
- Maintain 80%+ code coverage
- Run tests before submitting PR: `npm test`

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Test additions/changes
- `chore:` - Build/config changes

Example: `feat(judge): add consensus voting for multi-judge evaluation`

## Pull Request Process

1. Update documentation as needed
2. Add/update tests
3. Ensure all tests pass
4. Update CHANGELOG.md with your changes
5. Request review from maintainers

## Areas for Contribution

- **New evaluation metrics** - Add new ways to evaluate agent quality
- **Provider integrations** - Support additional LLM providers
- **CI integrations** - Support additional CI platforms
- **Documentation** - Improve guides and examples
- **Bug fixes** - Fix any issues found
- **Performance** - Optimize evaluation speed

## Reporting Issues

- Use the GitHub issue template
- Include reproduction steps
- Provide expected vs actual behavior
- Include relevant logs/output

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
