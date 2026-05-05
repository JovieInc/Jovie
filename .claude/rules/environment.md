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

`setup.sh` is idempotent. It checks Node.js (22.x), pnpm (9.15.4), `ripgrep`, Doppler CLI, and GitHub CLI auth, installs missing tools when supported, runs `pnpm install`, and verifies Doppler auth.

Run `./scripts/setup.sh` again on every fresh Git worktree before doing anything else. Worktrees do not share `node_modules`, so dependency installation is per-worktree even when Turbo cache is shared.

## Tool Versions (Required)

| Tool | Required Version | Enforcement |
|------|------------------|-------------|
| **Node.js** | **22.x** (22.13.0+) | `.nvmrc`, `package.json` engines |
| **pnpm** | **9.15.4** (exact) | `package.json` packageManager field |
| **Turbo** | 2.8+ | Root devDependencies |

AI agents frequently default to Node 18/20 which **will fail** or cause subtle issues. The entire CI/CD pipeline, build system, and runtime are configured for Node 22 LTS.

### Pre-Flight Checklist

```bash
node --version  # Expected: v22.13.0 or higher
pnpm --version  # Expected: 9.15.4

# If wrong:
nvm use 22       # or: nvm install 22
corepack enable && corepack prepare pnpm@9.15.4 --activate
```

## Common Mistakes

| Wrong | Correct |
|-------|---------|
| `npm install` | `pnpm install` |
| `yarn add` | `pnpm add` |
| `npx turbo ...` | `pnpm turbo ...` |
| Running turbo from wrong directory | Always run from repo root |
| `cd apps/web && pnpm dev` | `pnpm run dev:web:fast` |
| `node script.js` with Node < 22 | Verify `node --version` first |

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

# 1. Node 22 LTS + pnpm
curl -fsSL https://fnm.vercel.app/install | bash
export PATH="$HOME/.local/share/fnm:$PATH"
eval "$(fnm env)"
fnm install 22.13.0 && fnm use 22.13.0
corepack enable && corepack prepare pnpm@9.15.4 --activate

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
pnpm dev                    # Start all dev servers
pnpm run dev:web:fast       # Fast local web app with pinned Doppler scope
pnpm run dev:web:local      # Local web app without fast prewarm defaults

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
worktrees|git worktree add ../dir -b branch|cache shared automatically across worktrees (2.8+)
schema|$schema: turborepo.dev/schema.json|validates turbo.json in editors
daemon|daemon: false|background process for optimization (disabled in Jovie due to gRPC issues)
```

## Git Worktrees for Parallel Agents

Turbo 2.8 automatically shares local cache across Git worktrees.

```bash
git worktree add ../Jovie-agent-1 -b agent/task-name
cd ../Jovie-agent-1 && ./scripts/setup.sh && pnpm turbo build
git worktree remove ../Jovie-agent-1
```

No configuration is needed — Turbo detects worktrees automatically. Combined with remote caching, agents in separate worktrees get near-instant cache hits.

### Concurrent Commit Pitfall — `git stash` Races Across Worktrees

`git stash` is **repo-global** — every worktree writes to the same `.git/refs/stash` stack. lint-staged backs up the working tree to a stash before running tasks and pops it on cleanup. When multiple worktrees invoke `git commit` concurrently, their lint-staged runs step on each other's backup stashes.

Symptom (from a parallel swarm of worktree agents):

```
[STARTED] Cleaning up temporary files...
[FAILED] lint-staged automatic backup is missing!
husky - pre-commit script failed (code 1)
```

Important: the commit itself often **succeeds** before husky errors on cleanup. Check `git log --oneline origin/main..HEAD` before assuming the work was lost and retrying — a blind retry after "failure" is how duplicate commits get introduced.

Mitigations (in priority order):

1. **Serialize commits across worktrees** in the orchestrator. Don't fire `git commit` in 5 worktrees at once; queue them.
2. Before commit, drop stale lint-staged stashes left by prior failed runs: `while git stash list | grep -q "lint-staged automatic backup"; do git stash drop "stash@{0}"; done`. Run this right before the commit, not preemptively.
3. If you're running long-lived parallel worktree agents (like `/swarm`), dispatch each agent in its own backgrounded turn so their commit windows rarely overlap.

**Never** use `--no-verify` to route around this. The hook failure message is cosmetic, but the fix is coordination, not skipping validation.

## Quick Troubleshooting

### "Command not found: pnpm"
```bash
corepack enable && corepack prepare pnpm@9.15.4 --activate
```

### "Node version mismatch"
```bash
nvm install 22 && nvm use 22
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

This repo is the main code workspace.

- Default coding profile: `coder`
- Ops / FounderOS workspace: `/Users/timwhite/conductor/workspaces/ops/raleigh`
- Treat that ops repo as the source of truth for `company_state.md`, daily briefings, and task routing
- Keep code changes in this repo; keep orchestration and company-state updates in the ops repo
