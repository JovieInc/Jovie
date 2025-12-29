---
description: Engineering backlog (MarcDoc-style)
---

# Engineering Backlog (Prioritized)

## How to use / agent instructions

### Updating an item

- **Do not delete items** when you complete them.
- Set **Status** to one of:
  - `P0-Doing`, `P0-Done`
  - `P1-Doing`, `P1-Done`
  - `P2-Doing`, `P2-Done`
  - `Blocked` (explain blocker)
  - `Won't do` (explain why)
- Add a **PR** link and a **Date** when status changes.
- If you discover a duplicate:
  - Keep the older item.
  - Mark the newer item `Won't do` with `Duplicate of ENG-XXX`.
- Every PR should update at least one backlog item.

### Adding new items

- Add to the bottom of the correct priority section.
- Use the next sequential ID `ENG-0XX`.
- Include:
  - **Why it matters** (user impact / cost)
  - **Where** (files/routes)
  - **Acceptance criteria** (how we know it’s done)

### Weekly hygiene

- Keep **P0** to the smallest set of truly urgent items.
- Promote/demote items based on production incidents and metrics.

---

## Priority definitions

- **P0 (Production-risk / revenue-risk / broken UX)**
  - Actively broken, or likely to break soon.
- **P1 (High ROI performance/quality)**
  - Large impact on speed, reliability, iteration.
- **P2 (Strategic cleanup)**
  - Important, but not urgent.

---

# P0 — Production-risk / broken UX

## ENG-001 — Homepage below-the-fold renders blank/black on production
- **Status**: `P0-Doing`
- **Why it matters**: Catastrophic marketing UX; kills conversion.
- **Where**: Marketing homepage sections (CSS tokens like `bg-base`, `text-primary-token`); reproduce on `meetjovie.com`.
- **Notes**: Puppeteer shows DOM contains text but user-visible area appears black after the hero.
- **Acceptance criteria**:
  - Below-the-fold sections are visible in Chrome/Safari in both light/dark.
  - Add a regression check (Playwright screenshot or a11y/contrast check) for `/`.
- **PR**: 
- **Date**: 

## ENG-002 — Dashboard → onboarding redirect loop
- **Status**: `P0-Doing`
- **Why it matters**: Blocks signed-in users from reaching dashboard.
- **Where**: `todo_list.md` (investigation item) + dashboard/onboarding routing.
- **Acceptance criteria**:
  - Repro steps documented.
  - Loop eliminated for valid accounts.
  - Add E2E smoke covering dashboard landing.
- **PR**: 
- **Date**: 

## ENG-003 — Prevent Edge/Node runtime leakage in route handlers
- **Status**: `P0-Doing`
- **Why it matters**: Production crashes when Node-only modules are imported in Edge routes.
- **Where**: `apps/web/app/api/**`, `apps/web/app/**/route.ts`.
- **Acceptance criteria**:
  - Every route declares runtime appropriately when needed.
  - Lint/test guard that Edge routes do not import Node-only libs (`stripe`, `crypto`, etc.).
- **PR**: 
- **Date**: 

## ENG-004 — Production env validation + health checks for required integrations
- **Status**: `P0-Doing`
- **Why it matters**: Misconfig silently breaks auth/billing/data.
- **Where**: `apps/web/lib/env.ts`, `apps/web/lib/env-server.ts`, `DIAGNOSIS.md`.
- **Acceptance criteria**:
  - Explicit health endpoint(s) for required keys.
  - Deploy fails fast (or shows clear operator-only banner) when keys are missing.
- **PR**: 
- **Date**: 

## ENG-005 — Standardize API error handling + logging
- **Status**: `P0-Doing`
- **Why it matters**: Debugging incidents is slow; risk of logging PII.
- **Where**: Route handlers with `console.*` usage (`apps/web/app/api/**`).
- **Acceptance criteria**:
  - Consistent error response shape.
  - Structured logging wrapper with redaction.
  - No `console.log` in production paths.
- **PR**: 
- **Date**: 

## ENG-006 — Lock down XSS surfaces (`dangerouslySetInnerHTML` audit)
- **Status**: `P0-Doing`
- **Why it matters**: Security vulnerability if any user content hits raw HTML.
- **Where**: Any `dangerouslySetInnerHTML` usage.
- **Acceptance criteria**:
  - Inventory every usage.
  - Prove input is sanitized or remove the pattern.
  - Add lint rule/exception process.
- **PR**: 
- **Date**: 

---

# P1 — High ROI performance + reliability

## ENG-007 — Eliminate O(n²) `findIndex` in `GroupedLinksManager` render
- **Status**: `P1-Doing`
- **Why it matters**: Slow UI for creators with many links.
- **Where**: `apps/web/components/dashboard/organisms/GroupedLinksManager.tsx` (see `PERFORMANCE_ISSUES_REPORT.md`).
- **Acceptance criteria**:
  - `findIndex` removed from render path.
  - Profile links UI remains correct.
  - Add unit test for index correctness.

## ENG-008 — Memoize sorting/filtering in `GroupedLinksManager`
- **Status**: `P1-Doing`
- **Why it matters**: Avoids repeated O(n log n) work per render.
- **Where**: `GroupedLinksManager.tsx` (see `PERFORMANCE_ISSUES_REPORT.md`).
- **Acceptance criteria**:
  - Sorting happens inside `useMemo` with stable deps.
  - Add perf note or microbenchmark.

## ENG-009 — Virtualize large tables/lists (dashboard + admin)
- **Status**: `P1-Doing`
- **Why it matters**: DOM bloat causes slow initial render and scroll jank.
- **Where**:
  - `components/dashboard/organisms/DashboardAudienceTable.tsx`
  - `components/admin/WaitlistTable.tsx`
  - `components/dashboard/organisms/GroupedLinksManager.tsx`
- **Acceptance criteria**:
  - Virtualized list/table for 200+ rows.
  - Keyboard navigation still works.

## ENG-010 — Pause/backoff polling; dedupe polling across components
- **Status**: `P1-Doing`
- **Why it matters**: Battery/network waste and re-render churn.
- **Where**: `components/dashboard/organisms/EnhancedDashboardLinks.tsx` (see `PERFORMANCE_ISSUES_REPORT.md`).
- **Acceptance criteria**:
  - Polling pauses when tab hidden.
  - Exponential backoff on errors.
  - Shared polling manager prevents duplicates.

## ENG-011 — Add memoization where it measurably reduces rerenders
- **Status**: `P1-Doing`
- **Why it matters**: Cuts CPU use, improves responsiveness.
- **Where** (see `PERFORMANCE_ISSUES_REPORT.md`):
  - `components/home/HomeHero.tsx`
  - `components/organisms/HeroSection.tsx`
  - `components/organisms/FeaturedArtistsSection.tsx`
  - `components/organisms/BillingDashboard.tsx`
- **Acceptance criteria**:
  - Verified via React Profiler: fewer renders for stable props.

## ENG-012 — Memoize expensive headline processing in `HeroSection`
- **Status**: `P1-Doing`
- **Why it matters**: Avoids string/array churn.
- **Where**: `components/organisms/HeroSection.tsx` (see `PERFORMANCE_ISSUES_REPORT.md`).
- **Acceptance criteria**:
  - Derived headline computed in `useMemo`.

## ENG-013 — Fix unstable `useEffect` dependencies that cause refetch loops
- **Status**: `P1-Doing`
- **Why it matters**: Prevents accidental infinite loops + redundant fetch.
- **Where**: `components/organisms/BillingDashboard.tsx` and other high-traffic components.
- **Acceptance criteria**:
  - Effects only re-run on real dependency changes.
  - Add unit tests where possible.

## ENG-014 — Rationalize `OptimizedImage` memoization
- **Status**: `P1-Doing`
- **Why it matters**: Reduce complexity and avoid recomputation.
- **Where**: `components/atoms/OptimizedImage.tsx` (see `PERFORMANCE_ISSUES_REPORT.md`).
- **Acceptance criteria**:
  - Memoized blocks have stable deps.
  - No regression in image loading.

## ENG-015 — Marketing: preload critical fonts and eliminate first paint flashes
- **Status**: `P1-Doing`
- **Why it matters**: Improves FCP/LCP and perceived quality.
- **Where**: `HOMEPAGE_PERFORMANCE_TASKS.md`, layout/font configuration.
- **Acceptance criteria**:
  - No font flash on cold load.
  - Verified via Lighthouse + WebPageTest.

## ENG-016 — Marketing: defer offscreen sections
- **Status**: `P1-Doing`
- **Why it matters**: Reduces initial bundle/render work.
- **Where**: `HOMEPAGE_PERFORMANCE_TASKS.md`.
- **Acceptance criteria**:
  - Below-the-fold sections render on intersection.
  - No CLS regressions.

## ENG-017 — Audit images: enforce `next/image` + correct `priority`/`sizes`
- **Status**: `P1-Doing`
- **Why it matters**: LCP and bandwidth.
- **Where**: marketing + profile pages.
- **Acceptance criteria**:
  - No `<img>` for app-controlled images.
  - Hero media uses `priority` and correct `sizes`.

## ENG-018 — Create a bundle budget and enforce in CI for key routes
- **Status**: `P1-Doing`
- **Why it matters**: Prevents slow creep.
- **Where**: CI + Next build outputs.
- **Acceptance criteria**:
  - Budget thresholds per route (at least `/` and `/app/dashboard/*`).
  - Failing CI on regression.

## ENG-019 — Adopt a unified request deduping strategy
- **Status**: `P1-Doing`
- **Why it matters**: Cuts duplicate network and reduces server load.
- **Where**: dashboard data fetchers.
- **Acceptance criteria**:
  - Concurrent requests for same resource deduped.
  - Remove redundant fetches across sibling components.

## ENG-020 — Reduce third-party script impact on marketing routes
- **Status**: `P1-Doing`
- **Why it matters**: TTI + FCP.
- **Where**: `app/layout.tsx`, `components/providers/ClientProviders.tsx` (see `PERFORMANCE_ISSUES_REPORT.md`).
- **Acceptance criteria**:
  - Non-critical scripts deferred.
  - Marketing routes don’t boot heavy client providers unnecessarily.

## ENG-021 — Expand DB index program beyond featured creators
- **Status**: `P1-Doing`
- **Why it matters**: Prevents slow queries as data grows.
- **Where**: dashboard queries (audience, activity, clicks), admin overview.
- **Acceptance criteria**:
  - Identify top 10 queries by latency.
  - Add/verify indexes with EXPLAIN plans.

## ENG-022 — Add query performance visibility (slow query report)
- **Status**: `P1-Doing`
- **Why it matters**: Without visibility, regressions ship.
- **Where**: DB + monitoring endpoint.
- **Acceptance criteria**:
  - A documented way to list slow queries in prod.
  - Regular review cadence.

## ENG-023 — Improve ingestion reliability (idempotency + retries)
- **Status**: `P1-Doing`
- **Why it matters**: Admin workflows fail, causes operational drag.
- **Where**: ingestion routes and strategies.
- **Acceptance criteria**:
  - Idempotency keys for risky operations.
  - Clear error surfacing for admins.

## ENG-024 — Remove generated artifacts from tooling scans
- **Status**: `P1-Doing`
- **Why it matters**: Grep/lint/typecheck noise and time.
- **Where**: repo tooling and scripts.
- **Acceptance criteria**:
  - Exclude `.next/`, `.turbo/` from search/lint where appropriate.

---

# P2 — Strategic cleanup / maintainability

## ENG-025 — Reduce `process.env` usage outside env modules
- **Status**: `P2-Doing`
- **Why it matters**: Config sprawl, inconsistent validation.
- **Where**: occurrences of `process.env.*`.
- **Acceptance criteria**:
  - Env access centralized in `env.ts` / `env-server.ts`.

## ENG-026 — Eliminate `ts-ignore` / `ts-expect-error` except documented cases
- **Status**: `P2-Doing`
- **Why it matters**: Hides real bugs.
- **Where**: all uses.
- **Acceptance criteria**:
  - Every remaining usage has a justification + tracking issue.

## ENG-027 — Reduce `any` usage and add an exception process
- **Status**: `P2-Doing`
- **Why it matters**: Type safety erosion.
- **Where**: any occurrences outside generated code.
- **Acceptance criteria**:
  - New `any` disallowed by lint.
  - Backlog to remove existing instances.

## ENG-028 — Normalize API schemas: all routes validate via shared schemas
- **Status**: `P2-Doing`
- **Why it matters**: Prevents drift and security holes.
- **Where**: `apps/web/lib/validation/schemas` and API routes.
- **Acceptance criteria**:
  - Every route request/response shape has shared schemas.

## ENG-029 — Reduce test suite setup overhead further
- **Status**: `P2-Doing`
- **Why it matters**: Faster CI and dev iteration.
- **Where**: `TEST_PERFORMANCE_OPTIMIZATION.md`-referenced setup/mocks.
- **Acceptance criteria**:
  - Setup stays under target threshold.
  - No CSS imports in global setup.

## ENG-030 — Add golden-path E2E smoke coverage for marketing + auth + dashboard
- **Status**: `P2-Doing`
- **Why it matters**: Prevents catastrophic regressions.
- **Where**: `apps/web/tests/e2e/**`.
- **Acceptance criteria**:
  - / loads and is visible below fold
  - sign in works
  - dashboard loads

## ENG-031 — Standardize admin table architecture
- **Status**: `P2-Doing`
- **Why it matters**: Duplicate patterns and inconsistent behavior.
- **Where**: `apps/web/components/admin/table/**` plus other admin table components.
- **Acceptance criteria**:
  - Single table primitive set.
  - Consistent selection + bulk actions.

## ENG-032 — Improve observability hygiene (Sentry breadcrumbs + request IDs)
- **Status**: `P2-Doing`
- **Why it matters**: Faster incident triage.
- **Where**: middleware + API error wrapper.
- **Acceptance criteria**:
  - Request ID propagated.
  - Errors include key context without PII.
