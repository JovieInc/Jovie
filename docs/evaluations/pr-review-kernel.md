# Draft-PR review kernel

Status: Phase 1 (shadow), shipped disabled. `.github/workflows/pr-review.yml`
writes a receipt artifact and never posts. It runs only once
`vars.PR_REVIEW_ENABLED` is `true` and the `PR_REVIEW_AI_GATEWAY_API_KEY` secret
exists; without the key the receipt is `incomplete` / `no-key`.

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
    `scripts/backlog-orchestrator/config/model-registry.json`, for the `pr-review` job class
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
**Then:** move verification to subscription pools through the shipping lanes (`scripts/lanes`).

## Models: ranked by expected cost per successful review

The kernel does not hardcode models. `scripts/pr-review/rank.mjs` ranks the
Gateway models in `scripts/backlog-orchestrator/config/model-registry.json`
twice:

- **`review`**, for discovery, costed on a full-diff job.
- **`review-verify`**, for verification, costed on a short call. It has a
  quality floor of 65 (`routing_policy.min_quality`), because verification
  decides what gets posted.

`selectRoutes` in `models.mjs` then takes the pair with the lowest combined
expected cost. The verifier must come from a different family than the
discoverer.

`rank.mjs` ports the cost math from the retired Symphony router (JOV-6637). It is
local to review. Agent lanes route through `scripts/lanes`.

**Expected cost per success:**

1. **Price.** Start from the list price, or from the `promo` price while
   `promo.until` is in the future. Apply `effective_price_multiplier` for
   prepaid credits. For subscription models, divide by `sub_included_multiplier`.
2. **Attempt cost.** Tokens × price, plus minutes × `minute_value_usd` (0 for now).
3. **Success rate.** A Beta-smoothed blend (`prior_weight` 2) of observed
   outcomes and the `quality_by_capability` prior. Once a model has 5 samples
   (`min_samples`), observed token and minute averages replace the job estimate.
4. **Combine.** `review` and `review-verify` are one-shot work, so the expected
   cost is attempt + (1 − p) × `failure_cost_usd` ($5). Work without a failure
   cost uses attempt ÷ p.

**Priors, 2026-09-25.** Each Gateway review entry cites its sources in the
registry:

- `quality_by_capability` is DeepSWE v1.1 pass@1 under mini-swe-agent:
  - V4.1 Flash 74.2
  - GLM 5.3 66.9
  - GLM 5.3 Flash 63.4
  - V4 Flash 54.4
- Prices are registry inputs for disabled ranking, not live provider availability proof. The existing canonical GLM Flash agent row and its current conservative price are preserved; historical routing metadata is matched by model identity rather than JSON position:

  | Model | Input | Output |
  |---|---|---|
  | `deepseek/deepseek-v4.1-flash` | $0.075 | $0.30 |
  | `zai/glm-5.3` | $0.5625 | $1.8326 |
  | `zai/glm-5.3-flash` | $0.20 | $1.50 |
  | `deepseek/deepseek-v4-flash` | $0.06 | $0.18 |

  The Gateway spells GLM ids `zai/`; `z-ai/` is HyperAgent's spelling.

No public code-review benchmark covers these models, and real-PR review scores
run far below synthetic ones, so replay outcomes are meant to replace these
priors.

With the priors, discovery goes to V4.1 Flash and verification to GLM 5.3. V4
Flash is cheaper per token but loses on its miss rate. A test locks this pair
in.

**Outcomes:**

- `node scripts/pr-review/replay.mjs <seed.json> --ledger <path>` merges one
  outcome per model per case into a `model-outcomes/v1` ledger. The ledger is
  keyed by case, so a re-run replaces the old entry instead of double-counting.
- A case succeeds when every labelled defect is found and no verified finding is
  a false alarm. Incomplete receipts don't count.
- `PR_REVIEW_OUTCOMES=<ledger>` makes the ranking use it.

**Pins and budget.** `PR_REVIEW_DISCOVERY_MODEL` and
`PR_REVIEW_VERIFICATION_MODEL` may pin a model, but only one the ranking returned.
The per-PR budget is $0.50 (`DEFAULT_RUN_LIMITS.budgetUsd`), priced at effective
rates. Calls reserve a conservative input-byte/output-token ceiling before dispatch, including concurrent calls. Receipts distinguish observed spend from reserved budget; missing usage makes the receipt incomplete. The Gateway key must retain its own spend cap.

## Enabling the shadow run

1. Add the repository secret `PR_REVIEW_AI_GATEWAY_API_KEY` (a Gateway key with a
   spend cap).
2. Set the repository variable `PR_REVIEW_ENABLED=true`.
3. Push a draft PR and download `pr-review-receipt-<pr>-<sha>` from the run.

Score replays with `node scripts/pr-review/replay.mjs <seed.json>`.

## Phases

1. **Contracts (done):** the receipt and finding contracts, the risk floors,
   and the release.md finding states.
2. **Shadow run (this change):** the kernel in `scripts/pr-review/`; the disabled
   `pr-review.yml` workflow ships separately. Importers are found
   with `git grep` for now; the TypeScript compiler API walk is deferred. Receipts are stored as artifacts only.
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
