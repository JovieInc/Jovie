# Fast gate, signed receipts, post-merge bisect and revert: pilot spec

Status: design spec (2026-10-29). Nothing here is implemented except the
shared Turbo R2 cache (#23676), which the fast gate depends on. The decision and
kill criteria are in [merge-queue-alternatives.md](merge-queue-alternatives.md).
Each section names the existing script the next PR extends; build on those,
never next to them.

## 0. Scope

- **Pilot lane:** marketing, copy and docs only.
- **Risk tiers** (`riskTier` from the trusted classifier):
  - `low`: pilot-eligible.
  - `standard`: native queue as today.
  - `critical`: native queue plus the full deep evidence the release rules
    already require.
- **Critical always means** auth, billing, Stripe, entitlements, migrations, DB
  schema, proxy and middleware, CSP and security, env loading, workflows and
  `.github/**`, package manifests and the lockfile, `canon/**`, and generated
  files.
- **Classifier:** extend `scripts/lib/merge-queue-guard.mjs`, which already
  owns the guarded UI fast-lane fail-closed list. Add a `classifyMergeTier(paths)`
  export with a parity test against the Path Changes risk classification in
  `ci.yml`. Do not write a second classifier.

## 1. Fast gate (pre-merge, deterministic, ≤ 6 min wall)

| Check | Budget (p95) | Source today |
|---|---|---|
| Path/tier classification + fork/size policy | 20 s | `merge-queue-guard.mjs`, PR Size Guard |
| Diff secret scan | 30 s | Source Validation secret scan |
| Biome + changed-file ESLint | 60 s | `pnpm biome:check`, `lint:eslint:changed` |
| Affected typecheck (Turbo, R2 read) | 120 s | `pnpm typecheck` via `scripts/run-scoped-turbo-task.mjs` |
| Path-selected Source Validation guards | 60 s | `pnpm preflight:changed` guard set (same list) |
| Docs: link check, doc parity, copy lint | 60 s | docs evals in `docs/DOCUMENTATION.md`, `@jovie/copy` lint |
| Marketing static: affected unit tests | 90 s | `turbo test:fast --affected` |
| Receipt verification (section 2) | 5 s | new |

- **Overall budget:** ≤ 6 min wall p95, run in parallel.
- **Measured:** CI timing collector `job_attempt` rows for a new
  `fast-gate` job name, plus `turbo_cache` rows.
- **Breach:** a breach over 7 days opens a ratchet issue rather than adding
  checks.
- **Not in the gate:** web build, E2E, visual and Lighthouse run post-merge
  (section 4).

## 2. Signed preflight receipt

The receipt is written by `pnpm preflight:changed` (and `preflight:remote`, #23660,
on Gem) when every check is green.

```json
{
  "schema": "jovie-preflight-receipt/v1",
  "repo": "JovieInc/Jovie",
  "head": "<40-hex PR head sha>",
  "tree": "<40-hex tree sha of head>",
  "base": "<40-hex merge-base with origin/main>",
  "checks": [{ "id": "typecheck @jovie/web", "status": "ok", "durationMs": 61234 }],
  "checkSetDigest": "sha256:<digest of sorted check ids + versions of scripts/preflight-changed.mjs>",
  "lockfileDigest": "sha256:<pnpm-lock.yaml>",
  "nodeVersion": "24.22.1",
  "host": "gem",
  "startedAt": "2026-10-29T17:00:00Z",
  "finishedAt": "2026-10-29T17:01:15Z",
  "signer": "ssh-ed25519 <key fingerprint>"
}
```

**Transport.** The receipt travels as a commit status / check-run note on the
exact head, or as a PR comment marker `<!-- jovie-preflight-receipt/v1 ... -->`.
It follows the existing `jovie-hold/v1` and `jovie-queue-failure-hold/v1`
patterns.

**Signing.**
- An `ssh-keygen -Y sign -n jovie-preflight` detached signature over the
  canonical JSON.
- Allowed signers live in a checked-in `allowed_signers` file, one key per host
  (Gem, each agent Mac).
- Uses SSH signing keys the agents already use for commits, so there is no new
  credential class (inferred; confirm per host).

**Verification in the fast gate.**
- The signature is valid for an allowed signer.
- `head` and `tree` equal the PR head; `base` is an ancestor of current `main`.
- `checkSetDigest` equals the digest computed from the gate's own copy of the
  check set.
- `finishedAt` is under 24 h old.

**What the receipt buys.** With a valid receipt the gate skips nothing in the
pilot. It is evidence, not authority, until the audit (section 3) shows
receipts reproduce. After 2 clean weeks, a valid receipt lets the gate skip the
affected-typecheck and guard steps that the receipt covers.

**Reuse.** This is the same receipt shape and verification idea as
`scripts/lib/prod-cert.mjs`: SHA-bound receipts with per-check timestamps,
`blocked` with a reason, and never a silent pass. It writes the per-run JSONL
row that `preflight-changed.mjs` already writes
(`~/.local/state/jovie-lanes/preflight-changed.jsonl`).

## 3. Sampling audit

**Sample.** A scheduled-plus-event job on the Gem self-hosted runner picks 1 in
10 receipts for pilot-merged PRs, uniformly and seeded by head sha so the choice
is reproducible. It also takes every receipt from a host with less than 20
audited receipts.

**Re-run.** It re-runs the receipt's check set in a clean worktree at `head`
and compares the results.

- **Mismatch:** a receipt said ok and the re-run is red.
  - Kill criterion 5 trips.
  - The signer's key is marked untrusted (removed from `allowed_signers` by an
    automated PR).
  - The audit re-checks that host's last 50 receipts.
- **Flake:** red, then green on a re-run. This is recorded as a flake, not a
  forgery, and feeds the quarantine ledger
  (`.github/scripts/quarantine-ledger.mjs`).

**Metrics.** The audit writes timing-collector rows: audited, match, mismatch,
flake, and audit duration.

**Reuse.** `scripts/lib/merge-group-local-evidence.mjs` already computes
merge-group evidence from local git instead of REST. The audit uses the same
local-git approach and spends no REST calls per audit.

## 4. Post-merge verify, bisect and auto-revert

**Trigger.** A `push` to `main` that contains at least one pilot (bypass-merged)
commit since the last certified-green SHA. The trigger is event-driven, with a
backstop sweep only.

**Verify.** It runs the heavy suites for the touched surfaces against the new
`main` head: marketing build, visual/DOM invariants, link check, and the
affected E2E smoke. With multiple uncertified commits it tests the tip first.

**Bisect.**
- On red at the tip, bisect across the uncertified range (`last-certified..tip`).
- At most ⌈log2 N⌉ runs, each on an exact SHA; Turbo R2 cache hits make the
  re-runs cheap.
- Only pilot commits in the range are revert candidates.
- A non-pilot (queue-proven) commit that the bisect blames is escalated to
  `lane-fix-red`, never reverted automatically.

**Auto-revert.**
- Open a revert PR of the culprit squash commit with `revert` and a
  `jovie-hold/v1`-style receipt naming the failing check and the bisect
  evidence.
- The revert itself takes the fast gate plus direct merge, since reverts of
  low-tier commits are low-tier.
- Reopen the original PR's work as a `lane-fix-red` item.

**Release controller.** It promotes only certified-green SHAs, as today. The
stale-prod carryover policy (`.github/scripts/staging-lane-carryover.mjs`,
`staging-supersession-policy.mjs`) already stages cumulative deltas at current
`main`. The controller must additionally refuse a SHA inside an uncertified
range. The next PR adds that predicate beside the carryover logic, with a test,
and does not create a new controller.

**Breaker.** `scripts/lanes/queue_breaker.py` already trips after two
merge-group failures per PR. Extend it with a pilot breaker: two pilot reverts
inside 24 h pause the bypass app. The pause is a repository variable
`PILOT_BYPASS_FREEZE=1`, mirroring the existing `QUEUE_FREEZE` runbook in
`.github/MERGE_QUEUE.md`.

**Measurement.** Per stage, record entry and exit timestamps keyed by head SHA:
gate start/end, merge, verify start/end, bisect start/end, revert merged, and
certified. Add these as collector rows so p50/p95 for red-main minutes and
promotion lag are tracked against the kill criteria.

## 5. Bypass mechanism (needs a reviewed ruleset cutover)

- A second ruleset on `main` with the dedicated bypass app as its only bypass
  actor. It reuses the existing Jovie Bot app identity if its permissions
  allow; otherwise it needs a new GitHub App, which is a new credential and
  needs Tim.
- The app merges only when all of these hold:
  - tier `low`;
  - a green fast gate on the exact head;
  - a valid receipt;
  - no hold labels (`scripts/lib/admission-hold-labels.mjs`);
  - `PILOT_BYPASS_FREEZE` unset.
- The queue ruleset `10512119` stays unchanged for everything else.
- **Retired paths stay retired.** `queue-deferred-release` and
  `queue-deferred-release-admission` remain the model for exact-head admission
  evidence (`scripts/lib/queue-deferred-release-admission.mjs`). Reuse their
  exact-head binding, not their retired workflow.

## 6. Build order (next PRs)

1. `classifyMergeTier` in `merge-queue-guard.mjs`, with parity tests.
   Report-only: it labels PRs `tier:low` and does not change merge behavior.
2. Receipt writer in `preflight-changed.mjs` and a verifier library. Shadow-mode
   verification runs in Source Validation as a non-required context.
3. Post-merge verify, bisect and the revert bot on `main` pushes, enabled for
   all low-tier commits even while they still go through the queue. This
   measures the would-be revert rate before any bypass exists.
4. Sampling audit job on Gem.
5. Bypass ruleset and app (cutover PR, with live readback), only after steps
   1-4 show the kill criteria would not have tripped over 7 days of shadow data.
