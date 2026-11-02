# Merge queue alternatives (decision memo, 2026-10-29)

**Question (Tim, 2026-10-29):** should Jovie drop the merge queue? The target is
a fast deterministic gate before merge, heavy suites after merge with auto
bisect and revert, and signed local-preflight receipts audited by sampling.
Releases ship only certified-green SHAs. Auth, billing, migrations and security
keep full pre-merge checks.

**Recommendation:** keep the native queue for risky paths. Pilot
"fast gate, then direct merge, then post-merge verify and auto-revert" on the
marketing/copy/docs lane first, behind a path classifier, and widen only on the
kill-criteria data. The pilot spec is in
[fast-gate-pilot-spec.md](fast-gate-pilot-spec.md).

## 1. Measured baseline (24 h to 2026-10-29 17:00Z)

Sources: GitHub Actions API, and Gem `~/.local/state/jovie-lanes/`, which holds
the `throughput_sentinel.py` / doctor feeds `merge-throughput.json`,
`queue-timings.json`, `stage-timings.json` and `queue-breaker.jsonl`.

| Metric | Value | Source |
|---|---|---|
| Merged PRs | 187 / 24 h (~7.8/h); sentinel 1 h window: 7-9/h | `merge-window.json`, `merge-throughput.json` |
| PRs opened | 7-19/h | `merge-throughput.json` |
| Queue depth | 7-21 | `merge-throughput.json` |
| Enqueue to merge | p50 32.8 min first enqueue (p95 646 min); p50 12.9 min last enqueue (p95 34.2) | `queue-timings.json` |
| Merge-group CI | 200 runs for 79 PRs (2.53 runs/PR, p50 2, max 12): 71 success, 51 failure, 64 cancelled, 14 running | Actions API, `event=merge_group` |
| Group CI success duration | p50 10.6 min, p95 13.8 min | `queue-timings.json` |
| Ejection rate | 0.5 / h window | `merge-throughput.json` |
| Silent GitHub dequeues | 21 (requeue lag p50 37 min, p95 147 min) | `queue-timings.json` |
| Merge to production | p50 78 min, p95 128 min (7 d) | `stage-timings.json` `release/merge-to-production` |
| Rework rounds per merged PR | mean ≥3.7, p50 2, p95 13 (distinct Source Validation heads, n=111) | Actions API |
| First-push Source Validation pass | 41% | same |
| Fix-red lane conversion | 12.6% of 1,029 runs (7 d), 497 claim errors | `stage-timings.json` |

**Why merge groups failed** (50 failed runs, attributed to the first
non-aggregate failing job):

| Cause | Runs | Share | Would a fast pre-merge gate catch it? |
|---|---|---|---|
| Unit tests (web shards) | 23 | 46% | Partly. Affected-only unit tests in the gate catch deterministic failures; flakes do not reproduce. |
| ci-fast structural guards | 15 | 30% | Yes. These are the rules `pnpm preflight:changed` already runs. They show up in the merge group because of rework, not because of a semantic conflict. |
| Merge Group Admission (live queue membership) | 11 | 22% | Not applicable. This is queue machinery, an infra fault that exists only because the queue exists. |
| Visual snapshot | 1 | 2% | No (post-merge lane). |

**Runner-pool wait.** These waits sit on every group's critical path. In 15
merge_group CI runs (~17:40Z), measured as job `created_at` → `started_at`:

- The three gate jobs on the self-hosted `jovie-fixed` pool (Admission,
  Supersede, PR Ready) waited p50 120 s and p95 451 s (42 jobs).
- Hosted jobs in the same groups waited p50 3 s and p95 33 s (426 jobs).
- PR Ready runs for 9 s but waited p50 83 s. Admission runs for 22 s and waited
  p50 192 s.

The repo is public, so hosted minutes are free. Org concurrency is still
capped: at 05:30Z hosted waits were p50 141 s, which is why #23586 moved these
jobs to Gem. The fix is a measured, switchable pool (`MERGE_GATE_POOL`) with a
sentinel alarm on whichever pool is slower (#23671). Every queue option
below inherits this saving; it is not an argument for or against the queue.

So about half of today's merge-group failures are rules a local or fast gate
already knows about, and about a fifth are failures of the queue itself. None of
the 50 was attributed to a semantic conflict between two PRs, the one failure
class a queue uniquely prevents. That is an inference from failing-job names;
semantic conflicts can hide inside the unit-test bucket.

## 2. Options compared

Assumptions: 8 merges/h, a 30+ agent fleet, a group CI of ~10.6 min, and a
fast-gate budget of 6 min (see the pilot spec). "Red-main minutes" means minutes
`main` is broken before a revert lands. The release controller ships only
certified-green SHAs ([web release path](../release/web-release-path.md)), so a
red `main` costs promotion freshness rather than production safety.

### 2.1 HEADGREEN native queue (live since today, max 8 building)

- **Semantics.** Only the group head must pass all required checks. A failing
  earlier member can land if the combined head is green. [GitHub REST rules](https://docs.github.com/en/rest/repos/rules),
  [managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
- **Repo caveat.** `.github/MERGE_QUEUE.md` still records ALLGREEN, and calls
  HEADGREEN unsafe here because member policy validates only the newest member
  and lanes are path-selected per member. The checked-in ruleset
  (`.github/rulesets/branch-protection.yml`) says `ALLGREEN`. Source and live
  config must be reconciled; the daily `ci:merge-queue:verify` will flag the
  drift.
- **Lead time.** About the same as today: group CI p50 10.6 min plus queue wait
  (p50 13-33 min). HEADGREEN reduces ejection cascades: a mid-group flake no
  longer ejects if the head passes.
- **Red main.** ~0 by construction.
- **Revert rate.** Low. Semantic-conflict protection is strong: every landed
  tree was tested.
- **Cost.** Every rebuild re-runs ~14 unit shards, a build and the lanes. 121
  of 200 runs today were re-runs or cancellations.
- **API quota.** Rebuilds re-run PR Size Guard and admission reads, the
  documented quota storm (2026-10-13). Bounded at ≤5 REST calls per green group
  (`merge-group-token-budget.test.mjs`).
- **Release controller.** Fully compatible: `main` heads are queue-proven.

### 2.2 No queue: fast gate, direct merge, post-merge heavy suites, auto-revert

- **Lead time.** The gate (≤6 min) plus an immediate merge. Removes the 13-33
  min queue wait and all rebuilds. Expected enqueue-to-merge is about 6-8 min.
- **Red-main minutes.** Each post-merge failure keeps `main` red for the heavy
  suite time (~11 min) plus bisect plus revert (~5 min), about 15-20 min.
  - If 10% of merges break the full suite, roughly today's deterministic share,
    that is 0.8 breaks/h × ~17 min, so `main` is red ~23% of wall time.
  - Merges stacked on a red `main` cannot be certified until the culprit is
    reverted, and bisect cost grows with merges/h.
  - Mozilla autoland ran this model with 9.3% of pushes backed out (June 2017).
    [Mozilla sheriff stats](https://blog.mozilla.org/tomcat/2017/07/03/sheriff-statistics-for-june-2017/)
- **Revert rate.** Expect 5-10% of merges reverted at today's first-push quality
  (41% first-push pass).
- **Semantic-conflict risk.** High with 30+ parallel agents: two individually
  green PRs that break together land and break `main`. Uber found that with 16
  concurrent conflicting changes the chance of a problem is ~40%, and its iOS
  mainline was green only 52% of a sample week before SubmitQueue.
  [Acolyer summary of Uber's EuroSys'19 paper](https://blog.acolyer.org/2019/04/18/keeping-master-green-at-scale/)
- **Cost.** Lowest CI spend: heavy suites run once per `main` commit, or batched.
  Bisect re-runs are added on red.
- **API quota.** Best case: no queue admission, no rebuilds, no Size Guard
  rebuild calls.
- **Release controller.** Compatible only if certification moves to post-merge
  `main` SHAs and the controller already skips uncertified heads. With frequent
  red, the certified-green SHA lags and merge-to-production p50 (78 min today)
  grows.
- **Prior art.** Google TAP runs scoped presubmit, then postsubmit over all
  affected tests, plus automated culprit finding.
  [What breaks Google](https://research.google/pubs/what-breaks-google/),
  [ICST 2023 culprit finding](https://hackthology.com/pdfs/icst-2023.pdf)
  Meta's predictive test selection catches >99.9% of regressions pre-trunk while
  running ~1/3 of transitively dependent tests.
  [Meta engineering](https://engineering.fb.com/2018/11/21/developer-tools/predictive-test-selection/)
  These work because pre-merge selection is very good. Ours is not yet: first-push
  pass is 41%.

### 2.3 Risk-tiered hybrid (low-risk bypasses the queue, risky keeps it)

- **Lead time.** The low-risk tier gets option 2.2's lead time. The risky tier
  keeps the queue, but with a shorter queue, because the low-risk tier stops
  occupying build slots.
- **Red main.** Bounded by the blast radius of the low-risk tier. Docs and copy
  cannot break auth or billing. Marketing pages can break the build or visual
  lanes, and the post-merge verify catches that.
- **Semantic-conflict risk.** Low for docs and copy (no code coupling). It rises
  with each tier added, so widen only on data.
- **Cost.** Lower than today; the queue sees fewer entries. The repo already has
  the classifier (`scripts/lib/merge-queue-guard.mjs` guarded UI fast lane, risk
  classification in Path Changes).
- **API quota.** Lower. Bypassed PRs skip admission and Size Guard rebuilds.
- **Release controller.** Bypassed commits on `main` must be certified by the
  post-merge verify before the controller may promote past them. That is the
  same "certified-green SHA" rule, applied to `main` heads.
- **Mechanics.** GitHub rulesets cannot exempt paths from the merge-queue rule.
  A bypass needs a separate ruleset whose bypass actor is a dedicated app (for
  example the Jovie Bot), which merges only PRs carrying a valid fast-gate
  receipt for a low-risk-only path set. That is a reviewed ruleset cutover.

### 2.4 Vendor queues (Graphite, Mergify, Trunk, Aviator)

| Vendor | Relevant feature | Price | Notes |
|---|---|---|---|
| Graphite | Stack-aware queue; fast-forward merge of an already-validated stack | Team $40/user/mo (queue "Basic"), Enterprise for "Advanced" | [docs](https://graphite.com/docs/graphite-merge-queue), [pricing](https://graphite.com/pricing). Shopify reports hours to minutes (vendor case study). |
| Mergify | Batches with bisection on failure, up to 128 speculative checks, scopes (monorepo partitions: a batch holds only PRs with the same scope set), two-step CI | Max $21/seat/mo; free ≤5 users | [batches](https://docs.mergify.com/merge-queue/batches/), [scopes](https://docs.mergify.com/merge-queue/scopes/), [pricing](https://mergify.com/pricing) |
| Trunk | Optimistic merging, pending-failure depth, batching with recursive halving, parallel queues by impacted targets | Per committer; free ≤5 | [optimistic](https://docs.trunk.io/merge-queue/optimizations/optimistic-merging), [batching](https://docs.trunk.io/merge-queue/optimizations/batching), [parallel queues](https://docs.trunk.io/merge-queue/optimizations/parallel-queues) |
| Aviator | Parallel mode, affected targets (Scale tier) | Team $20/dev/mo, Scale $50/dev/mo | [queue modes](https://docs.aviator.co/mergequeue/concepts/queue-modes), [pricing](https://www.aviator.co/pricing) |

- **Lead time.** Parallel queues by impacted target (Trunk, Mergify scopes,
  Aviator affected targets) are the feature that matters here. A docs PR would
  not wait behind a web PR, and a web rebuild would not rebuild a Mac PR. The
  expected effect is roughly option 2.3's lead time with queue-grade
  semantic-conflict protection.
- **Red main.** ~0.
- **Revert rate.** Low.
- **Cost.**
  - Seat pricing is by human committer. With agents committing as one or a few
    bot identities the seat count is ambiguous (inferred; must be confirmed with
    each vendor), which could be cheap or could be a negotiation.
  - The vendor claims of 50-80% fewer CI runs from batching are unverified for
    our suite.
  - This is new spend and needs Tim.
- **API quota.** Vendor apps use their own GitHub App token buckets, not
  `GITHUB_TOKEN` (inferred from the App model). That is a real quota relief, but
  it adds a third-party app with write access to `main`, a security review item.
- **Release controller.** Compatible: `main` heads are queue-tested. The
  integration cost is rewriting the native-queue controllers (green enroll,
  failure hold, queue breaker, rearm) around a vendor API. That is the largest
  migration risk.

### 2.5 Bors-style batching

- **Semantics.** Batch approved PRs into a staging branch, fast-forward on
  green, bisect on red. The cost is O(E log N) vs O(N) serial.
  [bors-ng README](https://github.com/bors-ng/bors-ng) bors-ng was archived on
  2024-04-04 and recommends GitHub's queue.
- **Our equivalent.** The native queue already batches. `max_entries_to_merge`
  is 10 and each entry builds its own synthetic head. HEADGREEN plus a large
  group is the closest native form of bors batching.
- **Lead time.** Good at high throughput, poor with flaky suites: one flake
  bisects a whole batch. Shopify ran batches of 8 with a 3-failure tolerance
  under a 25% flakiness model. [Shopify merge queue](https://shopify.engineering/introducing-the-merge-queue)
- **Red main.** ~0.
- **Revert rate.** Low.
- **Semantic-conflict risk.** Protected.
- **API quota.** Same as option 2.1.
- **Release controller.** Compatible.

## 3. Scorecard

| Option | Lead time (enqueue to merge) | Red-main min/day | Reverts | Semantic-conflict risk | CI cost | `GITHUB_TOKEN` | Release controller |
|---|---|---|---|---|---|---|---|
| 1 HEADGREEN native | 13-33 min | ~0 | ~0 | Protected | High (2.5 group runs/PR) | Medium (rebuild storms) | Native fit |
| 2 No queue + auto-revert | ~6-8 min | ~200-330 (est.) | 5-10% | Exposed | Lowest | Lowest | Certified SHA lags on red |
| 3 Risk-tiered hybrid | ~6-8 min low-risk / ~15-30 min risky | Low (low-risk blast radius) | Low | Protected where it matters | Lower | Lower | Same rule on `main` heads |
| 4 Vendor parallel queues | ~8-15 min (est.) | ~0 | ~0 | Protected | Lower (batching, by target) | Own App bucket | Controller rewrite |
| 5 Bors batching | Good at volume, poor with flakes | ~0 | ~0 | Protected | Medium | Medium | Native fit |

"Est." values are modeled from the baseline above, not measured.

## 4. Recommendation

1. **Do not drop the queue for code.** At 41% first-push pass and a mean of ≥3.7
   rounds, post-merge-only testing would put `main` red for hours each day and
   stall certified-green promotion. Fix rework first: `preflight:remote`
   (#23660), the shared build cache (Turbo R2), and signed receipts.
2. **Pilot option 3 on the marketing/copy/docs lane.** Fast gate, direct merge
   by a bypass app, post-merge verify with auto-revert. Every other path keeps
   the native queue. Auth, billing, migrations, security and workflow files
   never qualify.
3. **Fix the queue's own failures** (22% of failed groups are admission and
   membership) and reconcile HEADGREEN vs the checked-in ALLGREEN plus its
   documented safety caveat.
4. **Re-evaluate vendor parallel queues (option 4)** only if the hybrid pilot
   cannot widen past docs and copy because of semantic conflicts. Seat pricing
   for bot committers must be quoted first (new spend, Tim).

**Ship now:** pilot design (spec), no ruleset change.
**Re-evaluate when:** 2 weeks of pilot data or 200 pilot merges.
**Then:** widen to the next tier (tests-only, then `scripts/`), or kill.

## 5. Pilot: marketing/copy/docs lane

Eligibility (all must hold, decided by the trusted classifier on the base branch):

- Paths only under `docs/**`, `**/*.md`, marketing content records and copy
  data, `apps/web/app/(marketing)/**` static pages, and `apps/web/content/**`.
  The exact globs are in the spec.
- No package manifests, lockfile, workflows, `scripts/**`, `canon/**`,
  migrations, auth, billing, proxy, env or generated files.
- Not stacked on an unlanded parent; no hold labels.

Flow:

1. The PR passes the fast gate (≤6 min, deterministic) and has a valid signed
   preflight receipt for its exact head.
2. The bypass app squash-merges the PR directly onto `main`. The merge must
   apply cleanly to the current `main` tip; otherwise the PR rebases and is
   re-gated.
3. A `main` push runs the post-merge verify for the touched surfaces (marketing
   build plus visual and DOM invariants, link checks).
4. On red, auto-bisect across the uncertified range, then auto-revert the
   culprit. The controller promotes only certified-green SHAs.

## 6. Kill criteria (any one, measured over a rolling 7 days)

- Pilot reverts are more than 3% of pilot merges.
- `main` red minutes attributable to pilot merges exceed 60 per day.
- One semantic conflict between a pilot PR and a queued PR reaches `main`.
- Certified-green promotion lag (merge to production p50) rises by more than
  15 min against the 78 min baseline.
- A sampled receipt audit finds a forged or non-reproducible receipt. This one
  kills receipt trust immediately and falls back to a full fast gate.
- The pilot lane's lead time is not at least 50% lower than the queue's for the
  same lane.

## Sources

- GitHub merge queue: [REST rules](https://docs.github.com/en/rest/repos/rules), [managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue), [GA changelog](https://github.blog/changelog/2023-07-12-pull-request-merge-queue-is-now-generally-available/)
- Uber SubmitQueue: [EuroSys'19 summary](https://blog.acolyer.org/2019/04/18/keeping-master-green-at-scale/), [paper PDF](https://lethain.com/static/blog/2019/eurosys19uber.pdf)
- Google TAP: [What breaks Google](https://research.google/pubs/what-breaks-google/), [Taming Google-scale continuous testing](https://research.google/pubs/taming-google-scale-continuous-testing/), [culprit finding (ICST 2023)](https://hackthology.com/pdfs/icst-2023.pdf)
- Meta: [Predictive test selection](https://engineering.fb.com/2018/11/21/developer-tools/predictive-test-selection/)
- Shopify: [Introducing the merge queue](https://shopify.engineering/introducing-the-merge-queue), [Merging work of 1000 developers](https://shopify.engineering/successfully-merging-work-1000-developers)
- Mozilla: [Sheriff statistics June 2017](https://blog.mozilla.org/tomcat/2017/07/03/sheriff-statistics-for-june-2017/)
- bors-ng: [README (archived)](https://github.com/bors-ng/bors-ng)
- Vendors: Graphite, Mergify, Trunk and Aviator links in §2.4.
