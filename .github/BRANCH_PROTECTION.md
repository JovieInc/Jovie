# Branch Protection Configuration

This document tracks the required CI checks for the `main` branch.

## Current Configuration

**Last Updated**: 2026-06-29

### Required Status Checks

The following check contexts must pass before merging to `main`. This list
mirrors ruleset 10512119 — verify with:

```bash
gh api repos/JovieInc/Jovie/rulesets/10512119 \
  --jq '.rules[]|select(.type=="required_status_checks")|.parameters.required_status_checks[].context'
```

1. **PR Ready** - The single aggregate merge gate (`ci-pr-ready` job in `ci.yml`): fans in typecheck, biome, guardrails, structural contract, unit tests, risk classifier + risk-triggered preview evidence (build is advisory)
2. **Migration Guard** - Database migration validation (path-gated to DB/schema changes)
3. **Fork PR Gate** - Blocks unreviewed external fork PRs; auto-passes for agents + team
4. **PR Size Guard** - Caps PR size (800 lines / 40 files) to force small, reviewable PRs; `big-pr` remains mechanical-only. A labeled `integration-train` with a machine-readable body block linking at least two component PRs has a fail-closed 2500-line / 60-file cap.

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

- **2026-06-29**: Added **PR Size Guard** to required status checks (ruleset 10512119, GH #12131)
  - Caps PRs at 800 lines / 40 files (repo vars `PR_MAX_LINES` / `PR_MAX_FILES`); `big-pr` label opts out
  - Closes the gap where oversized PRs could merge despite the size-guard workflow failing
  - Also refreshed the required-checks list above to the current aggregate gates (PR Ready / Migration Guard / Fork PR Gate / PR Size Guard); the prior list predated the `PR Ready` aggregation
- **2026-02-10**: Added A11y (axe) check to `ci-pr-ready` gate
  - Runs axe-core WCAG 2.1 AA audit on 5 public routes (no auth needed)
  - Path-gated: skips when no UI-relevant files changed
  - Excluded rules: `color-contrast` (tracked separately as design token issue)
  - Escape hatch: add rules to `disableRules` in `tests/e2e/axe-audit.spec.ts`
- **2025-12-23**: Added 6 new required checks (Env Example Guard, Typecheck, Guardrails, ci-fast, Migration Guard, CodeQL)
  - Previously only required: Lint
  - Now requires: 7 total checks covering security, type safety, code quality, and database safety
