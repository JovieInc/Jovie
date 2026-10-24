# Ovie cinematic Home overhaul

2026-10-23 · Tim White’s 6:34 PM PT brief · no Linear issue — ad-hoc implementation.

Reading this as: an operations workspace for Tim, with a restrained cinematic language, leaning toward Noir Ion and Linear’s compact type and controls.

Dials: low design variance, functional motion, high information density. The bottleneck is scan hierarchy on ultrawide Home. The metric readout should establish one focal point while decisions and work remain easy to operate.

## Audit

Source baseline: `8795a323c4f`. Sixteen PNGs cover eight real Storybook stories at **3440×1440** and **1440×900**, with zero page errors and no viewport overflow. Files and viewport receipts: `/tmp/ovie-audit/` and `baseline.json`.

| Concrete finding | Evidence / implication |
| --- | --- |
| Home says “Nothing is blocking shipping” beside failed shipping reads. | `home-unavailable-{viewport}.png`: unavailable data must not claim a healthy clear state. |
| Metrics have equal 80px card emphasis. | `home-populated-3440x1440.png`: no dominant operational readout. |
| Actual Home hides two of eleven metrics at 1440px. | `home-unavailable-1440x900.png` shows nine; the ultrawide capture shows eleven. Preserve the ordered set in a responsive grid. |
| Warning orange persists in timings and CEO/HUD status text. | Populated Home, `ceo-overview-*` and `hud-cash-*` captures. New hero status is neutral text; remaining HUD/palette convergence is tracked on [JOV-7710](https://linear.app/jovie/issue/JOV-7710). |
| CEO overview remains a centered vertical panel on ultrawide. | `ceo-overview-3440x1440.png`: retain source/freshness evidence while adopting the shared metric densities under JOV-7710. |
| Default Mac HUD lacks launcher/inbox sources. | `mac-hud-*` captures prove unavailable/retry presentation, not populated authenticated Mac acceptance. |

The shared busy Home story has seven fixture metrics; actual Ovie Home projects eleven. Separate fixture companies/snapshots are not one live dataset. No fixture is presented as current telemetry.

Local preview retained the canonical Storybook framework, providers, theme and Vite configuration, scoped to the audited stories. Moving the temporary config required restoring the real web root for dependency resolution. Initial cold-start/timeouts are failed attempts; the final capture succeeded. No repository gate or preview source setting was disabled.

## Proposal

**Layout:** one full-width operational focal band above a quiet content zone. Use the first source-ranked metric as the glance anchor and summary density for supporting signals. Replace the existing pulse presentation; do not append another dashboard. Preserve asks, stage board, completed work, generated answers, retry, undo, destinations and query ownership. Retain the existing ultrawide twelve-column workspace. No new route, product action or feature flag.

**Metric system:** `packages/ui/atoms/cinematic-metric.tsx` owns one `CinematicMetric` family and its skeleton. Compose the existing Skeleton, tooltip and utility owners; add no dependency or token family. `glance` / `summary` / `dense` reserve 112 / 96 / 80px frames, each with fixed label/value/context slots. Labels/context are 12px; changing numbers are tabular. Null is “Not measured”; zero remains 0. Loading hides stale content, absent detail retains its slot, and keyboard focus reveals full truncated text through the canonical tooltip. Escape dismisses it without moving geometry.

**Background:** compose one clean, full-bleed editorial layer within the focal band over the shell-owned canvas. Use existing dark/glass surface roles, rounded corners and restrained contrast. No grain, gritty texture, decorative shapes, fabricated artwork, autoplay or moving hover geometry. One accent per section; the content remains the focal point.

EVENT: the brief specifies Ion `#3FAFF3`, Ultra `#A789F0`, Pulse `#EB6AC6`, no orange. Current shared Ion source is `#11AFFF`. Consume semantic roles; do not silently recolor Jovie’s shared foundation or create local palette aliases. Scoped anchor reconciliation and remaining CEO/HUD consumers are recorded on JOV-7710. The two-PR slice changes no locked palette source.

**Real time:** Home already shares React Query state: shipping polls every 6 seconds, inbox every 30 seconds, with existing cache/cancellation/focus-refresh and stale/unknown handling. No SSE endpoint exists for those feeds in the inspected source. Preserve these intervals and reconcile push into the same cache if an endpoint supplies it. Add no endpoint, second poller, event bus or page reload.

## Delivery and verification

1. PR 1: proposal, design-system metric, stories, meaningful unit coverage and browser geometry test. Its test enters the existing Storybook CI job; a contract assertion fails before the selector addition and passes after it.
2. PR 2: separate worktree from PR 1; Home adoption after rebasing onto background PR [#22898](https://github.com/JovieInc/Jovie/pull/22898), recorded head `a306b27c8561b513b10080128d6e2b75a38e9d9e`. Keep its shell paint ownership. Do not edit parallel sidebar/right-rail/library or shell-background files; #22806 and #22829 ownership is preserved.

Metric state matrix: three densities; loading; nonzero; zero; missing value/context; long content; inherited themes; hover/focus/Escape; reduced motion. Home must retain independent loading/error/empty/partial/stale/unauthorized, decision pending/undo/failure and generated-answer/history states. Reserve timing and metric geometry; never convert missing source data into success.

PR 1 receipts: **7 metric tests, 100% statements/branches/functions/lines (22 branches)**; final full UI CI selector **1,232 passed, four existing skips**; Playwright geometry/focus **3/3** at 3440×1440, 1440×900 and 390×844; workflow contracts **89/89**; `pnpm turbo typecheck` **20/20 tasks**. UI lint/typecheck, arbitrary-value guard, copy-leak and repository-doc parity pass. Workflow syntax passes; full native actionlint reports the same ShellCheck findings as the source baseline, with zero additions. Its pinned Linux CI gate remains required. Browser captures are component evidence, not deployment or installed-Mac certification. No process remains paused.

Ship now: the two presentation slices after their normal checks. Re-evaluate when exact-head CI or rendered state/viewport evidence finds a regression; then repair the owning layer and rerun affected checks. Roll back by reverting the relevant presentation PR. GBrain retrieval query and code-callers timed out (`gbrain-unavailable`); source/caller evidence was refreshed locally.

### Home adoption evidence

The replacement hero keeps all eleven canonical metric slots, including before first data, with one glance anchor and summary support. The full-bleed glass layer stays inside the hero; shell background ownership remains with #22898. Loading, unmeasured, measured zero, long values and failure preserve the same hero, metric and following-content rectangles at both requested desktop widths. A failed shipping read now names the failure instead of displaying the healthy constraint message; the regression test failed against the prior source before passing with the replacement.

PR 2 receipts: 69 focused tests; 100% coverage of the hero, constraint and timing presentation (79 branches); 5/5 Storybook browser tests including the three primitive widths and both Home widths; four-state hero Axe scan with zero violations; ten after-capture PNGs with no page errors or viewport overflow. Repository typecheck passes 20/20 tasks, package lint passes with unchanged warnings, and independent source review reports no findings. Evidence lives beside the baseline in `/tmp/ovie-audit/`; installed-native and deployed acceptance remain separate.

Dependency refresh: the final incorporated #22898 source is `3e3c7468fd31b9c6c02d392dd27ce462f99f8753`. Its redundant global `ImportMeta.glob` declaration conflicted with the test graph's existing overloads. Removing only that declaration/import in the Home branch restores the real test typecheck with all 661 existing baseline errors unchanged; all 154 background assertions remain green. The combined focused run is 223/223. No paint-owner source, test assertion, selector or baseline is changed by this typing repair.
