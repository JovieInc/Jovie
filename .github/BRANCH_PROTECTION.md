# Branch Protection Configuration

This document tracks the required CI checks for the `main` branch.

## Current Configuration

**Last Updated**: 2026-02-10

### Required Status Checks

The following checks must pass before merging to `main`:

1. **Lint** - Code quality linting
2. **Env Example Guard** - Prevents secret leaks in .env.example
3. **Typecheck** - TypeScript type safety validation
4. **Guardrails (proxy + format)** - Code formatting + Next.js proxy security
5. **ci-fast** - Meta-gate aggregating fast checks
6. **Migration Guard** - Database migration validation
7. **CodeQL** - SAST security scanning
8. **A11y (axe)** - WCAG 2.1 AA accessibility audit on public routes (via `ci-pr-ready` gate)

### Configuration Details

- **Ruleset ID**: 10512119
- **Enforcement**: Active
- **Strict Status Checks**: Disabled (allows merging without being up-to-date with base branch)
- **Integration**: GitHub Actions (ID: 15368)

### Additional Rules

- **Pull Request**: No required approvals (for fast iteration)
- **Linear History**: Required (prevents merge commits)
- **Copilot Code Review**: Enabled for all PRs

## Making Changes

To update the required checks, use the GitHub API:

```bash
gh api --method PUT repos/JovieInc/Jovie/rulesets/10512119 --input - <<'EOF'
{
  "enforcement": "active",
  "name": "main",
  "rules": [
    // ... see implementation in plan file
  ]
}
EOF
```

Full configuration is tracked in `/Users/timwhite/.claude/plans/glistening-dazzling-pike.md`

## History

- **2026-02-10**: Added A11y (axe) check to `ci-pr-ready` gate
  - Runs axe-core WCAG 2.1 AA audit on 5 public routes (no auth needed)
  - Path-gated: skips when no UI-relevant files changed
  - Excluded rules: `color-contrast` (tracked separately as design token issue)
  - Escape hatch: add rules to `disableRules` in `tests/e2e/axe-audit.spec.ts`
- **2025-12-23**: Added 6 new required checks (Env Example Guard, Typecheck, Guardrails, ci-fast, Migration Guard, CodeQL)
  - Previously only required: Lint
  - Now requires: 7 total checks covering security, type safety, code quality, and database safety
