# Codex Setup Guide for Jovie

This repo uses the shared Jovie setup and archive scripts for Codex. Keep Codex-specific files as thin wrappers so they cannot drift from `CLAUDE.md` (and its `AGENTS.md` symlink), the scoped rules under `.claude/rules/`, `conductor.json`, or the scripts humans run locally.

## Automatic Local Setup

Codex project config lives in `.codex/`:

- `.codex/config.toml` enables Codex lifecycle hooks.
- `.codex/hooks.json` runs `scripts/codex-setup.sh` on `SessionStart`.
- `.codex/hooks.json` runs `scripts/codex-cleanup.sh` on `Stop`.
- `.codex/local-env.toml` points Codex app worktree setup and common actions at the same wrappers.

Codex hooks are currently a Codex lifecycle feature and may not run on every platform. If hooks are unavailable, run the same scripts manually.

## Manual Setup

Run this from the repository root on every fresh worktree:

```bash
./scripts/codex-setup.sh
```

On Windows PowerShell, use the Git Bash wrapper:

```powershell
.\scripts\setup.ps1
```

`scripts/codex-setup.sh` delegates to the canonical bootstrap:

```bash
./scripts/setup.sh
```

That script verifies Node.js 22.x, pnpm 9.15.4, ripgrep, Doppler, GitHub CLI auth, installs dependencies, clears stale Turbopack cache, and syncs dev Clerk IDs when Doppler is available.

After the shared bootstrap succeeds, `scripts/codex-setup.sh` runs the optional
agent-only Clerk helper:

```bash
./scripts/clerk-agent-setup.sh
```

This helper only verifies the Clerk CLI and attempts `clerk skill install -y
--pm pnpm`. It is not part of `scripts/setup.sh`, and it must not be treated as
required human setup. If the Clerk CLI is missing, unsupported, or not logged in,
the helper reports the condition and exits successfully.

Codex agents may use Clerk CLI diagnostics such as `clerk --version`,
`clerk --help`, and `clerk skill install --help`. Do not run mutating Clerk app
setup commands in this repository, including `clerk init`, `clerk link`,
`clerk env pull`, `clerk doctor --fix`, or generated middleware/env rewrites.

## Cleanup

Codex stop hooks run:

```bash
./scripts/codex-cleanup.sh
```

By default this only performs safe, lightweight cleanup:

- prune stale git worktree metadata
- clear stale Turbopack cache entries

Optional heavier cleanup is controlled by environment flags:

```bash
CODEX_CLEANUP_E2E_USERS=1 ./scripts/codex-cleanup.sh
CODEX_ARCHIVE_ON_STOP=1 ./scripts/codex-cleanup.sh
```

`CODEX_CLEANUP_E2E_USERS=1` runs the E2E Clerk cleanup through Doppler. `CODEX_ARCHIVE_ON_STOP=1` delegates to `scripts/archive.sh`, which removes build artifacts and dependencies for archived workspaces.

## Required Tooling

| Tool | Required Version |
|------|------------------|
| Node.js | 22.x (22.13.0+) |
| pnpm | 9.15.4 |
| Doppler CLI | Required for secret-bound commands |
| GitHub CLI | Required for PR and GitHub automation |

## Common Commands

Always run commands from the repo root.

```bash
pnpm run dev:web:fast
pnpm run test:web
pnpm run build
pnpm run typecheck
pnpm lint
```

Commands that need secrets must use the repo wrappers or an explicit Doppler prefix:

```bash
doppler run --project jovie-web --config dev -- <command>
```

## Scoped Rules

Codex agents follow the same rules as Claude. The canonical entry point is `CLAUDE.md`/`AGENTS.md`, which points to topic-scoped files under `.claude/rules/` (environment, auth, db, ui, security, release, testing, infra, code-style, linear, gstack). Read the relevant rule before editing the topic it covers.
