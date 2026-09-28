---
id: 2026-09-26-production-freeze
status: reviewed
severity: sev1
detected: 2026-09-23T19:50Z
repaired: 2026-09-26T22:45Z
failure_classes: [silent-production-staleness, pre-merge-parity-gap, serial-layer-discovery, non-convergent-control-loop, green-by-implication, privileged-recovery-only, unowned-incident]
incident_issue: JOV-6621
actions: [JOV-6684, JOV-6685, JOV-6686, JOV-6687, JOV-6688, JOV-6689, JOV-6690, JOV-5934]
gbrain: ops/postmortems/2026-09-26-production-freeze
---

# Production freeze: jov.ie stuck on `eb15ae0` for five days

Author: Summer-builder worker session (Claude Code), 2026-09-26. Review:
Summer. Process: [README](README.md). This is the first post-mortem written
under that process.

## Summary

From 2026-09-21 ~21:00 UTC to 2026-09-26 22:45 UTC, jov.ie served commit
`eb15ae0` while `main` moved 573 commits ahead. Six stacked Vercel prebuilt
packaging defects broke the staging deploy. The first came from a Vercel CLI
bump; the others from trace includes, pnpm symlinks, and a Sentry bump. Each
defect surfaced only after merge, one per production attempt. Once packaging
was fixed, the Production Controller livelocked: every fully gated generation
yielded at promote because `main` had moved during the ~25-minute pipeline. A
human promote restored production, and #18809 made promotion forward-only.

## Impact

| Measure | Value |
| --- | --- |
| Start | 2026-09-21 20:59 UTC, first failed controller run 35654518106 (`69693aa8c7`). Last good was run 35650246125 at 20:18 UTC (`eb15ae0`). |
| Time to detect | ~47 h. The first record naming the failing prebuilt deploy is JOV-6575, 2026-09-23 19:50 UTC. No alert fired. |
| Time to own | ~4.3 days. JOV-6621 ("Production deploys failing…"), the first issue owning the freeze itself, was created 2026-09-26 04:24 UTC. |
| Time to repair | ~5 days 2 h. Manual promote of `1d3ad93` at ~22:45 UTC on 2026-09-26. Then `9e21b20`, deployed at 2026-09-27 00:16 UTC (verified via `/api/health/build-info`). |
| Controller runs in window | 210 failed, 165 "success" while nothing promoted, 4 skipped, 1 cancelled. |
| What was blocked | Every merged fix and feature (573 commits) stayed off production: the auth fixes waiting to ship, Summer's Eve bridge and Symphony `promotionAdmission` (waiting on the next READY, per JOV-6603), and exact-runtime closure receipts for Done work. |

## Timeline (UTC)

| Time | Event | Evidence |
| --- | --- | --- |
| 09-21 20:18 | Last successful staging deploy and promote of `eb15ae0` (CLI 56.3.2, 6861 files). | Run 35650246125; #18429 bisect table |
| 09-21 20:52 | Dependabot bump `vercel` 56.3.2 → 59.16.0 merges (#18080, `f6217682a9`). | PR #18080 |
| 09-21 20:59 | First red deploy-staging. CLI 59 drops `.vercelignore`-matched traced files (ENOENT). | Run 35654518106; #18429 |
| 09-24 07:15 | #18220 (JOV-6576) merges. It adds `outputFileTracingIncludes` with `../../` paths outside `apps/web` and symlinked screenshot assets. | PR #18220, `5cc7610f4c` |
| 09-24 07:31 | Error changes to "Extracting deployment files… Error: Unexpected error". | Run 35970063494 (`9c2064f6db`); #18543 bisect |
| 09-24 20:43–21:46 | Sentry 10.75.1 → 10.75.3 bumps (#18243, #18246) pull in `import-in-the-middle` through a pnpm directory link. | JOV-6621 |
| 09-25 01:57 | Vercel production build fails on pnpm engines 9.15.4 vs 9.15.9 (JOV-6603, fixed 03:00). Different path from the controller's prebuilt deploy. | JOV-6603 |
| 09-25 13:40 | #18384 hides `.vercelignore` from CLI 59. Extraction still fails. | PR #18384 |
| 09-25 21:48 | #18429 pins CLI to 56.3.2. Extraction still fails. | PR #18429; run 36194406448 |
| 09-26 04:02 | #18543 dereferences file-symlink traces. Extraction still fails. | PR #18543; #18616 table |
| 09-26 04:24 | JOV-6621 opened: the first issue owning the freeze. | Linear |
| 09-26 05:41 | #18604 declares Sentry hook packages. Did not fix extraction. | PR #18604; #18740 body |
| 09-26 17:05 | #18740 rewrites function files traced through pnpm directory links. Extraction now passes; failure moves to "Deploying outputs" (ENOENT). | PR #18740; run 36258438211 |
| 09-26 18:15 | #18749 drops function directory links whose target uploads nothing. | PR #18749 |
| 09-26 18:35 | #18616 stages the `../../` runtime files into `apps/web/runtime-data`. Controlled preview reaches READY. | PR #18616 |
| 09-26 19:34 | #18755 moves file keys out from under linked directory keys. Packaging now fully passes. | PR #18755 |
| 09-26 19:35–20:24 | Three fully gated generations (`e52a6b2e6`, `c3103f288`, `1d3ad93f8`) build, migrate, pass canary and the perf gate, then skip promote because `main` moved. The runs report **success**. | Runs 36266592608, 36268134332, 36269387836; #18809 |
| 09-26 ~22:45 | Human runs `vercel promote dpl_5bmTQ4bDLdSKD2D7R8rDgZL1D1WB` (`1d3ad93`). Production recovers. | #18809 body |
| 09-26 23:16 | #18809 makes post-authorization rechecks and the promote script forward-only (proceed if the release SHA is an ancestor of `main`). | PR #18809, `55ac196b` |
| 09-27 00:16 | Controller deploys `9e21b20` on its own. | `jov.ie/api/health/build-info` |

## Root cause

Two independent mechanisms, in sequence:

1. **Packaging.** Several merged changes produced `.vercel/output` function
   traces that Vercel's server-side extraction or output deploy rejects.
   Shapes: files outside the project root `apps/web` (#18220), symlink
   entries, map entries routed through pnpm directory links, dangling
   directory links, and file keys beneath linked directory keys. The CLI 59
   bump separately dropped traced files. None of these paths run before
   merge, so each one merged green.
2. **Livelock.** The release workflow rechecked `main HEAD == expected SHA`
   at six points after authorization. The pipeline takes ~25 minutes; during
   a drain a merge lands roughly every 5 minutes. No generation could reach
   promote while still current. Exact-SHA supersession was fail-closed by
   design (JOV-INV-029), but it had no liveness property.

## Contributing causes

- **Opaque errors.** Vercel reported "Unexpected error" and "task failed".
  Diagnosis needed downloading the failed upload and bisecting it with preview
  redeploys (#18755). Each attempt revealed only the next defect.
- **Hypothesis-driven fixes landed first.** #18384, #18429, #18543, and
  #18604 each shipped on a plausible theory and did not restore production.
  The controlled preview bisection in #18616 and #18755 is what worked.
- **Deploy-toolchain bumps auto-merged.** Dependabot bumps to `vercel` and
  `@sentry/*` passed source CI, which never builds the prebuilt artifact.
- **No incident owner.** Several agents worked separate layers in parallel.
  The first tracking issue for the freeze appeared after ~4.3 days.
- **Recovery needed a human.** Agent sessions are correctly blocked from ad
  hoc `vercel promote`, and no sanctioned agent-callable promote path existed.

## Failure classes and invariants violated

| Class | Invariant that should hold | Where else this class can occur |
| --- | --- | --- |
| `silent-production-staleness` | Production serves a commit no more than 2 h behind deploy-relevant `main`, or an incident is open. | Staging, Summer (summer-config), desktop and iOS release channels, Symphony binary pins. |
| `pre-merge-parity-gap` | A change to a deploy input (tracing, lockfile, toolchain, ignore rules) is validated against the deploy artifact before merge. | Mac/iOS packaging, Summer deploys, migrations (Migration Guard already covers these). |
| `serial-layer-discovery` | A failing packaging stage reports every violation in one pass. | Any post-merge gate with a single opaque error (Lighthouse, Sentry read gate, App Store upload). |
| `non-convergent-control-loop` | Under continuous merges, production converges within one pipeline duration of the lease holder. | Merge-queue admission, Summer routing holds, Symphony restarts, coalesce windows. |
| `green-by-implication` | A controller run that did not promote never reports success. | Every workflow that exits green on skip or supersede (lineage ledger JOV-5934). |
| `privileged-recovery-only` | Every recovery step for a known failure has a sanctioned, audited, agent-callable path. | Rollback, marker recovery, DNS/alias repair, secret rotation. |
| `unowned-incident` | A trigger event creates one `incident` record with one owner. | All triggers in the [README](README.md#when-a-post-mortem-is-required). |

## Why detection failed

- Production Continuity Guard (`production-continuity.yml`, every 5 min)
  checks availability and spend pause. It never compares the served commit
  with `main`, so a healthy stale site looked fine.
- Production Controller Health reconciles markers. It does not alert on a run
  of failed or superseded generations.
- Superseded generations concluded `success`, so the Actions UI showed green
  runs during the livelock.
- JOV-5368 defined the freshness contract (merged ≠ released ≠ running) but
  shipped no alert.

## Instance fix

- Packaging: #18616 (runtime-data staging), #18740, #18749, #18755 (function
  file map repairs), with #18429 (CLI 56.3.2 pin) kept. #18384, #18543, and
  #18604 did not restore production on their own.
- Livelock: manual promote, then #18809 (forward-only lineage after
  authorization). Coalesce and authorize stay exact.

## Systemic controls

1. **Freshness alert that opens an incident** (JOV-6684). Served commit vs
   `main` lag, plus a streak of generations without promotion. Applies to
   every production surface that exposes a build-info commit.
2. **One-pass packaging validator** (JOV-6685) that encodes all six observed
   defect shapes, **run before upload and in the merge queue** for
   deploy-toolchain and tracing changes, including Dependabot bumps
   (JOV-6686).
3. **Controller liveness invariant and simulation test** (JOV-6687), plus
   coalesce yielding only to an actually queued newer generation.
4. **No green-by-implication** in the release lineage (JOV-5934, existing,
   evidence added).
5. **Sanctioned break-glass promote** inside the production-mutation FIFO
   (JOV-6688).
6. **This post-mortem system**, enforced by CI (JOV-6689) and Summer's review
   and weekly pattern loop (JOV-6690).

## Action items

| Issue | Control | Class | State | Live verification receipt |
| --- | --- | --- | --- | --- |
| [JOV-6684](https://linear.app/jovie/issue/JOV-6684) | Production freshness alert opens `incident` | `silent-production-staleness` | Backlog | pending |
| [JOV-6685](https://linear.app/jovie/issue/JOV-6685) | `.vercel/output` extraction-invariant validator | `serial-layer-discovery` | In Review | pending |
| [JOV-6686](https://linear.app/jovie/issue/JOV-6686) | Validator before upload and in the merge queue | `pre-merge-parity-gap` | Backlog (blocked by JOV-6685) | pending |
| [JOV-6687](https://linear.app/jovie/issue/JOV-6687) | Controller convergence invariant and simulation | `non-convergent-control-loop` | Backlog | pending |
| [JOV-5934](https://linear.app/jovie/issue/JOV-5934) | Exact-SHA lineage ledger, no skipped-as-green | `green-by-implication` | In Review (existing) | pending |
| [JOV-6688](https://linear.app/jovie/issue/JOV-6688) | Sanctioned break-glass promote | `privileged-recovery-only` | Backlog | pending |
| [JOV-6689](https://linear.app/jovie/issue/JOV-6689) | CI: incident closure requires a post-mortem | `unowned-incident` | In Review | pending |
| [JOV-6690](https://linear.app/jovie/issue/JOV-6690) | Summer review, GBrain mirror, weekly class review | `unowned-incident` | Backlog | pending |

## Runbook until the controls ship

If jov.ie lags `main` by more than 2 hours: read `/api/health/build-info`,
then list the last three Production Controller runs. Failing at deploy-staging
means packaging, so bisect with controlled preview deploys as in #18616 and
#18755. Green runs that skipped promote mean supersession, so check the
forward-only rechecks from #18809. A manual `vercel promote` of a fully gated
deployment needs explicit human approval until JOV-6688 ships.

## Open questions and unverified claims

- `unverified`: whether the Vercel remote-build failure in JOV-6603 affected
  the controller's prebuilt path or only a Git-integration build.
- `unverified`: exact per-layer attribution for runs between 09-24 and 09-26.
  This record relies on the bisect tables in #18429, #18543, #18616, #18740,
  #18749, and #18755, not on a re-read of every job log.
- `unverified`: whether any alert, Sentry cron monitor, or Summer signal fired
  before JOV-6575. None was found in GitHub issues or in Linear issues
  created in the window.
- The ~22:45 UTC manual promote time comes from #18809. The Vercel deployment
  record was not re-read.
