# Symphony useful-turn proof v2

PR #17207 provides Jovie-side source contracts. It does not certify a running
Symphony scheduler or authorize deployment/restart. Official scheduler exit-78
behavior is a separate dependency on `itstimwhite/symphony` PR #2. The coordinator
reported its source commit `15fdebaa7e0b34eae02073e35a2a1814714d3544` merged to fork-main
`faeed72e5d1d20d8b5c839ef5958e66b3c84ecea` at 2026-09-04T21:32:32Z,
with 307 tests passed, 6 skipped and 100% upstream coverage. That separately owned
source receipt was not rerun by this Jovie task. Package and live runtime identity
remain unproved; no installation or restart follows from either source result.

## Trust boundary

An arbitrary JSONL row cannot attest itself. The on-demand authenticated producer
verifies a randomized computation from Codex's final-message file, with the exact
enrolled provider/model, account directory and `JOVIE_AGENT_PROFILE=coder`. It
holds the account lock and rechecks enrollment, runtime and cooldown state after
completion before creating an exclusive, mode-0600 artifact keyed by probe ID.
It emits the proof as JSON for the existing projector input. It does not enroll
accounts, change credentials, recover cooldowns, start a service or schedule work.

The projector, gate and controller independently read `SYMPHONY_PROOF_CONTEXT`
(default `/home/timwhite/gem-workspace/state/proof-context.json`). This operator-owned,
mode-0600 file contains:

- `runtime`: schema `symphony-runtime-identity/v1`, service
  `symphony-elixir.service`, exact 40-character `sourceRevision`, and SHA-256
  `binarySha256`, `workflowSha256`, `contractSha256`.
- `sourceRoot`, `binaryPath`, `workflowPath`: independently remeasured local paths.
  The imported contract file must match `contractSha256`.
- `observedAt`: enrollment observation, at most 600 seconds old, never future.
- `accounts`: exact `provider`, `profile`, `model`, `agentProfile: coder`, and
  `accountPath`. Profile identity hashes the canonical account path and the auth
  and configuration file digests. A replacement invalidates existing proofs.
- `attestationDir`: private mode-0700 directory owned by the executing OS principal.

The trusted context is not inferred from incoming proof rows or inventory claims.
Missing, stale, contradictory or mismatched trust closes capacity. Completion
artifacts must exactly match the supplied rows. A repeated seat in one projection
is rejected; callers must supply one current proof per provider/profile. Rows
older than 24 hours, future rows, schema-v1 rows, negative/boolean measurements,
failed/non-useful completions and unmatched enrollment cannot create capacity.
This is local filesystem provenance, not cryptographic protection against a
compromised OS principal that owns both the context and completion artifacts.

The existing recovery probe is separate: a successful random final-message
challenge can clear a cooling account using a state compare-and-swap. A new
limiter event, changed account identity, occupied account lock, diagnostic-only
stdout or failed completion leaves cooldown untouched. Recovery readiness alone
never becomes useful-turn capacity.

## Retry and admission boundaries

The Jovie reconciler keeps a current exit-78 failure terminal even when a routing
receipt/generation changes. Repair requires cleared failure evidence and a new
valid routing generation. Structured provider cooldowns preserve the exact
`nextEligibleAt` in one durable deferred receipt, with one attempt, no alternate
provider handoff and no repeated attempt growth. These are local reconciler
contracts; they do not establish that the external official scheduler honors them.

PR #17213 remains intact: allowed production-unbound `maxConcurrent` is 1 through
40 inclusive; denied is exactly zero. Dispatch cannot exceed verified useful-turn
capacity. No sidecar masks, provider admissions or running configuration are
changed by this source work.

## Verification

The exact-head fleet CI job runs the canonical `scripts/symphony/tests` paths,
including the gate, fleet receipt, evaluator, controller and recovery probe suites.
`python3 scripts/symphony/tests/run-proof-gate.py` executes the adversarial unittest
selector and enforces 90% line coverage separately for the changed proof-contract
functions, trust loader, producer and projector using Python's standard tracer.
Coverage is execution-derived, with executable/missing lines printed to CI logs.
It is line coverage, not full branch coverage or live authenticated-runtime proof.

Local aggregate `pnpm invariants:check` reached the final webhook Vitest selector
after all 211 Node tests and preceding Python stages passed. That selector is
blocked by absent worktree dependencies. Invoking the existing shared Vitest
binary with the same worktree/config/selector also failed resolving
`@vitejs/plugin-react`. No dependencies were installed and no checks were skipped.
Hosted draft CI must provide the exact-head Node/Vitest result before readiness.
