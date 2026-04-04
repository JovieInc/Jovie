# /perf-loop

Run the resumable performance loop against Jovie's canonical end-user routes.

## Core Commands

```bash
# All canonical end-user routes
pnpm --filter web perf:loop:end-user

# Equivalent explicit form
pnpm --filter web perf:loop --scope end-user

# Narrow to one route group
pnpm --filter web perf:loop --scope end-user --group creator-shell

# Narrow to one manifest route
pnpm --filter web perf:loop --scope end-user --route-id creator-earnings
```

## Behavior

- The route set comes from `apps/web/scripts/performance-route-manifest.ts`
- State persists under `.context/perf/end-user-*/`
- Resume is the default, `--fresh` starts a new run
- Passing routes are skipped by default
- Use `--optimize-passing` to include already-passing routes in the queue

## Route-Level Loop

The end-user loop is built on the existing single-route optimizer:

- `home` uses homepage Lighthouse measurement
- all other routes use route-mode budget-guard measurement
- route identity is manifest-id based via `--route-id`
- legacy `--mode dashboard --route <path>` still works for single-route runs
