# PR Flow — How Agents Ship (Canonical)

<!-- JOV-INV-029: this document projects the executable PR lifecycle contract. -->

The single source of truth for how code reaches `main`. The goal is **lights-out
shipping: 100s of PRs/day, fully autonomous, zero human-in-the-loop except a
genuine taste call.** Every rule here exists because the alternative was tried and
it collapsed — see [What broke on 2026-06-22](#what-broke-on-2026-06-22) for the
forensics that justify each one.

If you are an agent about to open a PR, read [Agent checklist](#agent-checklist).

## Executable lifecycle contract (JOV-INV-029)

The checked-in invariant registry is the authority for the delivery phases below;
the existing owners remain responsible for their mutations. A handoff releases
the implementation slot only after its exact-head receipt is acknowledged.

| Phase | Owner | Completion proof |
| --- | --- | --- |
| Draft | Symphony | Evidence-complete draft and writer-owned handoff receipt |
| Review | Writer | Exact-head review, CI, and ticket evidence |
| Promotion | Writer | Native merge-queue admission at the same head |
| Merge | GitHub native queue | Merge event; this is not activation |
| Activation | Production controller | Exact deployed runtime proof |
| Closure | Summer | Closure receipt referencing activation proof |

Missing ownership, stale/changed heads, failed checks, lost or duplicate events,
and expired holds remain bounded repair/evidence outcomes. The policy digest is
included in delivery receipts so a runtime can reject a mismatched contract.

## North star

- **CI-green → auto-merge.** No human. Correctness is a machine job.
- **Taste → LLM review + ship.** Taste-touching PRs get strong LLM review and
  ship autonomously; the taste classifier comment is a signal for post-ship
  walkthroughs. Nothing needs a human pre-merge.
- **Throughput ceiling is CI cost and queue reliability, not merge wiring.** Keep
  the source-PR gate cheap; put deterministic integration on the exact combined
  queue head and network/deploy/exhaustive depth after merge or on schedules.

## 1. Unit of work: one small PR → `main`

- **Default: a small, focused PR targeting `main`.** ≤ 1500 lines / 75 files
  (`pr-size-guard`, repo vars `PR_MAX_LINES`/`PR_MAX_FILES`, verified live
  2026-09-20 — the workflow's built-in defaults are 800/40 when the vars are
  unset; mechanical codemods use `big-pr`). Independent changes are
  **sibling PRs off `main`** — parallel,
  never based on each other.
- **Dependent work → a native GitHub stacked-PR sequence.** Push each layer
  normally and open it against its immediate parent. After the parent lands,
  retarget the child to `main`, rebase onto the new `origin/main`, push with
  `--force-with-lease`, and wait for fresh checks before queue enrollment.
  Record the branch, PR, base, and head SHA for every layer. Do not create an
  uncontrolled base-on-base pile; one mechanical sweep = **one `big-pr` PR**
  ([`pr-stacking.md`](../.claude/rules/pr-stacking.md)).
- **Root PRs target `main`** (or a live integration branch). A dependent child
  may temporarily target its immediate parent while that parent is open; once
  the parent lands, retarget the child to `main` and rebase before enrollment.
  Never leave a child targeting a deleted or unrelated ephemeral branch; if its
  base is gone, retarget to `main` and prove the semantic tree.
- **Integration branches are an option, not the default** — use only for a
  coordinated multi-agent wave on one domain, then one train PR
  ([`ci-branching.md`](../.claude/rules/ci-branching.md)).

## 2. CI is risk-tiered (the performance core)

A 1-line source PR must not pay for a full build + CodeQL + Lighthouse + E2E.
Source checks stay fast and deterministic; exact combined-head integration runs
in the merge queue, while network/deploy/exhaustive depth runs later.

| Tier | Jobs | Trigger |
|---|---|---|
| **PR gate** (must stay fast) | typecheck, lint, exact-source-head web coverage (changed-line 60% ratchet), portable iOS contract, structural contract, diff secret scan, Golden Path Lock, size/fork/migration policy | every PR — deterministic, path-aware |
| **Merge queue** | combined-head `ci-fast`, exact-combined-head web coverage, path-selected Web unit/build, Mac test/package artifact, iOS unit + coverage fast gate, shared-contract integration, path-selected model-free Promptfoo/golden evals, diff secret scan, Golden Path Lock, migration policy | GitHub `merge_group` synthetic head |
| **Release (`main`)** | exact queue proof or fail-closed direct-main fallback, then successful exact CI-attempt authorization into one `production-mutation` FIFO spanning staging, promotion, one centralized rollback owner, and final verification | completed successful `CI` workflow run for `main`; one bounded controller retry |
| **Post-deploy** | hosted public, homepage, and live Lighthouse probes against the immutable deployment URL while the controller retains its lease; authenticated smoke is explicit optional evidence until credentials exist; final current-main/canonical check; JOV-INV-033 Done-sprint production HTML rescan (`DONE_INVARIANT_RESCAN=release`) against that same URL; `Production Verified` marker; event-driven Golden Path Prod Autofix (Cursor-direct, fail-closed) | successful current production release |
| **Deep / nightly** | CodeQL, Trivy, full-history secret scans, Scorecard, SonarCloud, full E2E matrix, exhaustive suites | schedule, event, or explicit manual dispatch |

Rules:
- **Heavy scans never gate a source PR or a merge-queue batch.** Running CodeQL
  ×5 + the full security suite per-PR saturated the runner pool and made the
  native queue retry-storm itself into a 6-hour stall. CodeQL / Trivy / Scorecard scan the
  *merged* code on `main` + nightly.
- **Exception: the deterministic copy gate runs on PRs.** The `copy-gate`
  ci-fast lane lints only lines a PR adds in customer-facing copy paths
  (`@jovie/copy`, policy in `canon/VOICE.md`). It is pure regex, runs in about a
  second, and blocks new harm, legal, platform-ToS, leak, and slop violations
  (founder decision 2026-09-25). Legacy lines stay advisory. LLM judge panels
  never run in PR CI; they run in the authoring loop (`copywriting` skill) and
  taste stays post-ship. Slop Gate and `slopcheck.py` are retired.
- **Exception — secret scanning gates PRs.** A diff-scoped gitleaks + trufflehog
  runs on every PR (~10s, 1 slot): a leaked key on this **public** repo is scraped
  within seconds of hitting `main`, so it is EVENT-class and must be caught
  pre-merge. The full-history secret scan stays nightly.
- **The source PR gate stays deterministic and cheap.** The merge queue is the
  integration gate for the exact combined head. A fail-closed changed-path
  receipt selects Web, Mac, iOS, operations/tooling, and shared-contract lanes;
  it owns only the selected product evidence plus deterministic global checks.
  Preview, Neon, E2E, Lighthouse,
  a11y, Storybook, golden-path, preview, and extended-smoke work never starts
  from a source-PR event or risk label. Run it through a hosted manual,
  scheduled, or repository event after the fast source gate. No PR label fans
  out CI.
- Remaining lever: turbo `--affected` + remote cache on the PR gate so cache-hit
  jobs finish in seconds (tracked in JOV-3461).
- **Source qualification is separate from production certification.** An agent
  requests GitHub's normal Merge when ready for the exact checked head. GitHub
  enforces required source checks and the native merge queue validates the
  combined head. The merge-group helper checks live membership, the exact queue
  ref and source head, and required synthetic-head checks. GitHub's current queue
  entry is authoritative for membership; historical timeline events are not an
  admission prerequisite. Native User and Bot enqueue requests use this same path
  without an Auto-Enroll receipt.
  The production controller owns deployment serialization and exact runtime
  certification after merge. A pending or failed release checkpoint is not a
  source-merge prerequisite. The legacy Auto-Enroll workflow is retired.
- **GitHub's native merge queue owns combined-head integration.** The
  `merge_group` event validates the synthetic SHA and emits the same required
  contexts as the source PR. Main reuses an exact successful merge-group SHA;
  direct/admin main commits fail closed on the current run's fallback contract
  before production promotion.

### Does my change need the heavy lane, a preview, or taste approval?

Most PRs auto-merge on the fast gate. These paths are the exceptions — know them
before you open the PR (source: `.github/ci-harness/manifest.json` `riskRules`):

| If your diff touches… | What happens |
|---|---|---|
| `auth-identity`, `billing-money`, `db-migrations`, `proxy-middleware`, `env-config`, `agent-control-plane`, CI workflows | **High risk signal** → routes deeper post-merge/nightly validation and names local reproduction commands; source `PR Ready` remains deterministic. |
| Public UI / profile surfaces | **Medium risk signal** → use the hosted manual preview/deep dispatch when review evidence is needed; Lighthouse/a11y never auto-start from the source event. |
| Design / UX / copy | **Taste-flagged** → `llm-review` label; strong LLM review + ship; classifier comment signals post-ship walkthrough. |
| Anything else (logic, tests, docs, internal app) | Fast gate only → auto-merges when green. |

- **Want a preview deploy?** Dispatch `CI` on the exact ref with
  `run_preview_deploy=true` (optionally `preview_work_id` / `preview_reason`).
  Hosted previews and ephemeral databases are explicit, expiring exceptions:
  the Vercel Git integration never builds non-`main`/`production` refs, and
  every admitted environment is recorded with the
  `jovie-preview-env-admission/v1` contract and torn down with a
  `jovie-preview-env-cleanup/v1` receipt (PR close →
  `neon-ephemeral-branch-cleanup.yml` + `vercel-preview-cleanup.yml`; daily
  `neon-scheduled-cleanup.yml` reconciles missed events). External Vercel
  preview status remains informational — see
  [`release.md`](../.claude/rules/release.md).

## 3. Merge: autonomous, per-PR, self-healing

- **The writer requests GitHub Merge when ready for the checked PR head.**
  GitHub enforces required checks, queue admission, merge-group checks, and the
  final merge. Do not use a direct merge or the retired `merge-queue` label.
  The retired Auto-Enroll bot identity and status receipt are not merge-group gates.
- **The queue tolerates transient state.** A PR is only dequeued on a real merge
  conflict, `needs-conflict-resolution`, or a **terminal** failing check
  (`FAILURE`/`ERROR`/`TIMED_OUT`/`ACTION_REQUIRED`). A `pending`/`queued`/`cancelled`
  check is **not** a failure — `cancel-in-progress` leaves zombie cancelled
  check-runs, and treating those as failures is what stripped enrollment every 20
  min and starved the queue (#11727). Do not regress this.
- **Don't bypass the queue as a habit.** The reversible admin bootstrap (ruleset →
  `evaluate` → merge → `active`) exists only to land a fix that repairs the queue
  itself, when the queue can't yet land it. It is not the normal path.

### Native build capacity (JOV-6107)

**Ship now:** two concurrent native speculative groups. The
`max_entries_to_build: 1 → 2` apply to live ruleset 10512119 is complete — the
2026-09-20 live readback shows `max_entries_to_build=2`, with the then 20-minute
budget, ALLGREEN, all required checks, empty bypass actors, and min/max merge
1/5 with wait zero preserved. The separate pending source cohort minimum/wait
cutover is not part of this apply and remains pending. Roll back only the
build count to one if runner waits or speculative invalidation outweigh the
measured throughput gain.

On 2026-09-23 the 20-minute response deadline proved shorter than required
CI paths configured for 30 and 40 minutes. The source-first repair landed and
live ruleset `10512119` was read back at 60 minutes on 2026-09-24. Re-read the
live ruleset before changing capacity and retain exact queue attempts and
removal reasons as outcome evidence. This changes waiting time, not required
checks or ALLGREEN.

Capacity figures: the 2026-09-08 Team-plan readback and
[GitHub's published limits](https://docs.github.com/en/actions/reference/limits)
give 60 standard hosted jobs and five macOS jobs across the organization,
while the repo's operative planning figure is the `HOSTED_RUNNER_CAPACITY=120`
repository variable (`ci.yml` assumes ~120 concurrent hosted jobs).
CI run 34282800645 peaked at 19 hosted jobs for one combined head; the
22:00:25 UTC organization snapshot observed at least seven other hosted jobs.
Two groups plus that background need 45 jobs; three would need 64 — feasible
under the operative 120 figure, not under the conservative 60 readback. A group
selecting both iOS and Mac needs two macOS jobs, leaving one reserve at two
groups. The five self-hosted Linux runners do not provide capacity for these
hosted product lanes.

Source preflight accepts integer build counts from one through the reviewed
ceiling of two and records the actual count and any difference from the target.
This permits source-first rollout and a one-field rollback without blocking
normal admission.

**Re-evaluate when:** a complete simultaneous-group window supplies job waits,
peak fanout, Mac usage, invalidations and actual merges/hour, or verified account
limits change. **Then:** raise the source ceiling only when measured total and
Mac demand fit with background headroom. This is a capacity ceiling, not a
permanent preference for two. Required tests run on every synthetic head;
GitHub's merge batch limit does not combine their builds or reuse stale results.

### Native admission and production health

The finishing agent requests normal GitHub Merge when ready for its qualified
exact head. GitHub's current queue entry, required checks, and combined-head
result determine admission and landing. The Auto-Enroll and Queue-Deferred
Release workflows are retired; do not wait for a drain pass, bot receipt, or
fleet-health status before making that normal request. Historical product
failure tombstones do not replace fresh source and combined-head evidence.

Production health still governs deployment and promotion through the existing
production controls. A production hold does not prohibit source repairs or
create another source-admission controller. Required source, review, security,
and combined-head gates stay in force. See
[the native merge policy](../.github/MERGE_QUEUE.md) for live configuration
receipts and the distinction between source landing and runtime certification.

### Summer closure-health stop-line

Summer owns closure health and the existing production writer retains
promotion authority. The finishing agent requests native source admission;
Gem is not the exclusive source-queue writer. The closure observer classifies
every open PR as `close`, `repair`,
`promote`, `queued`, or `held` with an owner, reason, and seven-day expiry.
`close` requires the repository's explicit `duplicate` lifecycle label;
matching titles or Linear issue IDs never prove semantic redundancy.
Summer grants no new issue lease, new implementation, or fallback PR generation
unless the typed closure receipt is healthy for that gem-repo-registry product.
Jovie native-queue empty/UNMERGEABLE is issue-blocked and does not freeze
LogYourBody or Ovie new leases; missing or malformed shared receipts stay
systems-down and fail every product closed. Promotion and deploy holds remain
Jovie-scoped. Missing or malformed closure evidence fails new Jovie intake
closed.

The legacy closure observer includes a controller-health predicate that needs
separate runtime reconciliation after Auto-Enroll retirement; its old result
does not authorize another source-admission gate. Remaining closure signals
include the native queue staying empty with eligible clean PRs for more than
15 minutes, an open PR stays unclassified for more than 15 minutes,
overlapping active artifacts for one Linear issue remain unresolved, an
explicit hold expires, or no PR merges for one hour while open PRs remain.
Held or draft PRs are not duplicate active writers; hold expiry governs them
separately. Multiple active PRs for one issue are allowed only when
changed-file sets are disjoint, and a duplicate receipt names only PRs that
participate in an overlap. Only same-repository PRs may assert a Linear lane
identity; cross-repository markers are ignored, while missing repository
provenance fails closed. Missing, malformed, truncated, or rename-ambiguous
changed-file evidence makes the complete multi-active lane unclassified. A
native queue entry becoming
`UNMERGEABLE` is red immediately: a nonempty queue is not progress. A grace
episode also pauses new intake until the writer and queue prove progress. This
stop-line never disables native promotion, exact-head PR remediation, tests, or
review; those are the mechanisms that recover closure health. The executable
authority is `JOV-INV-011` in `canon/invariants.jsonl`.

Draft stacks are a bounded exception with a four-layer maximum. A root must name
an integrator, expose a promotion path through open exact-base parents, retain a
clean ancestor chain, and carry an unexpired deadline no more than seven days
after root creation. Any depth-five stack or missing/expired contract is red
immediately: new intake stops while promotion and remediation remain live. The
observer emits one idempotent `split-or-retarget-draft-stack` action per
violating root through the existing delivery repair-task and No Unattended Red
path. That receipt is consumed evidence only; it never mutates a pull request
automatically. The executable stack contract is `JOV-INV-020`.

### Update Branch control-plane safety

GitHub Update Branch is asynchronous: the branch Git ref can advance before the
PR database, timeline, webhook payload, or Actions event base catches up. Treat
each plane as separate evidence, never as a reason to repeat the mutation.

- Accept an API rebase only after proving its exact live-base/head ancestry and
  semantic tree; a successful response alone is not proof.
- The controller gets one absolute timeout. Every `gh`/`git` child receives only
  the remaining budget and is killed and reaped before the mutex is released.
- If the semantic rebase is proven but stale PR metadata prevents checks from
  materializing, create exactly one signed empty direct child with the identical
  tree and ordinary fast-forward push it. Do not force-push or retry Update
  Branch. Require the Git ref, REST, GraphQL, and Actions source SHA to converge
  on that exact child before continuing.
- A diff secret scan uses the immutable event merge's first parent as its base,
  never the stale payload base or a later live tip. Require exactly ordered
  merge-base/source parents, payload-base ancestry into parent1, parent1 ancestry
  into the current base ref, an exact `merge-tree` reconstruction equal to the
  event tree, and TOCTOU rechecks of source and base refs. A behind/diverged
  source is valid. Checked-in built-in merge attributes are supported;
  server-only merge drivers or renormalization differences are a fail-closed
  compatibility boundary, never an acceptance fallback.

## 4. Taste: advisory, not a gate

- Taste-touching changes (design / UX / copy) get classified as `taste-required`
  by the taste classifier, which applies the `llm-review` label and posts a
  comment. The PR **ships autonomously** — taste does not block merge.
- The classifier comment is a signal for post-ship prod walkthroughs. Strong LLM
  review validates correctness pre-merge.
- `taste-approved` is no longer a human gate label — it was the old `taste-approve`
  workflow's terminal marker, which is now removed (2026-07-06). The classifier
  treats it as auto-ship if found on a reopened PR.
- A `needs-human` label on a CI-gated, non-taste PR (a dep bump, a screenshot
  regen) is still a **bug** — a false-positive labeler kills a PR's autonomy.

## 5. Guardrails that enforce this

| Guardrail | Stops |
|---|---|---|
| `pr-size-guard` | Oversized PRs (codemods use `big-pr`) |
| stack-depth guard (JOV-3457) | Runaway base-on-base agent stacks |
| GitHub native queue and exact-head merge-group checks | Landing without current combined-head proof |
| `taste-classifier.mjs` | Taste-flagged PRs are routed to LLM review, not held |
| Risk-tiered triggers | Heavy scans saturating runners on the PR path |

### Runner label policy

Self-hosted runners must use explicit self-hosted labels only (`jovie-runner`,
architecture labels, machine labels). Never add GitHub-hosted labels such as
`ubuntu-latest`, `macos-latest`, or `windows-latest` to self-hosted runners: that
routes ordinary hosted-runner jobs onto local machines with different toolchains.
The merge-group unit route runs on hosted capacity and selects `jovie-runner`
only from fresh successful Runner Heartbeat evidence. Stale, malformed,
timed-out, or API-uncertain evidence succeeds with `ubuntu-latest`; the hosted
`runner-health-monitor` is observer-only and never mutates routing variables.

## What broke on 2026-06-22

The queue stalled for 6 hours. It was not a paused merge product. Three
compounding bugs on a finite runner pool:

1. **Stacked-codemod pileup** — a token sweep shipped as 63 base-on-base PRs; the
   queue landed them bottom-up at full CI each → never drained. Collapsed in #11689.
2. **Drain churn** — `drain-pr-queue.sh` counted zombie `cancelled`/`queued` checks
   as failures and dequeued green PRs every 20 min, so no PR stayed enrolled long
   enough to land. Fixed in #11727/#11730.
3. **CI-tiering runaway** — CodeQL ×5 + the security suite ran on every PR **and**
   every combined-head batch; batches couldn't get runner slots, timed out, and
   retried every few minutes — each retry spawning another full run that saturated
   the runners further. Fixed in #11735 by moving scans off the PR path.

Plus a false-positive labeler (#11712) parking safe PRs as `needs-human`. None of
it was a paused queue. **The lesson encoded above: cheap per-PR CI, a queue that
tolerates transient check states, no heavy scans on the PR path, and labelers that
never false-positive.**

## Draft-first rolling CI contract

Publication is not promotion. PR #16336 missed GitHub because a local
affected-test shard ran more than two minutes and failed before the draft
existed. Contract:

1. Publish the first coherent commit as a draft.
   `JOVIE_PUSH_PHASE=publication git push` is the default husky path (diff,
   secrets, hook policy only).
2. Fast source CI on every push.
   Per-PR concurrency cancels superseded runs.
   `Exact-head Coverage` runs V8 coverage and the 60% changed-line ratchet on
   web-impacting source heads without repository secrets; the native queue
   repeats it on the synthetic combined head and must finish inside the
   current merge-queue check budget (20 minutes until the 60-minute ruleset
   cutover). Non-web heads emit an explicit
   non-applicable receipt. Nightly retains the global risk-surface debt check,
   so stale unrelated debt cannot deadlock promotion.
   Regression receipt: source run 32547855063 spent 3180.55 seconds collecting
   V8 coverage before a static coverage-ownership assertion failed, and hosted
   run 33892180480 cancelled the full-suite collection at 1h. The cheap
   structural selector now owns that contract, and the exact-head lane skips
   V8 when the immutable diff has no coverable product source.
3. Normalize failures (PR, exact head, check, attempt, fingerprint);
   stale or duplicate deliveries are rejected.
4. One remediation writer holds the PR lease. Implementer first.
   FX is the recovery tier after handoff or abandonment.
   `Rolling CI Dispatch` is currently `disabled_manually` (since 2026-09-02,
   verified 2026-09-20), and its source gate accepts only `pull_request`
   producers. While it is disabled there is no automated dispatcher: failed
   exact-head runs, including merge-group batches, are repaired by the
   implementer lease or by hand. Re-enabling it, and widening its gate to
   `merge_group` producers, is a founder/fleet decision. When active, it
   subscribes only to completed `CI` `workflow_run` events and launches
   Cursor-direct exact-head repair when the implementer lease is not live.
   It must not
   subscribe to generic `check_suite` or `check_run` events because its own
   completed checks can recursively re-enter the dispatcher. It does not
   check out PR code.
   `Actions Cache GC` evicts stale or duplicate turbo caches without
   deleting live pnpm, node-cache, or playwright caches.
5. A new commit or green rerun supersedes obsolete repairs.
6. Moving on requires an explicit handoff receipt (draft PR, current head,
   acceptance criteria, remaining checks, fingerprints, remediation owner).
7. Ready/landing requires the final exact, current head to be green for
   tests, coverage, security, and policy.

Use `JOVIE_PUSH_PHASE=qualification git push` before ready/landing.

## Agent checklist

Before you open a PR:

1. **Small + focused**, targeting `main`. Dependent? Use the native GitHub
   retarget/rebase sequence in [`pr-stacking.md`](../.claude/rules/pr-stacking.md).
   Mechanical sweep? one `big-pr` PR. Never create an uncontrolled stack.
2. **Don't add heavy CI to the PR path.** New scan/security/perf job → post-merge
   or nightly, not `pull_request`.
3. **Taste-touching?** Add a screenshot to the body. The classifier applies
   `llm-review` and the PR ships autonomously — there is no taste gate to wait
   on (the old 👍 `taste-approve` workflow was removed 2026-07-06). Don't add
   `needs-human`.
4. **Publish the draft first** (`JOVIE_PUSH_PHASE=publication`), consume rolling
   CI, then qualify the final exact, current head before ready. Request normal
   GitHub Merge when ready; the queue performs the final merge.
5. **Do not add or edit `CHANGELOG.md`.** Implementation PRs that touch it fail
   admission. What's New is written after land/runtime proof. Linear is SoR.
6. If a PR's base branch was deleted, **retarget to `main`** before debugging a
   "conflict."

Related: [`pr-stacking.md`](../.claude/rules/pr-stacking.md),
[`ci-branching.md`](../.claude/rules/ci-branching.md),
[`release.md`](../.claude/rules/release.md),
[`docs/company/autonomous-shipping-doctrine.md`](company/autonomous-shipping-doctrine.md).
