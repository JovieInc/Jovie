# Commit Message Guide

## Quick Start

Use one of these methods for conventional commits:

### Option 1: Commitizen (Interactive)
```bash
pnpm commit
```

### Option 2: Commit Helper Script  
```bash
./scripts/commit.sh
```

### Option 3: Git Template (Manual)
```bash
git commit  # Opens editor with template
```

## Conventional Commit Format

```
<type>: <subject>

<body>

<footer>
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `chore`: Maintenance/tooling changes
- `docs`: Documentation only
- `style`: Formatting, no code change
- `refactor`: Code restructuring
- `perf`: Performance improvement
- `test`: Adding/fixing tests
- `ci`: CI/CD changes

### Rules
- Use lowercase for type (no [brackets])
- Subject line max 50 chars, no period at end
- Body max 72 chars per line (enforced by commitlint)
- Use imperative mood ("add" not "adds" or "added")
- Reference issues/PRs in footer

### Examples
```
feat: add user authentication

Implement OAuth integration with Google and GitHub providers
to support secure user login and profile management.

Closes #123
```

```
fix: resolve memory leak in dashboard

Free unused event listeners and component references
when unmounting dashboard components.

Fixes #456
```

## Auto-fixing

Pre-commit hooks automatically fix:
- Import ordering (biome)
- Code formatting (biome + eslint)
- Line length violations

This prevents Claude Code from needing to retry commits due to formatting issues.