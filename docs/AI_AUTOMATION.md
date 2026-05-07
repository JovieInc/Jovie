# AI Automation (CodeRabbit, auto-merge, CI healing)

This document explains the automation and labels used in this repo so agents can ship quickly without breaking `main`.

## Source of truth

- `.github/workflows/ci.yml`
- `.github/workflows/claude.yml`
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

## PR comment learning loop

The repo uses a weekly Codex workspace automation, `PR Comment Hardening Retro`, to mine recent PR review comments for repeated agent mistakes. This is not a production app cron, not a Vercel cron route, and not a GitHub Actions schedule.

Local analyzer:

```bash
node scripts/pr-comment-retro.mjs --since-days 7 --dry-run
```

Default behavior:

- Scans up to 100 recently updated PRs in the current GitHub repo.
- Counts actionable root inline findings from CodeRabbit, Greptile, Sentry, and human reviewers.
- Ignores bot summaries, addressed confirmations, replies, nitpicks, and outdated inline comments.
- Classifies repeated mistakes into hardening categories such as malformed state handling, path/scope gaps, silent reports, workflow scheduling, generated docs drift, auth boundaries, UI flow, and database edge cases.

Durable hardening policy:

- Open draft PRs only for bounded docs, tests, or skill-template hardening.
- Prefer focused regression tests for deterministic parser/script failures.
- Update gstack `.tmpl` files before regenerating derived `SKILL.md` files.
- Update `LESSONS.md` only for repeated root causes, not every weekly finding.
- Create or mention a Linear follow-up when the right fix requires product work, broad refactors, auth/billing/migration changes, or human prioritization.
- Never auto-merge, never create app/Vercel cron routes, and never touch high-risk paths without human review.

## CodeRabbit CLI (local)

If you use CodeRabbit locally, keep it lightweight:

- Run it at most 3 times per change set.
- Prefer prompt-only mode and apply fixes deliberately.

Example:

```bash
cr review --prompt-only -t uncommitted
```
