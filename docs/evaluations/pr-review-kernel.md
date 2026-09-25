# Draft-PR review kernel

Status: Phase 0 (contracts only). No workflow runs yet, no model is called, and
nothing is posted.

The goal is an advisory reviewer that runs on draft PRs. It finds possible defects
cheaply, verifies them independently, and gives the PR's existing author evidence
they can act on. It is never a merge gate. Native CI and GitHub's merge queue
stay in charge (see [PR_FLOW](../PR_FLOW.md)).

Contract: [`scripts/lib/pr-review-contracts.mjs`](../../scripts/lib/pr-review-contracts.mjs)
(`pr-review-receipt/v1`). Tests:
`pnpm exec vitest --root scripts --config vitest.config.mts run lib/__tests__/pr-review-contracts.test.mjs`.

## Decisions

- **One review subsystem.** This kernel replaces the ad-hoc second-model pass in
  `qa-swarm-diff-review`. It does not add a judge service, scheduler, governor or
  merge controller.
- **FX is not the executor.** `fx-cli` is the hosted remediation tier, and Rolling
  CI Dispatch is `disabled_manually`. The review emits a receipt. The PR's author
  session reads it and fixes verified findings on the same PR.
- **Trusted execution only.** Per `claude-review.yml`, PR-controlled code never
  runs with review credentials.
  - The review job runs from `main`. It reads the PR diff and files as data and
    never checks out or executes PR code.
  - It holds a model key and no write token.
  - A separate deterministic publish job holds `pull-requests: write` and no
    model key. It revalidates the live head before posting.
  - An executable-proof sandbox (base-pass/head-fail tests) is out of scope for v1.
    Findings ask for a regression test, and the author writes and runs it.
- **Risk floors are deterministic.** The ci-harness `riskRules` ids map to
  specialists and a minimum tier (`RISK_REVIEW_FLOORS`). Model or Jev advice can
  raise the tier and can never lower it.
- **Honest coverage.** An area that was not reviewed is `not-assessed`.
  Budget exhaustion, timeouts and provider errors make the receipt `incomplete`.
  If the head moves during review, the receipt is `stale`. None of these outcomes
  is reported as clean.
- **Finding states:** `candidate | verified | fixed-and-reverified |
  dismissed-with-evidence | stale | not-assessed`. A reply is not evidence of a fix.
  `.claude/rules/release.md` uses the same states.
- **Publishing:** one summary comment, edited in place. At most five inline
  findings, each verified, P0/P1, and deduplicated by `rootCauseId`.

## Data scope and compute (Tim, 2026-09-25)

- **Providers:**
  - Raw source may go to the Gateway providers listed in
    `scripts/symphony/config/model-registry.json`, for the `pr-review` job class
    only.
  - `typesafe-ai/jev` may receive bounded source excerpts for finding
    verification: at most `JEV_CODE_EXCERPT_MAX_BYTES` (16,000) per request, after
    the existing secret/PII screen, with `evidenceBasis: source-excerpt`.
  - This amends the curated-text-only rule in
    [jev-gateway-integration](jev-gateway-integration.md) for this scope only.
  - Jev runs in `jev-shadow/v1` mode and filters nothing until replay evidence
    supports it.
- **Compute:**
  - One hosted `ubuntu-latest` job per PR head, with bounded internal
    concurrency. Fixed self-hosted runners are not used.
  - This is an explicit exception to `gateway_only_after_included_pools_are_exhausted`.
    The reason is isolation: subscription credentials never sit beside untrusted
    PR text.
  - There is a per-PR USD cap and a daily cap, and `no_on_demand_overage` still
    applies. No human approves individual calls.
- **Retention:** receipts are workflow artifacts. Findings are entered into the
  gbrain queue through the qa-swarm writer. Raw provider errors and prompts are not
  persisted.

**Ship now:** Gateway on hosted runners, with caps.
**Re-evaluate when:** monthly review spend exceeds `api_burn_fraction_of_sub` (15%)
of the relevant subscription cost.
**Then:** move verification to subscription pools through Symphony admission.

## Phases

1. **Contracts (this change):** the receipt and finding contracts, the risk floors,
   and the release.md finding states.
2. **Shadow run:** add the kernel and a `pr-review.yml` workflow triggered by
   `workflow_run` of the CI Risk Classifier. Receipts are stored as artifacts only.
   Replay a seed set of 40–60 historical regressions plus about 20 clean PRs.
3. **Publish:** the summary comment and inline findings. `/ship` reads the receipt.
   This phase opens only when confirmed precision of posted findings is at least
   90% on the seed set.
4. **Escalation:** Jev shadow alignment, a strong-tier pass for forced risk ids,
   and a strong-tier pass on about 10% of clean low-risk PRs to measure what the
   cheap reviewer misses.
5. **Expand check families:** DB/migrations, provider contracts, Next.js
   server/client and privacy, each added only when replay shows it catches defects
   the others miss. Revisit the sandbox and open-sourcing here.

## Known contract drift (follow-ups, not fixed here)

- `.claude/commands/drain.md:15` forbids `gh pr merge --auto`, while
  `.claude/rules/release.md` has the writer request GitHub Merge.
- `ci.yml` feeds the risk classifier's `requires_smoke` into `run_full_ci`. That
  may conflict with release.md's rule that risk classification never starts
  heavyweight lanes.
