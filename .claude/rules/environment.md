---
paths: ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".nvmrc", ".node-version", "scripts/setup*", ".codex/**"]
---

# Environment Setup

Local + cloud bootstrap, Doppler, database isolation, quick troubleshooting.

## Bootstrap

Before running ANY command in this repo:

```bash
./scripts/setup.sh
```

On Windows PowerShell, use the wrapper so Git for Windows Bash is used (not the WSL launcher):

```powershell
.\scripts\setup.ps1
```

`setup.sh` is idempotent. It checks Node.js (24.x), pnpm (9.15.9), `ripgrep`, Doppler CLI, and GitHub CLI auth, installs missing tools when supported, runs `pnpm install`, and verifies Doppler auth.

Create agent worktrees with `scripts/agent/worktree-new <dir> -b <branch>`: it hands out a pre-installed, typecheck-warm worktree from the pool in `~/.cache/jovie` (~35s instead of ~5 min) and falls back to `git worktree add` + install when the pool is empty. A worktree made any other way needs `./scripts/setup.sh` before anything else, because worktrees do not share `node_modules`.

## Tool Versions (Required)

| Tool | Required Version | Enforcement |
|------|------------------|-------------|
| **Node.js** | **24.x** (24.21.0+) | `.nvmrc`, `package.json` engines |
| **pnpm** | **9.15.9** (`packageManager`); engines `>=9.15.4 <10` | `package.json` |
| **Turbo** | 2.8+ | Root devDependencies |

AI agents frequently default to Node 18/20/22 which **will fail** or cause subtle issues. The entire CI/CD pipeline, build system, and runtime are configured for Node 24 LTS.

### Pre-Flight Checklist

```bash
node --version  # Expected: v24.21.0 or higher
pnpm --version  # Expected: 9.15.9

# If wrong:
nvm use 24       # or: nvm install 24
corepack enable && corepack prepare pnpm@9.15.9 --activate
```

## Common Mistakes

| Wrong | Correct |
|-------|---------|
| `npm install` | `pnpm install` |
| `yarn add` | `pnpm add` |
| `npx turbo ...` | `pnpm turbo ...` |
| Running turbo from wrong directory | Always run from repo root |
| `cd apps/web && pnpm dev` | `pnpm run dev:web:fast` |
| `node script.js` with Node < 24 | Verify `node --version` first |

## Doppler (Secrets)

ALL commands that need secrets MUST be prefixed with Doppler. Local/dev commands should pin the repo's default scope explicitly as `doppler run --project jovie-web --config dev --`.

Already wrapped (use these directly):
- `pnpm run test:web`
- `pnpm run test:web:watch`
- `pnpm run test:web:e2e`
- `pnpm run test:web:smoke`
- `pnpm run dev:web:fast`
- `pnpm run dev:web:local`
- `pnpm run dev:web:browse`

`pnpm test` alone **will fail** — missing env vars.

Reason: local agents and worktrees should not rely on whatever Doppler scope happens to be active in the shell.

### Install Doppler

```bash
# macOS/Linux
curl -Lsf https://cli.doppler.com/install.sh | sh

# Windows (PowerShell)
(Invoke-WebRequest -Uri "https://cli.doppler.com/install.ps1" -UseBasicParsing).Content | powershell
```

Authenticate and configure:

```bash
doppler login
doppler setup --project jovie-web --config dev
```

### CI / Automation

Set `DOPPLER_TOKEN` env var:

```bash
doppler run --token "$DOPPLER_TOKEN" -- <command>
```

## Cloud Container Bootstrap (AI Agent Platforms)

For headless/container environments (Codex, cloud sandboxes, CI runners). Requires `DOPPLER_TOKEN`.

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Node 24 LTS + pnpm
curl -fsSL https://fnm.vercel.app/install | bash
export PATH="$HOME/.local/share/fnm:$PATH"
eval "$(fnm env)"
fnm install 24.21.0 && fnm use 24.21.0
corepack enable && corepack prepare pnpm@9.15.9 --activate

# 2. Doppler CLI
apt-get update && apt-get install -y apt-transport-https ca-certificates curl gnupg
curl -sLf --retry 3 --tlsv1.2 --proto "=https" \
  'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' \
  | gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" \
  | tee /etc/apt/sources.list.d/doppler-cli.list
apt-get update && apt-get install -y doppler

# 3. Configure secrets (DOPPLER_TOKEN must be set)
doppler setup --project jovie-web --config dev --no-interactive
doppler secrets download --no-file --format env-no-quotes > apps/web/.env.local

# 4. Install dependencies + verify
pnpm install
pnpm turbo build --filter=@jovie/web
```

**Creating a Doppler service token:** Doppler dashboard → Project `jovie-web` → Config `dev` → Access → Service Tokens → Generate. Pass as `DOPPLER_TOKEN`.

**Alternative:** `./scripts/codex-setup.sh` (Codex wrapper that delegates to `./scripts/setup.sh`). Codex lifecycle config in `.codex/` runs that wrapper automatically when supported.

## Database Isolation for Agents

Do **NOT** create Neon ephemeral branches automatically in `./scripts/setup.sh`.

`setup.sh` must stay a fast, idempotent local bootstrap:
- verify/install required tools
- install dependencies
- verify Doppler auth/config
- verify GitHub CLI auth when present, including `GH_TOKEN`/`GITHUB_TOKEN` supplied by the environment or Doppler
- avoid creating remote infrastructure by default

Warm Claude/Codex SessionStart reuses this script. When the deps fingerprint at `node_modules/.cache/jovie-setup/deps.sha256` matches and Node/pnpm pins are ok, `setup.sh` exits before Doppler, gh, Clerk, migration drift, and cache lsof. Cold or stale worktrees still run the full body. Set `JOVIE_SETUP_FORCE=1` to force a full bootstrap. Codex SessionStart still runs gbrain sync after `setup.sh` returns.

Creating an isolated database branch for every fresh worktree is wasteful and can exhaust Neon branch limits. Most agent tasks do not need a private mutable database.

Use an ephemeral Neon branch **only when the task actually requires isolated DB state**:
- mutation-heavy QA or crawling
- end-to-end flows that create/update/delete data
- migration validation
- debugging issues caused by shared state

Default policy:
- normal coding/review/docs tasks: standard local/dev configuration
- local tasks needing isolated mutable state: provision a DB branch explicitly via a dedicated command or script
- PR preview / CI QA: prefer per-PR ephemeral databases in CI or preview workflows, not local worktree bootstrap

If a dedicated helper is added later (e.g. `./scripts/dev-db-branch.sh`), agents should run it explicitly when needed rather than baking branch creation into `setup.sh`.

## Monorepo Commands (Turbo)

**Always run from repository root.** Never `cd` into packages to run commands.

For daily local web dev and secret-bound test flows, prefer the root wrappers (`pnpm run dev:web:fast`, `pnpm run dev:web:local`, `pnpm run dev:web:browse`, `pnpm run test:web`) over direct filtered package commands.

```bash
# Development
pnpm dev                    # Web-only fast dev (same as dev:web:fast)
pnpm run dev:all            # All workspace dev servers (docs, console, should-i-make, web, desktop)
pnpm run dev:web:fast       # Fast local web app with pinned Doppler scope
pnpm run dev:web:local      # Local web app without fast prewarm defaults
pnpm run dev:cleanup        # Dry-run: list stale next/turbo dev processes (default >=4h)
pnpm run dev:cleanup:force  # Terminate stale next/turbo dev processes

# Building
pnpm build                  # Build all packages
pnpm --filter web build     # Build only web app

# Testing
pnpm test                   # Run all workspace tests
pnpm run test:web           # Web tests with pinned Doppler scope

# Linting & Type Checking
pnpm lint                   # Lint all packages
pnpm typecheck              # Type check all packages

# Database (web app specific)
pnpm --filter web drizzle:generate   # Generate migrations
pnpm run db:web:migrate              # Apply migrations with pinned Doppler scope
pnpm run db:web:studio               # Open Drizzle Studio with pinned Doppler scope
```

### Turborepo 2.8 Features

All tasks in `turbo.json` have `description` fields. Run `pnpm turbo build --dry` to see task descriptions and the execution plan.

Search Turborepo docs from the terminal:

```bash
turbo docs "task configuration"
turbo docs "remote caching setup"
turbo docs "environment variables"
```

Machine-readable docs: append `.md` to any URL at `turborepo.dev` (e.g., `turborepo.dev/docs/reference/configuration.md`). Full sitemap: `turborepo.dev/sitemap.md`.

### Affected Builds

```bash
pnpm turbo build --affected
pnpm turbo test --affected
pnpm turbo lint --affected
```

For non-standard setups, set `TURBO_SCM_BASE` and `TURBO_SCM_HEAD` explicitly.

### Turbo Quick Reference

```
topic|config/command|notes
task-deps|dependsOn: ["^build"]|^ = topological (upstream first), no prefix = same-package
task-inputs|inputs: ["$TURBO_DEFAULT$", "!**/*.test.ts"]|narrow cache key, exclude tests from build
task-outputs|outputs: [".next/**", "dist/**"]|what turbo caches and restores on hit
task-description|description: "what this task does"|human/agent-readable, no execution effect (2.8+)
env-vars|env: ["NODE_ENV", "NEXT_PUBLIC_*"]|wildcards supported, affects cache hash
global-deps|globalDependencies: [".env.*local"]|changes invalidate ALL task caches
pass-through-env|globalPassThroughEnv: ["SENTRY_AUTH_TOKEN"]|available at runtime but doesn't affect cache
persistent|"persistent": true|long-running (dev servers), can't be depended on
interruptible|"interruptible": true|turbo watch can restart if inputs change
no-cache|"cache": false|always re-runs (dev, format, lint:fix, drizzle:generate)
remote-cache|remoteCache.enabled: true|share cache across CI and local machines
affected|--affected|run only changed packages vs base branch (CI optimization)
concurrency|--concurrency=N or --concurrency=50%|limit parallel tasks (OOM mitigation)
dry-run|--dry / --dry=json|preview execution plan without running
filter|--filter=@jovie/web|run task for specific package only
graph|--graph|visualize task dependency graph (svg, png, json, html)
force|--force|ignore cache, re-execute all tasks
output-logs|outputLogs: "errors-only"|reduce log noise (full, hash-only, new-only, errors-only, none)
summarize|--summarize|generate JSON metadata for timing/cache analysis
turbo-clean|pnpm turbo clean|clear local cache when debugging
turbo-docs|turbo docs "query"|search turborepo.dev documentation from terminal (2.8+)
worktrees|scripts/agent/worktree-new ../dir -b branch|cache shared automatically across worktrees (2.8+)
schema|$schema: turborepo.dev/schema.json|validates turbo.json in editors
daemon|daemon: false|background process for optimization (disabled in Jovie due to gRPC issues)
```

## Git Worktrees for Parallel Agents

```bash
scripts/agent/worktree-new ../Jovie-agent-1 -b agent/task-name   # fetch, take a pool slot, install
cd ../Jovie-agent-1 && pnpm turbo build
scripts/agent/worktree-new --recycle ../Jovie-agent-1             # clean: back to the pool; dirty/preserved: refused
```

| Cache | Location | Shared how |
|---|---|---|
| Worktree pool (installed `node_modules` + warm `apps/web/.cache/tsbuildinfo`) | `~/.cache/jovie/worktree-pool/<repo>/` | `worktree-new` moves a slot to your path and refills in the background; `--status`, `--fill`, `--drain` |
| pnpm content store | `pnpm store path` (same APFS volume) | hardlinked into each worktree; never prune it while worktrees install |
| Turbo local cache | main checkout's `.turbo/cache` | Turbo 2.8+ resolves it through the git common dir for every worktree |
| Git objects | main checkout's `.git` | every linked worktree shares them; `setup.sh` runs `git maintenance start` (incremental strategy, never prunes: lanes clones borrow these objects via alternates) |

All shared caches live under `$JOVIE_CACHE_ROOT` (default `~/.cache/jovie`). Cleanup tools must not delete that root wholesale: `worktree-new --drain` (or `disk_guard`, below the pool's 30 GiB floor) removes pool slots safely.

### Concurrent Commits Across Worktrees

`git stash` is **repo-global** — every worktree writes to the same
`.git/refs/stash` stack. The pre-commit hook therefore runs
`pnpm exec lint-staged --no-stash`: lint-staged still selects files from each
worktree's staged diff, but it does not create a shared automatic-backup stash.
Concurrent `git commit` processes in isolated worktrees are supported.

Do not replace `--no-stash` with stash cleanup or commit serialization, and
never use `--no-verify`. When changing the hook, run
`pnpm gate-ladder:test`; its regression creates two linked worktrees, commits in
both at the same time, and verifies staged-only task inputs with no stash race.

Without the automatic backup, lint-staged leaves task modifications in the
index when a task fails. Inspect and fix that worktree before retrying the
commit; do not assume a failed hook restored the index.

## Quick Troubleshooting

### "Command not found: pnpm"
```bash
corepack enable && corepack prepare pnpm@9.15.9 --activate
```

### "Node version mismatch"
```bash
nvm install 24 && nvm use 24
# Or check .nvmrc: cat .nvmrc
```

### "Turbo cache issues"
```bash
pnpm turbo clean
rm -rf node_modules/.cache
```

### "Test OOM / Out of Memory"
```bash
pnpm turbo test --concurrency=1
pnpm turbo test --affected
pnpm turbo test --affected --concurrency=1
```

The web app already uses `NODE_OPTIONS=--max-old-space-size=4096` and `--pool=forks --maxWorkers=2` for memory safety.

### "Type errors after pull"
```bash
pnpm install
pnpm typecheck
```

## Workspace Topology

Three workspaces, each on a different machine, with a clear separation of concerns:

- **Houston** (this repo, MacBook Pro 32 GB) — the **code** workspace. Default profile: `coder`. Claude Code, Codex CLI, Conductor worktrees, and Hermes issue runners all live here. PRs originate here.
- **Raleigh** (`/Users/timwhite/conductor/workspaces/ops/raleigh`) — the **ops / FounderOS** workspace. Source of truth for `company_state.md`, daily briefings, and task routing.
- **Hermes-Air** (MacBook Air 16 GB, dedicated): since 2026-09-29 the fleet's always-on **Mac lane**. It hosts the heartbeat-gated self-hosted macOS Actions runner (`jovie-mac`) and a nightly Mac dogfood verifier that files `mac-dogfood` Linear issues. It is a gbrain client of the ops Mac, and the Hermes gateway is retired. **Does not author code unattended.** See [`.claude/rules/hermes-air.md`](hermes-air.md) and [`docs/HERMES_AIR.md`](../../docs/HERMES_AIR.md).

The contract between Hermes-Air and Houston is Linear issues. The contract between Hermes-Air and Raleigh is gbrain over Tailscale. Keep code changes in Houston; keep orchestration on the Air; keep company-state in Raleigh.

## Branch Switches And External Editors

- Stop the worktree's dev server before checkout, stash or stash-pop operations.
  If Turbopack output is stale afterwards, remove only that worktree's generated
  `apps/web/.next` cache and restart; preserve source and other active worktrees.
- Coordinate with another editor before editing a file it has open: close that
  file there or disable its autosave for the edit. Verify `git diff` and reread
  the saved file after the edit and before committing. An editor overwrite is a
  persistence failure; resolve the competing writer before retrying.
