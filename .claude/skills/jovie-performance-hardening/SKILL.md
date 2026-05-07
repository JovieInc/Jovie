---
name: jovie-performance-hardening
description: |
  Measurement-first performance hardening for Jovie. Use when app runtime,
  database, bundle, CI, Vitest, Playwright, or route-budget performance needs
  continuous optimization with validated before/after metrics.
version: 2026-05-07
owner: ops-agent
scope: JovieInc/Jovie
purpose: Keep app performance, database performance, CI speed, and test speed continuously hardened through measurement-first optimization loops.
mode: closed-loop
---

# jovie-performance-hardening

## INDEX

[0] Mission
[1] Repo anchors
[2] Trigger routing
[3] Standing rules
[4] Measurement order
[5] Stack-specific hunt lists
[6] Iteration loop
[7] Acceptance gates
[8] Subagent roles
[9] Deliverables
[10] Stop conditions

## [0] Mission

You are Jovie's standing performance hardening operator.

Your job is to continuously:

1. detect bottlenecks,
2. measure the current state,
3. pick the smallest high-leverage fix,
4. implement one change cluster at a time,
5. re-measure,
6. keep only validated wins,
7. tighten budgets when the surface is stable,
8. repeat until budgets pass or marginal gains flatten.

You optimize:

- user-facing runtime performance,
- bundle size and request cost,
- route-level Core Web Vitals and app-shell timings,
- database query performance,
- TanStack query behavior,
- build speed,
- Vitest speed,
- Playwright throughput and flake resistance,
- CI resource efficiency.

Never guess. Measure first.

## [1] Repo anchors

Always load these files before acting:

- `apps/web/next.config.js`
- `apps/web/package.json`
- `apps/web/lib/db/client/connection.ts`
- `apps/web/lib/queries/README.md`
- `apps/web/components/providers/QueryProvider.tsx`
- `apps/web/scripts/performance-route-manifest.ts`
- `apps/web/scripts/performance-budgets-guard.ts`
- `apps/web/scripts/performance-optimizer.ts`
- `apps/web/scripts/performance-end-user-loop.ts`
- `apps/web/scripts/test-performance-profiler.ts`
- `apps/web/scripts/test-performance-guard.ts`
- `apps/web/tests/TESTING.md`
- `.github/workflows/ci.yml`
- `.claude/commands/ideate-perf.md`
- `.agents/skills/gstack/benchmark/SKILL.md`

Interpretation:

- `next.config.js` = runtime and cache truth
- `connection.ts` = DB and pooling truth
- `lib/queries/*` = client data-fetching truth
- `performance-route-manifest.ts` = route budget truth
- `ci.yml` = enforcement truth
- `TESTING.md` + test perf scripts = test-speed truth

## [2] Trigger routing

Run this skill proactively when:

- a diff touches `apps/web/app`, `apps/web/components`, `apps/web/lib`, `apps/web/hooks`, or `packages/*`
- Lighthouse budgets fail
- bundle size rises
- route timings regress
- query waterfalls appear
- DB latency rises
- tests exceed targets
- CI duration grows materially
- a PR changes cache, auth, routing, images, charts, tables, rich client UI, profile pages, dashboard shell, chat, onboarding, billing, admin, or DB code

If the platform supports macros/subagents, expose:

- `!perf-hardening`
- `!bundle-audit`
- `!query-waterfall`
- `!db-hotpath`
- `!test-speed`
- `!ci-speed`

## [3] Standing rules

1. Use Jovie's existing scripts first. Prefer package scripts when present. If absent, run the TS entrypoint directly.
2. Never introduce a perf "win" that breaks auth, freshness, correctness, SEO, or hydration stability.
3. Never accept a local micro-benchmark win without route-level remeasurement.
4. Never cargo-cult `useMemo`/`useCallback`. Trust React Compiler unless profiling proves a miss.
5. Never create new DB connection code. Use the canonical DB module.
6. Never optimize one surface by silently regressing another.
7. For experimental Next.js flags, validate in production-like build/preview before keeping the change.
8. Optimize change clusters, not random edits. One hypothesis family per iteration.
9. Keep a ledger of hypotheses, metrics, and accepted/reverted changes.
10. If no measurable gain appears after 3 serious attempts on the same bottleneck, pivot.

## [4] Measurement order

### Phase A: scope

- Read git diff.
- Map changed files to likely surfaces:
  - public/marketing/legal/profile
  - creator shell/dashboard/chat
  - billing/account
  - onboarding/auth
  - database/query layer
  - tests/CI

### Phase B: baseline

Run the smallest truthful baseline first.

Preferred order:

1. route budget guard
2. relevant Lighthouse surface
3. bundle analysis if JS/script budget is implicated
4. DB/query analysis if server timings or TTFB regress
5. test-performance profiler/guard if test or CI speed regresses

Fallback invocation style:

```bash
pnpm --filter @jovie/web run perf:budgets || pnpm --filter @jovie/web exec tsx scripts/performance-budgets-guard.ts
pnpm --filter @jovie/web run perf:optimize || pnpm --filter @jovie/web exec tsx scripts/performance-optimizer.ts
pnpm --filter @jovie/web run perf:end-user:loop || pnpm --filter @jovie/web exec tsx scripts/performance-end-user-loop.ts
pnpm --filter @jovie/web run test:perf:profile || pnpm --filter @jovie/web exec tsx scripts/test-performance-profiler.ts
pnpm --filter @jovie/web run test:perf:guard || pnpm --filter @jovie/web exec tsx scripts/test-performance-guard.ts
```

If a route requires auth, use the repo's existing auth bootstrap path and storage-state flow. Do not invent a new auth flow.

### Phase C: classify the bottleneck

Classify each issue into one primary bucket:

- cache/correctness
- bundle/client JS
- network/request waterfall
- server render/TTFB
- DB query/indexing
- image/font/asset weight
- hydration/client render churn
- test setup overhead
- E2E worker throughput
- CI pipeline overscope

## [5] Stack-specific hunt lists

### Next.js hunt list

Look for:

- uncached or wrongly cached data fetches
- stale or over-broad invalidation
- dynamic route segments doing unnecessary client work
- oversized client components that should be server-first
- avoidable `"use client"` boundaries
- needless third-party JS in initial path
- missing dynamic imports for heavy optional UI
- route segments that should prefetch earlier
- image misuse, oversized remote images, bad placeholder strategy
- font overuse
- expensive layout shifts
- duplicate data fetching between server and client
- experimental `staleTimes`/`optimizePackageImports` settings that help one surface but hurt another

Prefer:

- server-first rendering
- route-aware prefetching
- targeted dynamic import
- cache tagging/revalidation discipline
- better image and script budgets
- smaller initial JS

### TanStack Query hunt list

Look for:

- serial dependent queries
- nested parent/child waterfalls
- duplicate query keys for same data
- over-invalidating broad scopes
- `staleTime`/`gcTime` mismatches by surface
- unneeded `refetchOnMount` or focus churn
- mutation flows missing precise invalidation
- dashboard routes missing prefetch opportunities
- cache populated too late in the render tree

Prefer:

- prefetch before render or on navigation intent
- route-level/query-client priming
- precise invalidation scopes
- stable query keys
- surface-specific cache strategies
- using server hydration where data is already known

### Drizzle + DB hunt list

Look for:

- large select projections
- missing limits
- missing `orderBy` in paginated paths
- loops with `await db`
- per-item queries instead of one relational query
- hot-path queries that repeat with different params and should be prepared
- missing indexes for where/order/join predicates
- avoidable JSON overfetch
- expensive count queries in hot views
- unnecessary DB work during app shell load

Prefer:

- partial select
- prepared statements on hot repeated shapes
- relational one-query fetches where appropriate
- explicit indexes aligned to predicates
- batched lookup patterns
- push heavy work out of first render path where possible

### Lighthouse + route budgets hunt list

Look for:

- resource budget overruns
- route groups whose budgets drifted from actual UX expectations
- auth route audits that do not match real authenticated state
- public/profile/chat/onboarding surfaces missing separate budget treatment
- third-party scripts blocking initial render

Prefer:

- route-specific budgets
- separate assertion matrices for public vs app shell
- authenticated audit setup through the existing auth bootstrap
- n>=3 runs with median-based acceptance

### Vitest hunt list

Look for:

- huge global setup
- jsdom used where node is enough
- expensive top-level mocks
- repeated heavyweight imports
- isolate on suites that could safely avoid it
- forks where threads would be faster
- excess workers causing thrash
- synchronous setup repeated per file
- broad test helpers importing the world

Prefer:

- shrinking setup time first
- lighter environment selection
- threads for compatible suites
- selective no-isolate only for truly side-effect-safe suites
- worker caps that match actual machine parallelism
- splitting pure node tests from jsdom tests

### Playwright hunt list

Look for:

- serial suites that could be isolated
- shared mutable test state
- auth rework per test when storage/bootstrap can be reused
- too many browsers for the PR path
- no sharding on slow full suites
- flaky selectors tied to copy/layout
- traces/videos enabled too broadly
- overlong smoke coverage

Prefer:

- strict isolation
- worker-indexed data
- sharding on CI
- locators by role/intent
- retry-only heavy diagnostics
- smoke path discipline
- broad suite only on main or explicit label

### CI hunt list

Look for:

- path filters that miss or over-trigger work
- duplicate builds
- full-suite work on low-risk diffs
- missing artifact reuse
- wrong worker count for runner shape
- lighthouse/test jobs that should be surface-targeted
- drift between route-manifest budgets and CI jobs

Prefer:

- selective enforcement
- shared artifacts
- route/surface-aware gates
- main-vs-PR split
- stable performance baselines

## [6] Iteration loop

For each bottleneck:

1. State the bottleneck in one sentence.
2. Name the primary metric and current value.
3. Name the target budget.
4. Generate top 3 hypotheses, ranked by expected leverage.
5. Pick exactly one hypothesis family.
6. Make one coherent change cluster.
7. Rebuild only as much as needed.
8. Re-measure the same metric with the same method.
9. Record:
   - hypothesis
   - files changed
   - before
   - after
   - keep/revert
   - side effects
10. If improved and safe, keep it.
11. If flat or worse, revert or pivot.
12. Repeat until budget passes or no-progress threshold triggers.

Use median or p75 for noisy route measurements.
Use p95 for test-speed guardrails.
Do not accept single-run miracles.

## [7] Acceptance gates

A change is accepted only if all are true:

- primary target improves materially
- no secondary surface regresses materially
- correctness remains intact
- auth still works
- hydration remains clean
- CI path still makes sense
- tests still pass
- budget drift is documented if thresholds changed

Default acceptance heuristics:

- route timing win: >= 5% faster or clear budget pass
- bundle win: meaningful JS/resource reduction on affected route
- DB win: lower query count, lower bytes, lower latency, or better TTFB
- unit/integration speed win: lower setup time or lower p95 without flake increase
- E2E speed win: lower wall time without isolation loss

Reject:

- noisy wins
- synthetic-only wins
- regressions hidden behind caching bugs
- "optimizations" that only move work later in a harmful way

## [8] Subagent roles

If the platform supports specialized workers, spawn these:

### perf-router-scout

Maps diff -> affected surfaces -> route IDs -> budgets -> CI jobs.

### next-cache-auditor

Owns caching, invalidation, dynamic/static boundaries, lazy loading, image/script pressure.

### tanstack-waterfall-hunter

Owns client-data waterfalls, prefetch strategy, invalidation precision, dashboard/query churn.

### db-hotpath-surgeon

Owns query shape, index alignment, prepared statements, TTFB-linked DB issues.

### bundle-surgeon

Owns initial JS, dynamic imports, heavy dependencies, third-party pressure.

### test-speed-surgeon

Owns Vitest setup cost, pool strategy, isolation strategy, jsdom scope.

### e2e-throughput-operator

Owns Playwright workers, sharding, auth reuse, retries/trace policy, smoke/full partitioning.

### ci-budget-enforcer

Owns workflow filters, artifacts, perf gate consistency, and budget synchronization.

Each subagent returns:

- diagnosis
- evidence
- candidate fixes
- risk notes
- exact remeasurement commands

## [9] Deliverables

Every run must output:

### A. Brief verdict

- bottleneck
- root cause
- accepted fix
- measured delta
- remaining risk

### B. Change ledger

One row per iteration:

- hypothesis
- files
- before
- after
- verdict

### C. Budget status

- passed
- failed
- tightened
- deferred with reason

### D. Next move

- next highest-leverage bottleneck
- whether to continue loop or stop

### E. Artifact paths

Point to:

- perf baseline
- route measurements
- Lighthouse reports
- bundle report
- test perf baseline/report

## [10] Stop conditions

Stop when any of these are true:

- all affected budgets pass
- 3 no-progress iterations on same bottleneck
- candidate fixes now create unacceptable correctness or freshness risk
- remaining gains are marginal and lower priority than shipping
- issue is blocked by third-party dependency/runtime constraints

When stopping, state clearly:

- what improved
- what did not
- what should be watched in CI
- what future work is worth a deeper refactor
