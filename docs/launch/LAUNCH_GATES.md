# Launch Gates

## Founder lock (JOV-5085) — fail-closed on every PR

Locked path: homepage **name search** (“Search your name” → “Find me”, JOV-5864 certified homepage) → `/start` → logged-out first message sends → waitlist write only after verified auth. `Golden Path Lock` (`ci-golden-path-lock`) always runs and fans into `PR Ready`. Red cannot merge. No stub/skip for missing `E2E_PROD`. Local: `node scripts/golden-path-lock.mjs merge-gate`. Prod autofix is event-driven off Production Controller (not a cron); missing `CURSOR_API_KEY` fails closed. JOV-5084-class 401→“Too many messages” lies fail the lock. Prod-break intake dedupes by fingerprint and files P0s straight into Todo, skipping Triage (JOV-5966). This is not the manual signup→Stripe Playwright suite below.

> **Read first:** [docs/launch-readiness.md](../launch-readiness.md) is the launch-ready bar and records, per golden-path step, which checks actually block merge and release. The sections below predate it. In particular, `Golden Path (PR)` and `Golden Path (manual)` run only on manual dispatch (the nightly dispatch reports through a Linear issue); they are not part of `PR Ready`. Do not read this page as proof that a browser journey blocks merge.

## Required CI Jobs For Launch-Candidate PRs

Launch-candidate PRs are not launch-ready unless all of these jobs are green when the launch gate is triggered. The Lighthouse gates run on the merge-group combined head (`merge_group`) for launch-gate paths; the same lanes remain available via manual dispatch for deep evidence:

- `PR Ready`
- `Golden Path (PR)`
- `Lighthouse (dashboard gate)`
- `Lighthouse (onboarding gate)`

The launch gate is path-based. It turns on for changes touching:

- onboarding routes, components, or libs
- auth signup/signin entrypoints used by the golden path
- dashboard shell, shell navigation, sidebar, app-shell libs, proxy, or releases flows
- billing and checkout routes used by the golden path
- golden-path Playwright specs and helpers
- launch-gate CI, Lighthouse, or perf-budget configuration

Docs-only changes do not trigger launch-gate jobs.

## What Each Gate Means

- `Golden Path (PR)`: `tests/e2e/golden-path.spec.ts` passes in CI against an ephemeral Neon database. Manual dispatch only; it does not block merge. The blocking browser journey is `Golden Path (blocking journey)` on the merge group.
- `Lighthouse (dashboard gate)`: first `tests/e2e/dashboard-click-navigation.spec.ts` clicks the desktop sidebar as the `creator-ready` and `admin` personas, and `tests/e2e/shell-nav-click-through.spec.ts` taps the mobile tabs and the More menu; each click must change the route without a reload, and the mobile taps must also clear the pending state and render without a route error. `tests/e2e/shell-route-health.spec.ts` then opens every sidebar destination by full document load and by click, and fails on any unexpected console error, uncaught exception or route error boundary. `tests/e2e/releases-first-paint-visual.spec.ts` fails if the releases view's list moves after it first paints or any layout shift lands inside it. Then, in its own step, signed-in Lighthouse measures `/app` and the releases view (`/app/library?view=releases`) against [apps/web/.lighthouserc.dashboard.pr.json](../../apps/web/.lighthouserc.dashboard.pr.json), chat against [apps/web/.lighthouserc.chat.pr.json](../../apps/web/.lighthouserc.chat.pr.json) (its performance score only warns until chat's fix lands: it measured 0.75 against 0.85), and onboarding (as the `creator` persona, which has not finished onboarding) against [apps/web/.lighthouserc.onboarding.pr.json](../../apps/web/.lighthouserc.onboarding.pr.json). Accessibility, best practices and layout shift must meet the configured budgets. The timing audits (performance score, FCP, LCP, TBT, speed index, time to interactive) are judged against the commit the change lands on, built and measured in the same job on the same runner: a timing audit fails as a regression when the best run of the change is worse than the best run of that base by more than the audit's tolerance and every run of the change is worse than every run of the base (runs that overlap are runner noise), and it fails when the best run passes a ceiling derived from the configured budget. A failed timing verdict is measured again with three more runs on both sides before it fails the job; if those runs do not all land on both sides, the first verdict stands. When no base build exists (no base commit, changed dependency manifests, a failed base build) every configured budget applies as written. The rules and tolerances live in [apps/web/scripts/lighthouse-relative-budget.mjs](../../apps/web/scripts/lighthouse-relative-budget.mjs). Each page runs even when an earlier one misses, so one run reports every miss. It needs no external identity secret.
- `Lighthouse (onboarding gate)`: onboarding Lighthouse stays within the blocking thresholds in [apps/web/.lighthouserc.onboarding.pr.json](../../apps/web/.lighthouserc.onboarding.pr.json). It admits on `E2E_CLERK_USER_ID` and reports green without measuring when that secret is absent, so the dashboard gate's onboarding run is the one that blocks.

## Required Local Launch Perf Check

The Gmail-equivalent latency contract is enforced locally before push, not as a dedicated CI job.

Run this from the repo root with pinned Doppler scope:

```bash
doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run test:budgets:launch
```

What it does:

- builds the production app locally
- starts the standalone server on loopback
- enables the local auth bypass for authenticated measurement
- runs strict budgets for:
  - `--group onboarding`
  - `--route-id creator-releases`

This is the required 100ms perceived-latency check. Lighthouse does not measure that warm-navigation budget directly, so this must pass locally before you push.

## Local Equivalents

Run from the repo root with pinned Doppler scope.

Golden path:

```bash
doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run test:e2e:golden-path:ci
```

Authenticated dashboard Lighthouse:

```bash
doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run test:lighthouse:dashboard:pr
```

Onboarding Lighthouse:

```bash
doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run test:lighthouse:onboarding:pr
```

Standard release QA:

`/qa`

For local browse QA, start the app with:

```bash
pnpm run dev:web:browse
```

## Launch-Candidate Process

1. Confirm the local launch perf check passes.
2. Confirm the PR is green on all required launch-gate CI jobs.
3. Run standard `/qa` against preview or the local browse-compatible build.
4. Save QA artifacts under `.context/launch-readiness/<date>/`.
5. Confirm the last 3 synthetic golden-path runs are green.
6. Confirm there are no open Sev-1 or Sev-2 regressions from QA or synthetic monitoring.

## Launch-Day Manual Checklist

- Latest local launch perf check passed.
- Latest launch-candidate PR is green on all required launch-gate CI jobs.
- `/qa` report is green.
- QA evidence is stored in `.context/launch-readiness/<date>/`.
- Last 3 synthetic golden-path runs are green.
- No open Sev-1 or Sev-2 launch regressions remain.

## CI remediation log

- 2026-09-03: Merge-group run 33752429756 rejected the combined head on a Unit Tests (8/10) shard crash — exit 1 with no failing assertion and no junit report. Shard 8 does not intersect this PR's changed files or their transitive imports, and the queue-parent tree passed the identical suites minutes earlier. Head refreshed to re-queue fresh validation; no code change.
