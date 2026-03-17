# Branch Protection Configuration

This document tracks the required CI checks for the `main` branch.

## Current Configuration

**Last Updated**: 2026-03-17

### Required Status Checks

The following checks must pass before merging to `main`:

1. **PR Ready** - Aggregated fast lane (`ci-fast`: typecheck, lint, boundaries, guardrails)
2. **Gitleaks Secret Scanning** - Blocking secret scan on PRs and merge queue
3. **SonarCloud Quality Gate** - Blocking SonarCloud quality gate on internal PRs and merge queue when `SONAR_TOKEN` is configured
4. **Migration Guard** - Database migration validation
5. **Fork PR Gate** - Human-review gate for external fork PRs

### Configuration Details

- **Ruleset ID**: 10512119
- **Enforcement**: Active
- **Strict Status Checks**: Enabled
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

- **2026-03-17**: Added blocking Gitleaks and SonarCloud checks to branch protection
  - `Gitleaks Secret Scanning` now runs on PRs and merge queue
  - `SonarCloud Quality Gate` blocks internal PRs and merge queue when `SONAR_TOKEN` is configured
  - `Fork PR Gate` remains the human-review blocker for untrusted fork PRs
- **2025-12-23**: Added 6 new required checks (Env Example Guard, Typecheck, Guardrails, ci-fast, Migration Guard, CodeQL)
  - Previously only required: Lint
  - Now requires: 7 total checks covering security, type safety, code quality, and database safety
