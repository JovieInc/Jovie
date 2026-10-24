# Trusted surface baselines

The [comparator](../../apps/web/scripts/performance-surface-comparator.ts)
extends the interaction report's raw sample and nearest-rank percentile contracts.
The existing report is an absolute-budget audit; its `pass` alone is not regression
qualification. The comparator scores p50/p95 feedback, p95 usable state, p95
render-to-interactive, and maximum dropped frames separately for every profile.

## Controller boundary

Run the comparator from trusted main/release tooling. The controller fetches the
authenticated `JovieInc/Jovie` remote and supplies a host-owned trust JSON file:
`repository`, `ref`, `commit`, `path`, and `digest`. `ref` must be
`refs/remotes/origin/main` or `refs/remotes/origin/release/<name>`; `commit` is its
full current SHA, `path` selects the baseline bundle in that commit, and `digest`
is the SHA-256 of the exact file bytes, including any trailing newline.

Trust inputs and the expected candidate SHA come from outside candidate artifacts
and PR configuration. The controller owns authenticated fetches and pins; remote
URLs check identity only. The offline comparator verifies identity, exact pins and
history/control ancestry. It ignores uncommitted files and rejects candidate
bootstrap, caller-created handles, and missing baselines.

From the repository root:

```sh
pnpm exec tsx apps/web/scripts/performance-surface-compare.ts \
  /host-owned/trust.json /artifacts/candidate.json "$EXACT_CANDIDATE_SHA"
```

The candidate file contains `{ "runs": [...] }`. Output is JSON with pass/fail,
reasons, diagnostic retry count, and verified provenance; exit status is nonzero
on failure. Missing or malformed files fail. This helper adds no CI gate or
scheduler and does not assert that production measurements have been collected.

## Evidence contract

`SurfaceBaselineBundle` (`jovie-surface-baseline/v1`) contains trusted `policy`,
`controls`, and append-only `history`. The exported TypeScript interfaces define
the JSON fields. Policy lists required profiles, exact sample count (at least
five), maximum evidence age, declaration time, ceilings, and noise allowances.
Every metric needs an explicit ceiling and allowance, including zero allowance.
Latency ceilings are strict; the zero-frame ceiling is inclusive. Policy can
tighten the epic ceilings but cannot increase them.

A profile includes scenario, desktop/phone/native platform, versioned browser or
native runtime, measurement and fixture versions, and the full workload: persona,
build mode, cache state, CPU profile, dataset, network, viewport, and worker count.
Use versions that bind the collector, warmup procedure, fixtures and build/load
configuration. Missing profiles or any changed dimension fail compatibility.

Each attempt supplies a unique receipt ID, exact head, profile, start/completion
timestamps, one-based attempt number, execution status, and raw report samples.
Use Playwright `retry + 1`. Preserve failed/incomplete first attempts even when no
samples were produced. Each required profile must have exactly one passing first
attempt, all required metrics, and contiguous unique sample indices. Retries
remain diagnostic and are never scored or promoted. Candidate budgets, summaries,
pass flags on reports, and proposed policy/history carry no authority.

Declare allowances before controls and candidates. At least three fresh controls
per profile must use an identical head and sample count. Their observed metric
spread must fit the declaration; effective allowance is capped at that spread.
Absolute ceilings still apply independently. Historical entries use only controls
available before those entries; later experiments cannot repair past failures.
Fresh controls can be appended without deleting older qualification evidence.
For each profile and cutoff, qualify all fresh controls from the newest head
with at least three controls (head SHA breaks completion-time ties). Incomplete
newer cohorts cannot displace a complete cohort; a complete newer cohort with
excess noise fails instead of falling back to older controls.

## Monotonic promotion

`promoteSurfaceBaseline` accepts complete validated evidence only at the pinned
main/release head and returns an append proposal. The controller persists it;
the helper never writes policy or history. Parent digests link historical entries.
Replaying history derives per-profile, per-metric minima, so accepted noise never
raises a baseline and a later regression can fail below an absolute ceiling.

Fixture/measurement changes require explicit trusted profile/policy review and
new qualification while retaining old evidence; promotion cannot reset them.
Expired baseline/control evidence fails until valid trusted evidence is supplied.
Every required profile's latest baseline must independently be fresh; a newer
measurement on one platform cannot refresh another platform's evidence.
The regression suite uses temporary Git repositories and synthetic samples; it
proves comparator behavior, not browser performance or hosted provenance custody.
