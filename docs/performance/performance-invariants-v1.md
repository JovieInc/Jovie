# Performance invariants (contract)

JOV-5888 (parent JOV-5887). The standing performance invariant pack lives in GBrain at
`jovie/coordination/performance-invariants-v1`. This file is the repo-side contract: it names
the authoritative sources, the rules that bind repo edits, and known holes. It invents no
numbers — budgets live in the sources below and in the GBrain page, not here.

## Sources of truth (ranked)

| # | File | Owns | Enforcement today |
|---|------|------|-------------------|
| 1 | `apps/web/scripts/performance-route-manifest.ts` | Route budgets (FCP/LCP/CLS/TTFB, `interactive-shell-ready`, `warm-shell-response`, `skeleton-to-content`, `usable-alias-result`) and resource budgets in transferSize KB | `performance-budgets-guard.ts` in `production-release.yml`; authenticated six-route and staged-build alias budgets block; the production alias exception is bounded below |
| 2 | `apps/web/.lighthouserc.json` | Production Lighthouse for `/` and `/tim` | production-controller / postdeploy — perf assertions warn; only accessibility ≥ 0.9 errors |
| 3 | `apps/web/.lighthouserc.{dashboard,onboarding,admin,chat,public-launch,pr}.json` | Per-surface Lighthouse thresholds (error level) | `ci.yml` `ci-lighthouse-*` jobs — `workflow_dispatch` only |
| 4 | `apps/web/scripts/performance-interaction-manifest.ts` | Interaction latency / dropped frames (jank) classes | `perf:interactions` — manual |
| 5 | `docs/performance/route-budgets.json`, `apps/web/scripts/compare-chunks.ts` | Initial-JS growth ratchet: fails closed when `bundle-baseline.json` is missing, malformed, or still the empty placeholder (JOV-8555) | Not invoked by any workflow yet (baseline capture + workflow wiring pending). Targets, never gates |

Rows 1–4 define certified surfaces; row 5 numbers are citable targets only. Where two live
sources disagree, the stricter number governs and the file is named in the audit report.
The only current row 1 advisory exceptions are bounded by the graduation policy below.

`apps/web/scripts/route-js-budget.mjs` blocks finished builds on per-route gzip
budgets. Marketing targets are tighter; unlisted routes use the default.
Targets and measured baselines shrink; raises require an unexpired registry
override for the exact key. Initial measurements (2026-10-23) allow at most 2%
headroom. Lower baselines after reductions and delete them at the target.
Profiles remain visible in server HTML before JavaScript. Row 5 stays unwired: no
workflow invokes compare-chunks, and the in-script growth ratchet now fails
closed on an unwired baseline (JOV-8555), so the first wired run fails loudly
until the baseline is captured with `pnpm --filter @jovie/web
compare-chunks:snapshot` after a clean build.

| Route | Measured KB | Baseline KB | Target KB |
| --- | ---: | ---: | ---: |
| `/demo/showcase/[surface]` | 1284 | 1309 | 800 |
| `/start` | 1223 | 1247 | 800 |
| `/demo/founder-video` | 1157 | 1180 | 800 |
| `/exp/shell-v1` | 947 | 965 | 800 |
| `/[username]` | 883 | 900 | 800 |
| `/[username]/profile-mode-render/[profileMode]/[marker]` | 883 | 900 | 800 |
| `/exp/page-builder` | 881 | 898 | 800 |
| `/demo/audience` | 847 | 863 | 800 |
| `/demo` | 815 | 831 | 800 |
| `/` | 650 | 663 | 640 |

## Authenticated six-route graduation

**Ship now (JOV-8557):** fail the existing authenticated six-route guard closed.
The independent [graduation receipt](./authenticated-performance-graduation.json),
measured at 2026-10-23T14:40:00Z, records 14 consecutive complete native PASS
results. Each execution measured three samples for each of `creator-inbox-nav`,
`creator-chat-nav`, `creator-library`, `creator-contacts`, `creator-calendar` and
`creator-tasks`; the guard's PASS covers all manifest timing/resource budgets,
including its existing same-route confirmation policy. No budget is raised.

The hashed JSONL inventory enumerates all 145 controllers in the fixed
2026-10-22T14:00:00Z–2026-10-23T14:40:00Z window. The latest 14 completed,
executed measurement steps are selected by job completion time, regardless of
controller conclusion. Skipped steps never qualify; partial or missing native
authenticated results consume a nonqualifying slot. Each measurement records
controller/attempt/job/step identities, native log SHA-256, all 18 primary samples,
the native result and the matching checkout SHA, expected SHA and immutable
deployment ID/URL. `headSha` is the controller source; `testedSha` is its checkout.

This is production-release evidence against the exact staged production build
before promotion. It is independent of `staging.jov.ie` and both public-profile
alias windows below; canonical post-promotion production measurements cannot
graduate this gate. Missing Better Auth credentials remain explicit skipped
evidence under JOV-4452, never a passing authenticated measurement.

**Re-evaluate when:** the existing guard reports a regression, or when its
manifest/probe contract changes. The receipt names 2026-10-28T14:40:00Z as the
next measurement review; that date does not expire blocking enforcement.

**Then:** repair the measured regression and retain fail-closed enforcement.
Refresh this receipt independently with the existing shared GitHub API client:

```sh
node scripts/lib/authenticated-performance-graduation.mjs \
  2026-10-22T14:00:00Z 2026-10-23T14:40:00Z 2026-10-28T14:40:00Z
```

## Public-profile alias graduation

Staging and production use separate evidence windows. Staging measures the exact immutable
protected build before promotion; only those staged-build executions can graduate that gate.
Production measures canonical `jov.ie` aliases after promotion; only completed Production
Controller executions where that job ran can enter its window. Neither surface can borrow the
other surface's streak.

**Ship now:** production remains warning-only. The dated
[`jovie-public-profile-alias-graduation/v2`](./public-profile-alias-graduation.json) receipt,
measured at 2026-10-31T06:00:00Z, records 14 qualifying production runs in the latest
14-run window and a current consecutive streak of 14/14 (worst run 1268.4 ms), so the
production canonical-alias budget now fails closed. Staging independently qualifies at
14/14 (worst run 1278.4 ms) and its exact-build alias budget keeps failing closed when
that measurement step runs. The guard takes 20 samples per alias route
(`ALIAS_TAIL_RUNS`, #22656), so a route's nearest-rank p95 is its 19th-ordered sample;
every selected route must be at or below 1500 ms for a run to qualify. The collector
reads the sample count from each log instead of assuming one: the 2026-10-21 collector
assumed five samples and marked every later measurement invalid.

**Re-evaluate when:** any selected execution misses, and no later than
2026-11-07T06:00:00Z under JOV-8737. Staging's independent graduation is recorded
under JOV-8338; production evidence never changes staging's decision.

**Then:** make the qualifying surface's budget gate blocking. If a surface still does not
qualify, refresh its dated measurement and set another bounded review date.

The receipt references generated JSONL with all 246 controller jobsets in the fixed
2026-10-27T06:00Z to 2026-10-31T06:00Z interval and 28 selected measurements (3,360 raw
samples). Each measurement
records exact controller/attempt/job/step identities, native log SHA-256, samples and
matching native maxima. `headSha` identifies the controller workflow source;
`testedSha` identifies its actual checkout. Staging also records the immutable
deployment ID/URL and matching expected SHA. Failed controllers remain eligible;
partial measurements consume a nonqualifying slot. Missing provider pages or logs
abort collection instead of silently skipping an execution.

Refresh manually with authenticated `gh`, explicit UTC boundaries, and the owning issue:

```sh
node scripts/lib/public-profile-alias-graduation.mjs \
  2026-10-27T06:00:00Z 2026-10-31T06:00:00Z 2026-11-07T06:00:00Z JOV-8737
```

This regenerates the receipt and its two evidence files; review the resulting
decisions and update the existing workflow enforcement in the same change.

## Rules binding repo edits

1. A perf gate that only warns is red on a certified surface unless a checked-in measurement
   proves its graduation threshold is unmet and names an unexpired review owner/date. The
   exception expires at that date; otherwise flip existing assertions to blocking in place.
   Never add a parallel tool.
2. Unknown is red: no measurement in 7 days on a certified surface is a FAIL.
3. Budgets move one way: raising a row 1–3 number needs founder approval and a Linear ID in
   the file's note; lowering is free.
4. Weight budgets are transfer (compressed) bytes, per `performance-budgets-guard.ts`.
5. INP is measured (`apps/web/lib/monitoring/web-vitals.ts`), not budgeted, until a repo
   file names an INP budget.

## Known holes (recorded 2026-09-03, JOV-5888 verification pass)

- `apps/web/performance-budgets.config.js` is a stale, unreferenced legacy copy of the route
  manifest (e.g. `/app/chat` LCP 2500 vs manifest 3000). Never cite it for a budget.
- Resolved (JOV-6002): the dashboard/onboarding Lighthouse jobs are now "Lighthouse
  (dashboard gate)" / "Lighthouse (onboarding gate)" — merge-group launch gates keyed on
  `run_golden_path` — and `docs/launch/LAUNCH_GATES.md` names match.
- Desktop (`apps/desktop`) has no certified responsiveness budgets. The main-process
  liveness probe (`apps/desktop/src/main-liveness.ts`, JOV-6192) uses
  `MAIN_LIVENESS_PROBE_INTERVAL_MS` / `MAIN_LIVENESS_PONG_BUDGET_MS` as proposed
  detection parameters only; input-to-paint, renderer long-task, and
  cold-launch limits are likewise unbudgeted. Recorded for proposal — do not cite
  these as approved thresholds until a named budget authority adopts them.

Fixes for these holes are separate flips, one PR per file, per the enforcement path in the
GBrain page. This contract file intentionally changes no product or CI behavior.

## Sibling check class: thread-blocking

Route-response-latency budgets in this file are **not** a substitute for keeping the request
path free of blocking I/O. The thread-blocking gate is `JOV-INV-031`
([latency-sensitive-execution-v1](./latency-sensitive-execution-v1.md)). That gate invents
no numbers here and does not claim that async metadata changes crawler/bot wait.

## Sibling check class: surface media

Canvas, WebGL, and video on marketing pages are not a second Lighthouse budget
and do not add a row here. `scripts/invariants/art-direction/surface-media.mjs`
allows them only inside a named scope that keeps a non-WebGL fallback and
`prefers-reduced-motion`. Scopes are registered in
`docs/design-system/motion-effects.json` (ASR-039), which also carries each
effect's gzip, frame-rate and offscreen-pause budget. The homepage hero
(`apps/web/components/homepage/hero-light/`) is that approved scope and ships
with no feature flag. The ambient field stays in scope because it already
keeps a CSS poster and declines WebGL under reduced motion. Every other hit
is on that check's shrink-only baseline.


## Homepage hero WebGL exception

The rules above are unchanged. This section does not add a row 1–3 budget.

`night-dj-harmony-v1` still reads: Glow and glass stay CSS tokens. No canvas, WebGL, or video on a surface.

approved by Tim, scoped to the flagged hero prototype only. Dated 2026-10-22 8:47 PM PT.

The exception applies only to the homepage hero decorative layer. It does not apply
to any other surface. The hero ships enabled. There is no feature flag. There is no
video. The canvas is `aria-hidden` and `pointer-events: none`, and it loads after
idle. No WebGL support, reduced motion, save-data, low-power, and context loss keep
the CSS poster, with no layout shift. The glass bar stays on CSS tokens
(`backdrop-filter` via `--blur-header`).

<!-- hero-light-webgl-exception/v1
{
  "schema": "hero-light-webgl-exception/v1",
  "status": "approved",
  "approval": "approved by Tim, scoped to the flagged hero prototype only",
  "approvedAt": "2026-10-22 8:47 PM PT",
  "approver": "Tim",
  "rule": "Glow and glass stay CSS tokens. No canvas, WebGL, or video on a surface.",
  "invariant": "night-dj-harmony-v1",
  "sibling": "performance-invariants-v1",
  "amendsInvariant": false,
  "surface": "homepage hero decorative layer",
  "otherSurfaces": false,
  "module": "apps/web/components/homepage/hero-light/hero-light-gl.ts"
}
-->
