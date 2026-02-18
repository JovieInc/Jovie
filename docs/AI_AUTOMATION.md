# AI Automation (CodeRabbit, auto-merge, CI healing, Sentry autofix)

This document explains the automation and labels used in this repo so agents can ship quickly without breaking `main`.

## Source of truth

- `.github/workflows/ci.yml`
- `.github/workflows/claude.yml`
- `.github/workflows/sentry-autofix.yml`
- `.github/workflows/neon-ephemeral-branch-cleanup.yml`
- `.coderabbit.yaml`

## Auto-merge

- Auto-merge is allowed only when CI is green and the PR is eligible.
- Use the `auto-merge` label only for low-risk changes.

### Do not fight automation

If an automated workflow opens a fix PR (e.g. Codex/CI healing):

- Prefer incorporating the fix or making a follow-up PR.
- Do not repeatedly override it unless you are certain it is incorrect.

## AI automation labels

These labels are used to coordinate automation and prevent merge loops.

### `ai:auto-fix`

- Intended for safe, mechanical fixes (format/lint/simple type errors).

### `ai:fixing`

- Indicates an automated agent/workflow is actively making changes.
- Do not apply additional automated changes until it clears.

### `ai:fixed`

- Automation completed successfully.

### `ai:failed`

- Automation could not safely fix the issue.
- A human decision is required.

### `ai:opt-out`

- Disables AI automation for the PR.
- Use when the PR touches high-risk areas (auth, payments, migrations) or when human review is required.

## CI healing labels

### `ci:auto-heal`

- Opt-in label for automatic CI recovery.

### `ci:healing`

- CI auto-heal is currently running.

### `ci:healed`

- CI auto-heal succeeded.

### `ci:manual`

- CI failure requires manual intervention.

## Sentry Autofix Pipeline

End-to-end automation from production errors to fix PRs.

### Pipeline flow

```
Sentry Alert → GitHub Issue [sentry, bug] → CodeRabbit Plan → Claude Fix → PR
```

1. **Sentry** detects a production error and creates a GitHub Issue (labels: `sentry`, `bug`)
2. **CodeRabbit Issue Planner** auto-generates an implementation plan on the issue
3. **`sentry-autofix.yml`** detects the plan comment and triggers Claude Code
4. **Claude** implements the fix, runs validation, and opens a PR
5. **CodeRabbit** reviews the PR automatically
6. **CI** runs, and if green, the PR auto-merges

### Sentry labels

#### `sentry`

- Issue was created by a Sentry alert rule.
- Triggers CodeRabbit auto-planning (configured in `.coderabbit.yaml`).

#### `needs-human`

- Autofix failed or the issue requires changes to high-risk paths.
- A human developer must resolve this manually.

### Disabling

- **Per-issue**: Add `ai:opt-out` label to any Sentry issue.
- **Globally**: Disable the Sentry alert rule in Sentry UI, or disable the workflow in GitHub Actions.

### Safety

- Single attempt per issue (no retry loops).
- Scope guard: max 10 files, no changes to auth/payments/migrations/middleware.
- Label state machine prevents re-triggering: `sentry,bug` → `ai:fixing` → `ai:fixed` or `ai:failed`.

See `docs/SENTRY_GITHUB_SETUP.md` for full setup instructions.

## CodeRabbit CLI (local)

If you use CodeRabbit locally, keep it lightweight:

- Run it at most 3 times per change set.
- Prefer prompt-only mode and apply fixes deliberately.

Example:

```bash
cr review --prompt-only -t uncommitted
```
