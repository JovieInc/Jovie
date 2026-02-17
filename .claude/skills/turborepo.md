---
description: Turborepo monorepo expert. Use when running builds, understanding task dependencies, debugging cache issues, configuring CI pipelines, or troubleshooting OOM errors. Covers turbo docs, git worktrees, affected builds, and concurrency tuning.
---

# Turborepo Monorepo Skill

Expert knowledge for working with Turborepo 2.8+ in the Jovie monorepo.

## Monorepo Structure

| Workspace | Package Name | Purpose |
|-----------|-------------|---------|
| `apps/web` | `@jovie/web` | Main Next.js 15 application |
| `apps/should-i-make` | `should-i-make` | Secondary app |
| `packages/ui` | `@jovie/ui` | Shared UI component library |

## Essential Commands

Always run from the repository root. Never `cd` into a workspace.

```bash
# Development
pnpm dev                          # Start all dev servers
pnpm --filter web dev             # Start only web app

# Building
pnpm build                        # Build all workspaces
pnpm turbo build --affected       # Build only changed packages (CI optimization)

# Testing
pnpm test                         # Run all tests
pnpm test:fast                    # Fast tests (no coverage)
pnpm turbo test --concurrency=1   # Memory-constrained environments (OOM fix)

# Linting & Types
pnpm lint                         # Lint all
pnpm typecheck                    # Type check all

# Cache Management
pnpm turbo clean                  # Clear local turbo cache
pnpm turbo build --dry            # Preview what would run without executing

# Documentation (Turbo 2.8+)
turbo docs "task dependencies"    # Search Turborepo docs from terminal
turbo docs "remote caching"       # Any query about Turborepo features
```

## Task Dependency Graph

All tasks in `turbo.json` have `description` fields. Run `pnpm turbo build --dry` to see them.

```
build ──► ^build (topological: upstream packages first)
lint ──► ^lint (topological)
typecheck ──► ^typecheck (topological)
test:e2e ──► build (must build first)
e2e:smoke ──► build (must build first)
build-storybook ──► ^build (topological)
dev, storybook ──► (no deps, persistent, not cached)
test, test:fast ──► (no deps, independent)
format, lint:fix ──► (not cached, modifies files)
drizzle:generate, drizzle:check ──► (schema-only inputs)
```

## Anti-Patterns to Avoid

| Wrong | Correct | Why |
|-------|---------|-----|
| `cd apps/web && pnpm dev` | `pnpm --filter web dev` | Turbo needs root context for caching |
| `npx turbo build` | `pnpm turbo build` | Must use pnpm-managed turbo |
| `npm install` / `yarn` | `pnpm install` | Only pnpm 9.15.4 is configured |
| Adding root tasks | Package-level tasks only | Root tasks break task graph |
| `turbo run test --force` always | Only `--force` when cache is corrupt | Force skips all caching |
| Running turbo from subdirectory | Always run from repo root | Ensures correct workspace resolution |
| `prebuild` scripts building deps | Use `dependsOn: ["^build"]` | Let turbo manage dependency ordering |

## Caching Best Practices

- Tasks with `"cache": false` (dev, storybook, lint:fix, format, drizzle:generate) always re-run
- Use `"inputs"` to narrow cache key: test files are excluded from build inputs
- Use `"outputs"` to specify what turbo caches and restores
- `$TURBO_DEFAULT$` includes all source-controlled files in the workspace
- Remote cache is enabled: builds cached in CI are available locally
- Turbo 2.8 automatically shares cache across Git worktrees

## OOM Mitigation (Memory Issues)

The web app uses `NODE_OPTIONS=--max-old-space-size=4096` and `--pool=forks --maxWorkers=2` for tests.

```bash
# Run tests with reduced concurrency to lower memory pressure
pnpm turbo test --concurrency=1

# Run only tests for changed packages
pnpm turbo test --affected

# Combine both for maximum memory savings
pnpm turbo test --affected --concurrency=1

# If turbo daemon causes memory issues (currently disabled in turbo.json)
# daemon is set to false due to gRPC issues
```

**Key settings that prevent OOM:**
- `turbo.json`: `"daemon": false` prevents background memory usage
- Test task has `"outputs": ["coverage/**"]` so coverage is cached, not regenerated
- `test:fast` has no outputs and no coverage, ideal for quick checks

## Git Worktrees for Parallel Agents

Turbo 2.8 automatically shares local cache across Git worktrees. No configuration needed.

```bash
# Create a worktree for parallel agent work
git worktree add ../Jovie-agent-1 -b agent/task-1

# Each worktree needs its own node_modules but shares turbo cache
cd ../Jovie-agent-1 && pnpm install && pnpm turbo build

# Clean up when done
git worktree remove ../Jovie-agent-1
```

**Why this matters:** Multiple agents can work in parallel worktrees and benefit from each other's cached builds. Agent A builds `@jovie/ui`, Agent B in a separate worktree gets an instant cache hit.

## Using --affected for Faster CI

The `--affected` flag runs tasks only for packages changed since the base branch:

```bash
# Build/test/lint only what changed
pnpm turbo build --affected
pnpm turbo test --affected
pnpm turbo lint --affected

# In CI, set explicit base/head for non-standard setups
TURBO_SCM_BASE=main TURBO_SCM_HEAD=HEAD pnpm turbo test --affected
```

## Turborepo Documentation

Search docs from the terminal (Turbo 2.8+):

```bash
turbo docs "remote caching setup"
turbo docs "task configuration"
turbo docs "environment variables"
```

Machine-readable docs: append `.md` to any URL at `turborepo.dev`:
- `https://turborepo.dev/docs/reference/configuration.md`
- Full sitemap: `https://turborepo.dev/sitemap.md`
