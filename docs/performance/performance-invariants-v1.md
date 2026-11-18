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
| 5 | `docs/performance/route-budgets.json`, `apps/web/scripts/route-js-budgets.json`, `apps/web/scripts/route-js-budget.mjs` | Initial JS (gzip) per route and per route group. Every route has its own baseline in `route-js-budgets.json`, recorded at measured size plus 2%; each group's `initialJS_gzip_kb` in `route-budgets.json` is the target and `groups.<group>.baselineKb` its ceiling (JOV-8561). This is the growth ratchet (JOV-8555) | `route-js-budget.mjs` in `ci.yml` Build + Layout and `source-validation.yml` Exact-head Coverage. A route over its baseline, a route with no baseline, or a group over its ceiling fails the job |
| 6 | `apps/web/scripts/route-render-modes.json`, `apps/web/scripts/route-render-modes.mjs` | Render mode per route (`static`, `isr:<seconds>`, `param-prerender`, `dynamic`) and prerendered HTML bytes per static or ISR page, read from the build's `prerender-manifest.json` | `route-render-modes.mjs` in the same two jobs, after the same build. A route that loses cacheability, HTML past its allowance, or a route with no entry fails the job |

Rows 1–4 define certified surfaces. Rows 5 and 6 are build-output ratchets: they
need no deployment and no secrets, so they block on the PR and again on the
combined head. Row 5's remaining `route-budgets.json` numbers (lcp/fcp/cls/tti)
are citable targets only. Where two live sources disagree, the stricter number
governs and the file is named in the audit report.
The only current row 1 advisory exceptions are bounded by the graduation policy below.

## Initial JS ratchet (row 5)

`apps/web/scripts/route-js-budget.mjs` measures every route of a finished build
(root files plus the route's client-reference chunks, gzip -9) and holds each
route to its own baseline: `routes` for `/app` routes, `firstLoad.baselines` for
every other route.

- **A baseline is measured size plus 2%** (`BASELINE_HEADROOM_RATIO`), rounded
  down. `/` measured 567 KB, so its baseline is 578.
- **A route with no baseline fails closed.** There is no default to fall back
  to. The error prints the line to add. `defaultMaxGzipKb` (900 for `/app`,
  800 public, 640 marketing) is only the most a new route's first baseline
  may be without an override.
- **Baselines only move down by themselves.**
  `node apps/web/scripts/route-js-budget.mjs --next-dir apps/web/.next --write`
  records new routes, lowers every baseline that has more than 2% slack, drops
  routes that left the build, and lowers each group baseline to its worst
  route. It never raises a number. A route that got lighter passes without a
  budget edit (the job prints a notice), so two green PRs cannot conflict on
  this file; run `--write` on main after a reduction lands to lock it in.
- **A raise is a hand edit plus an override.** Raising any number against
  `origin/main` fails unless `raises["<key>"]` (for example
  `raises["routes./app/chat"]`) is a complete, unexpired
  design-exception-registry entry: owner, reason, Linear issue, removal
  condition, evidence, expiry.
- **Intercepting routes are not initial JS.** `@auth/(.)signin` and
  `@auth/(.)signup` render only on a client-side navigation. They used to be
  unioned into `/`, which overstated the homepage by about 90 KB; they are
  now excluded from every route's measurement and still scanned for forbidden
  client code.
- **Groups.** Every route is also attributed to a `route-budgets.json` group
  (admin: `/app/admin*`, dashboard: other `/app` routes, marketing: the
  firstLoad `marketingRoutes` patterns, public: every other route) and checked
  against that group's own `groups.<group>.baselineKb`, never the max across
  groups. Raising a group baseline or a group target needs the same override.

Generate baselines only from the build CI measures: `pnpm turbo build
--filter=@jovie/web` with the mock environment of `source-validation.yml`'s
"Build exact PR head" step (`CI=true`, `NEXT_PUBLIC_APP_URL` and
`NEXT_PUBLIC_BETTER_AUTH_URL` `http://localhost:3230`, `NEXT_PUBLIC_AUTH_MOCK=1`,
`NEXT_PUBLIC_AUTH_PROXY_DISABLED=1`, `NEXT_PUBLIC_E2E_MODE=1`,
`NEXT_IGNORE_ESLINT=1`, `NEXT_IGNORE_TYPECHECK=1`,
`NEXT_PRIVATE_SKIP_SIZE_CHECK=true`). A production build with real auth
measures different bundles.

JOV-8555 is closed by this ratchet. `compare-chunks.ts` no longer carries a
growth ratchet: it keyed a snapshot by chunk filename, and Turbopack's hashed
filenames change with any content change, so it could never be wired. Its
placeholder `docs/performance/bundle-baseline.json` and the
`compare-chunks:snapshot` script are removed.

Measured on main `0b82835e` (2026-11-12), before and after the ratchet:

| Route | Measured KB | Ceiling before | Baseline now | Slack before | Slack now |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/` | 567 (657 with the modals) | 663 | 578 | 6 | 11 |
| `/[username]` | 846 | 900 | 862 | 54 | 16 |
| `/start` | 789 | 1247 | 804 | 458 | 15 |
| `/app` | 748 | 935 | 762 | 187 | 14 |
| `/app/chat` | 806 | 1385 | 822 | 579 | 16 |
| `/pricing` | 537 | 800 | 547 | 263 | 10 |

Across all 259 routes the median slack under the old ceilings was 187 KB. Group
baselines dropped to their worst route: public 1309 to 1207, marketing 663 to
578, dashboard 1385 to 1199, admin 1345 to 1124.

## Render-mode and HTML-weight ratchet (row 6)

`apps/web/scripts/route-render-modes.mjs` classifies every page, and every
prerendered route handler, from `.next/prerender-manifest.json` and
`.next/app-path-routes-manifest.json`, and compares the result with
`apps/web/scripts/route-render-modes.json`. It reads build output only, so it
sees a dynamic API reached through an imported component, which the
source-level `static-revalidate-policy` test cannot.

| Mode | Meaning |
| --- | --- |
| `static` | Prerendered at build, never revalidated |
| `isr:<seconds>` | Prerendered, revalidated on that window |
| `param-prerender` | Parameterised route prerendered or cached on demand; `:<seconds>` when the build prerendered a path with a window |
| `dynamic` | Rendered on every request |

It fails when:

- a route moves to a less cacheable mode (`static` to `isr` to `dynamic`, or
  `param-prerender` to `dynamic`), or its revalidate window gets shorter;
- a prerendered handler (`/robots.txt`, feeds, `/llms.txt`) starts running per
  request;
- a static or ISR page's HTML grows past its recorded bytes plus the larger of
  5% and 4096 bytes, or its entry has lost its `html=` size;
- a route has no entry (new routes fail closed), or an entry has no route;
- a new page is `dynamic` outside `/app`, `/api`, `/billing`, `/auth`, `/hud`.

The content indexes `/blog`, `/changelog` and `/engineering` gain an entry per
post or release, so their mode is ratcheted but their bytes are not
(`HTML_GROWS_BY_DESIGN` in `route-render-modes-policy.mjs`).

A route that got cheaper passes and the job prints a notice.
`node apps/web/scripts/route-render-modes.mjs --next-dir apps/web/.next --write`
records new routes, cheaper modes, longer windows and smaller HTML, and drops
routes that left the build. It never records a loss: a route that regressed
keeps its entry and the run still fails. An intended loss is a hand edit of
the entry plus a complete, unexpired `overrides["<route>"]` entry (same fields
as `raises` above), judged against `origin/main`. Use the same mock-env build
as row 5. Build with `CI=true`, as the workflows do: the `/renders` fixture routes
are admitted only then (they 404 as small static pages otherwise), so a
snapshot written from a `CI=1` build records them wrong.

The first snapshot (main `0b82835e`) records 94 static, 2 ISR, 19 parameterised-prerender and 168 dynamic routes (113 of the dynamic ones under `/app`). The dynamic public
pages in it (`/start`, `/signin`, `/claim`, `/r/[slug]`, seven `/[username]/*`
subpages and others) are recorded as they are; each is a candidate to make
static later, and doing so tightens the snapshot.

Limits: the build states no revalidate window for a parameterised route with
no prerendered path, so a shorter window on `/[username]` (ISR 3600, no path
prerendered in the mock-env build) is not seen here; the
`static-revalidate-policy` test still covers its source. The proxy matcher is
not snapshotted.

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
   the file's note; lowering is free. The route-group initialJS ratchet (JOV-8561) follows the
   same one-way rule: `route-js-budgets.json` group baselines and `route-budgets.json` group
   `initialJS_gzip_kb` targets raise only with a founder-approved unexpired `raises` override
   carrying the Linear ID. The per-route baselines (row 5) and the render-mode snapshot (row 6)
   follow it too: `--write` only tightens, and a loss needs an unexpired `raises` or
   `overrides` entry carrying the Linear ID.
4. Weight budgets are transfer (compressed) bytes, per `performance-budgets-guard.ts`.
5. INP is measured (`apps/web/lib/monitoring/web-vitals.ts`), not budgeted, until a repo
   file names an INP budget.

## Known holes (recorded 2026-09-03, JOV-5888 verification pass)

- The telemetry-contribution budget (`docs/performance/telemetry-budgets.json`, JOV-6585) is
  enforced by nothing. `compare-chunks.ts` classifies telemetry chunks by filename, and
  Turbopack's hashed chunk names match none of its markers, so it reads 0 bytes. It is not
  wired into CI for that reason: a gate that cannot fail is not a gate. Recorded 2026-11-12.
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
