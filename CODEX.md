# Codex Setup Guide for Jovie

This repo uses the shared Jovie setup and archive scripts for Codex. Keep Codex-specific files as thin wrappers so they cannot drift from `AGENTS.md`, `conductor.json`, or the scripts humans run locally.

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
pnpm run dev:web:local
pnpm run test:web
pnpm run build
pnpm run typecheck
pnpm lint
```

Commands that need secrets must use the repo wrappers or an explicit Doppler prefix:

```bash
doppler run --project jovie-web --config dev -- <command>
```
