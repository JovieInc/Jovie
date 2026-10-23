# Performance invariants (contract)

JOV-5888 (parent JOV-5887). The standing performance invariant pack lives in GBrain at
`jovie/coordination/performance-invariants-v1`. This file is the repo-side contract: it names
the authoritative sources, the rules that bind repo edits, and known holes. It invents no
numbers — budgets live in the sources below and in the GBrain page, not here.

## Sources of truth (ranked)

| # | File | Owns | Enforcement today |
|---|------|------|-------------------|
| 1 | `apps/web/scripts/performance-route-manifest.ts` | Route budgets (FCP/LCP/CLS/TTFB, `interactive-shell-ready`, `warm-shell-response`, `skeleton-to-content`, `usable-alias-result`) and resource budgets in transferSize KB | `performance-budgets-guard.ts` in `production-release.yml`; staged-build alias budgets block; the production alias exception is bounded below |
| 2 | `apps/web/.lighthouserc.json` | Production Lighthouse for `/` and `/tim` | production-controller / postdeploy — perf assertions warn; only accessibility ≥ 0.9 errors |
| 3 | `apps/web/.lighthouserc.{dashboard,onboarding,admin,chat,public-launch,pr}.json` | Per-surface Lighthouse thresholds (error level) | `ci.yml` `ci-lighthouse-*` jobs — `workflow_dispatch` only |
| 4 | `apps/web/scripts/performance-interaction-manifest.ts` | Interaction latency / dropped frames (jank) classes | `perf:interactions` — manual |
| 5 | `docs/performance/route-budgets.json`, `apps/web/scripts/compare-chunks.ts` | Aspirational initial-JS gzip targets | Unwired; `bundle-baseline.json` is empty. Targets, never gates |

Rows 1–4 define certified surfaces; row 5 numbers are citable targets only. Where two live
sources disagree, the stricter number governs and the file is named in the audit report.
The only current row 1 advisory exceptions are bounded by the graduation policy below.

Per-route first-load JS gzip is a separate blocking gate. After `next build`,
`apps/web/scripts/route-js-budget.mjs` compares the build manifests with
`apps/web/scripts/route-js-budgets.json`. `/app` keeps the client-reference
ratchet. Other app routes use first-load JS gzip. Homepage, product, and
feature pages use the tightest ceiling; unlisted routes use the default.
Numbers only shrink. A higher number fails unless that key's `raises` entry
passes the design-exception-registry gate-weakening override and is unexpired.
Row 5 targets stay unwired.

Routes measured over those ceilings on the 2026-10-23 head keep an explicit
`firstLoad.baselines` ratchet. Each value is the measured gzip KB rounded up
by at most 2% (`floor(measured * 1.02)`) and is the enforced ceiling. It can
only go down. Raising `firstLoad.baselines.<route>` fails unless
`raises["firstLoad.baselines.<route>"]` is an unexpired design-exception-registry
gate-weakening override. A route that is not listed keeps its normal ceiling.
Delete a baseline once a build is at or under its target.

These baselines are the last CI measurements, taken before the deferred chunks
below. The deferrals do not change the targets. The next measured build should
lower a baseline when the route actually shrinks.

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

`/` defers the header user menu. `/[username]` and its profile-mode-render
re-export defer `ProfileCompactTemplate`. `/start` defers `OnboardingShell`
until conversation history has loaded. Demo and exp routes stay on the ratchet
because they are intentionally heavy fixtures.

## Public-profile alias graduation

Staging and production use separate evidence windows. Staging measures the exact immutable
protected build before promotion; only those staged-build executions can graduate that gate.
Production measures canonical `jov.ie` aliases after promotion; only completed Production
Controller executions where that job ran can enter its window. Neither surface can borrow the
other surface's streak.

**Ship now:** production remains warning-only. The dated
[`jovie-public-profile-alias-graduation/v2`](./public-profile-alias-graduation.json) receipt,
measured at 2026-10-21T01:06:00Z, records 11 qualifying production runs in the latest
14-run window and a current consecutive streak of 0/14. The three maxima over budget
are 1626.2, 2083.1 and 2431.6 ms. Staging independently qualifies at 14/14, so its
exact-build alias budget now fails closed when that measurement step runs. With five
samples per route, nearest-rank p95 is the maximum sample; every selected route must
be at or below 1500 ms for a run to qualify.

**Re-evaluate when:** production reaches 14 consecutive eligible executions, and no later
than 2026-10-28T01:06:00Z under JOV-8737. Staging's independent graduation is recorded
under JOV-8338; production evidence never changes staging's decision.

**Then:** make the qualifying surface's budget gate blocking. If a surface still does not
qualify, refresh its dated measurement and set another bounded review date.

The receipt references generated JSONL with all 472 controller jobsets in the fixed
October 14–21 interval and 28 selected measurements (840 raw samples). Each measurement
records exact controller/attempt/job/step identities, native log SHA-256, samples and
matching native maxima. `headSha` identifies the controller workflow source;
`testedSha` identifies its actual checkout. Staging also records the immutable
deployment ID/URL and matching expected SHA. Failed controllers remain eligible;
partial measurements consume a nonqualifying slot. Missing provider pages or logs
abort collection instead of silently skipping an execution.

Refresh manually with authenticated `gh`, explicit UTC boundaries, and the owning issue:

```sh
node scripts/lib/public-profile-alias-graduation.mjs \
  2026-10-14T00:00:00Z 2026-10-21T01:06:00Z 2026-10-28T01:06:00Z JOV-8737
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
`prefers-reduced-motion`. The homepage hero
(`apps/web/components/homepage/hero-light/`) is that approved scope and ships
with no feature flag. The ambient field stays in scope because it already
keeps a CSS poster and declines WebGL under reduced motion. Every other hit
is on that check's shrink-only baseline.
