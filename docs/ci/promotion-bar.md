# Promotion bar (promotion-bar/v1)

Goal: a draft PR is promoted (undrafted + queue-enrolled) only when it is very likely
to land on main first try. Target: >= 90% first-pass landing for promoted PRs.

## Definitions (fixed, so the number cannot drift)
- **First-pass land**: the first merge_group CI run whose queue head is this PR, on the
  promoted head SHA, concludes `success` and the PR merges. A `cancelled` run caused by
  a different PR's ejection (cascade) is excluded from both numerator and denominator.
- **Ejection**: a merge_group run for this PR concludes `failure` (any required workflow).
- **Cohort pass rate**: first-pass lands / resolved promotions, per policy SHA, over a
  rolling 7 days. Reported with a one-sided 95% Wilson lower bound. The bar is met when
  the lower bound is >= 0.90. No per-PR probability is invented.

## Hard evidence (all required, all bound to one tuple: repo, pr, head, base, tree, policy, metadata)
| Gate | Evidence | Source of truth |
|---|---|---|
| sourceChecks | every required PR context green on head | Checks API |
| mergeSuiteParity | the merge-group suites selected for this diff (unit shards, storybook, build+layout, ci-fast) passed on head-merged-with-current-main | `preflight-remote` bundle or a dispatched CI run on the dry-merge ref, exact tree |
| dryMerge | head merges cleanly into current main tip; base <= 40 commits / 12h behind | compare API + test merge |
| sizePolicy | `pr-size-guard-policy.mjs` from main passes on the same diff the queue will count | same script the merge-group job runs |
| guardrailSchema | Guardrail section has class, mechanism, enforced, heals, NOW or LATER+issue, Simulation; no N/A | deterministic parser |
| holdsClear | no hold / lane-fix-red / machine labels | labels |
| outsideReviewRecorded | lane requires it -> completed outside-review run on this head (presence only; content never gates) | check run |
| retryBudget | head not previously ejected for a code/conflict/size class; <= 1 infra retry per head | ejection ledger |

Queue-level gates: queue snapshot complete and unchanged, an admission lease held
(no two promoters racing), no predicted conflict with queued PRs (file overlap alone
is a warning; a failed test merge is a conflict), queue circuit closed.

## Queue circuit breaker
Open when main is red, or the same job fails in merge_group for >= 3 distinct PRs within
2h (systemic, e.g. Nov 17 2026 `ci-fast (remaining)` across #25864/#25856/#24765/#24775).
While open: no promotions (drafts keep their green evidence), and the failing job is
routed to its owning lane. Closes on the first green main push after the fix.

## Feedback loop (every ejection becomes a guardrail)
`ejection-classifier.yml` runs on `workflow_run: CI completed` for `merge_group` failures:
1. Classify by failing job + cross-PR correlation: `code` (only this PR's group fails that job),
   `systemic` (>= 3 PRs, opens circuit), `infra` (quota 403/429, runner timeout, cancelled
   required check), `contract` (CI plumbing, e.g. Merge Suite Scope claim without unit
   results), `size`, `conflict`.
2. Write `ejection/v1` receipt (artifact + PR label `mq-ejected:<class>`). Never re-enqueues.
3. For every class except `code`, upsert one Linear issue per (class, job) with count, so a
   repeating class becomes a guardrail in the owning lane (skill guardrail-with-every-fix).
   Rule: a class seen >= 2 times in 7 days must get a shift-left twin (pre-push or PR-stage)
   or a fix to the check itself.
4. Rate limits: 1 issue upsert per (class, job) per hour; kill switch `vars.EJECTION_CLASSIFIER_OFF`.

## Rollout (autonomous, per check-promotion rule)
1. Shadow: compute verdict on every auto-ready wake, log `promotion-bar/v1` JSON; never blocks.
2. False positive = shadow HOLD on a PR that then landed first-pass. After >= 20 runs or 7 days
   with 0 false positives, plus 1-2 non-implementer reviews, switch auto-ready to enforce
   (HOLD keeps the PR draft; it is never a failing merge check).
3. Auto-demote back to shadow if the false-positive rate exceeds 2%.
4. Never: admin bypass, skipping/weakening required checks, AI verdict as a gate.

## JOV-13053 worktree implementation / operator handoff

Done-check: both existing promotion mutations emit `promotion-bar/v1` before
mutation, keep their existing checks, and continue in shadow on a HOLD or collector
error. Both same-head recovery paths reject code/size/conflict and unattributed
failures, permit one classified infra/contract retry, and preserve positive cascade
attribution. `ejection/v1` records the source head parsed from the full queue ref.

The implementation is deliberately shadow-only, including when an ambient
`PROMOTION_BAR_MODE` requests enforcement. No status emitted here is required.
The collector's network adapter uses the existing shared API client; clocks,
transports, evidence, and optional selected-suite dispatcher/lease are injectable.
`mq-retry/v1` is an advisory reservation used by the recovery writers, never a
required check. A reservation is spent before enqueue and is not refunded after
an uncertain mutation. Existing failure-hold/retry statuses are also consumed.

Current-main compatibility gaps (JOV-13053; speed/parity coordination JOV-13054,
size-policy owner JOV-13052):

- The real pre-push entry is `scripts/hooks/prepush-preflight.mjs`, with
  `scripts/preflight-changed.mjs` and `scripts/preflight-remote.mjs`; the package's
  `scripts/ci/pre-push-gate.sh` does not exist here. The hosted bundle is
  `preflight-evidence/evidence.json`, containing `{sha, tree, rc, host, at}`.
  That existing artifact is read, but it does not attest the selected MQ suites
  on the current merged tree. It is never falsely promoted into that proof.
- `ci.yml`'s `workflow_dispatch` path explicitly runs every product lane. It has
  no selected-suite/dry-merge input. Consequently the runtime does not dispatch a
  duplicate full flight. The collector accepts an injected compatible dispatcher
  only when no bundle exists, and remains HOLD while the proof is pending.
  Selection comes from the same `product-lane-classifier.mjs` and
  `ci-repo-lanes.mjs` used by path detection, without a copied shard list.
- There is no existing cross-controller admission lease. Read-only collection
  cannot create one, and per-PR Actions concurrency is not such a lease. The
  runtime reports `no bounded admission lease`; it never fabricates one. The
  collector can consume a trusted shared lease provider when one is available.
- A nonempty queue requires a combined-tree test against its neighbors. Native
  GraphQL snapshots are complete and versioned; their order is reread. Until a
  trusted combined-tree proof is available the queue integration result is
  `unknown`, rather than inferring a conflict from shared filenames.

These gaps intentionally cause shadow HOLDs. They must be resolved under
JOV-13053 before the rollout can consider enforcement or claim calibrated
promotion reliability. This worktree creates no PR or external issue update;
the operator owns publication and coordination.

Ship now: observe in shadow and stop the unchanged-head retry loop.
Re-evaluate when: parity, shared lease, and queued-tree evidence exist and the
20-run/7-day rollout criterion has been measured. Then: review the false HOLDs
and decide whether enforcement is justified.
