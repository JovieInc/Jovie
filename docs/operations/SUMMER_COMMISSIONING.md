# Summer commissioning

Issue: JOV-5853
Registry: `scripts/summer-commissioning/registry.json`
Acceptance harness: `scripts/summer-commissioning/commissioning.mjs`

Summer is **not commissioned**. The 2026-09-01 audit found a split runtime and
authority model: Ovie desktop invokes the local Hermes Summer profile, the Eve
Summer identity is read-only, and Photon/iMessage still binds Ovie. This page
records the commissioning boundary; it does not choose whether Hermes should be
retired for Spectrum.

The registry consumes the pending `jovie.certification/v1` contract from
JOV-5753. It does not define another lifecycle, event bus, scheduler, or
orchestration platform.

## Current gap map

| Capability | Implementation | Readiness | Canonical path or blocker |
| --- | --- | --- | --- |
| Ovie desktop round trip | already works | degraded | Fresh production observation reached the authorized owner session at `jov.ie/hud`, but the signed Aug-16 shell has no Talk door or `/app/ov/chat` route. A bounded launcher Retry returned to Unavailable; request, response, persistence, and chat recovery remain unproven. |
| Photon/Spectrum iMessage round trip | conflicting | blocked | Photon binds Ovie; no Spectrum/Photon runtime was observed. Routing decision belongs to the separate coordinator. |
| GBrain/Supabase query | already works | degraded | Read-only Ovie tools exist; live GBrain queries timed out. |
| Neon/application query | missing | blocked | No least-privilege Summer tool exists. |
| Stripe/business query | missing | blocked | No read-only Summer business tool or safe fixture exists. |
| Linear read/update | in flight | blocked | Eve Summer refuses writes; PR #16396 carries durable delivery work. |
| Repo/PR/deploy lookup | in flight | blocked | Shipping-state sources exist but are not in the Summer safe-tool manifest. |
| Intent → dispatch → observed result | in flight | degraded | One exact packaged source (`b315372…`) claimed/completed a real worker job and persisted the expected reply, but its root PRs are unlanded and it predates this receipt contract. |
| Execution failure escalation | already works | untested | State and watchdog primitives exist; Summer-owned runtime proof is absent. |
| Soul/invariants/autonomy/version | conflicting | blocked | Eve and local Hermes are separate identities without a shared version digest. |
| Heartbeat/no-op/reconciliation | conflicting | blocked | Scheduled turn `01a05f69-5b89-7db0-81fe-96fe21aae443` completed in 9.873s after the heartbeat was updated to require a terminal receipt, but emitted no assistant message, tool marker, or receipt. Empty completed turns fail closed. |
| Missed-event recovery | already works | untested | Ambiguous dispatch reconciliation exists without runtime proof. |
| Duplicate/idempotency | already works | passing | Immutable/dedupe source contracts exist; intended-environment receipt is still required. |
| Dependency degradation | already works | passing | Fail-closed source tests exist; intended-environment receipt is still required. |
| Permission refusal | already works | passing | Read-only and isolation boundaries exist; intended-environment refusal receipt is still required. |
| Product Quality Governor | in flight | blocked | A bounded `/start` contract composes existing Journey Auditor, pstack verification, certification/Ovie review, Eve triggers, and Symphony dispatch. Source deliberate-red coverage exists; no event-driven exact-runtime repair loop has passed. |

The JSON registry is the machine-readable source for evidence, invalidation
conditions, owner/remediation references, and probe versions.

## Proof-tier ledger

| Tier | Current evidence | Disposition |
| --- | --- | --- |
| Source | Root PRs #16960, #16955, and #16958; packaged-workspace/session fix #16962 | Open and unlanded; not current-main proof. |
| CI | No CI receipt was supplied for the exact four-PR source set. | Unknown; cannot inherit source or runtime proof. |
| Queue | None of the four PRs is landed. | Confirmed not landed; Grok retains the separate CI/queue lane. |
| Exact packaged runtime | Signed package from source `b31537204a4a8dfeaeb8c55061bd1c1cfeecc470` dogfooded through real `/app/ov/chat`; Summer claimed/completed the worker job. | Verified for that package only; it predates the canonical commissioning receipt schema. |
| Persistence | The UI persisted `SUMMER_LOOP_OK The number-one shipping bottleneck is Symphony stay-up on Gem — idle factory means Linear work does not land.` | Verified for that package only. |
| Fresh production Mac | Signed `app.jov.ie` 26.8.1 (`app.asar` SHA-256 `3877b0a…`) loaded the existing authorized owner session on production web commit `8d58cb6589d2776c3ba37dc118c845de4fff7dfc`. | **Blocked before request** — installed shell lacks the Talk door and `/app/ov/chat`; HUD launcher Retry returned to Unavailable. Privacy-safe receipt: `docs/operations/evidence/summer-mac-production-dogfood-2026-09-01.json`. |
| Recurrence | A five-minute Codex heartbeat is attached to Summer. Scheduled turn `01a05f69-5b89-7db0-81fe-96fe21aae443` completed in 9.873s but emitted no assistant message, tool marker, or terminal receipt after the heartbeat was updated to require one. | Scheduling recurrence exists, but empty completed turns do not prove Summer identification/remediation recurrence. Require a later non-empty signed scheduled receipt. |
| Eve-native ownership | No Eve-owned scheduler/no-op/remediation receipt across restart. | **Blocked** — owner: Eve / Summer liveness. Re-evaluate only when Eve owns the schedule and emits signed terminal receipts; any ownership, cadence, state-fingerprint, cost-budget, restart, or escalation-route change invalidates proof. |

These receipts are incorporated as evidence rather than duplicated as new
implementation. They do not turn the canonical 16-probe gate green and do not
create another task or overlap the CI/queue lane.

## Runtime convergence sequence

This sequence does not decide Hermes versus Spectrum. That routing choice stays
with the coordinator; the commissioning gate only records whether one canonical
runtime has actually won.

1. **Canonical runtime gate:** the coordinator selects the runtime that owns the
   Summer principal and version digest. Success is one runtime identity, one
   declared version, and no competing write-capable Summer process.
2. **Desktop/Eve convergence:** Ovie desktop and Eve bind the same principal,
   policy, safe-tool manifest, and terminal receipt format. Existing isolation
   remains fail-closed during the cutover.
3. **Photon/iMessage adapter:** Photon binds that same principal without creating
   a second identity or orchestration path. Desktop and iMessage must produce
   equivalent correlation and terminal receipts for the same fixture.
4. **Authority completion:** land or replace the existing Linear/Symphony and
   operations-truth work in PRs #16396 and #16406, then add least-privilege
   read/query adapters for the explicitly blocked Neon and Stripe fixtures.
5. **Deterministic proof:** run all 16 versioned probes against the exact intended
   runtime version. Any red probe remains a blocker with its registry owner and
   remediation references.
6. **Burn-in and soak:** run the bounded 1–2 hour workload, then the 24-hour soak.
   Neither phase can waive a missing deterministic receipt.

## Probe receipt contract

Each external probe writes `<probe-id>.json` into one evidence directory. A
passing receipt must include:

- `schema`: `jovie.summer-commissioning.probe-receipt/v1`
- exact `probeId` and `probeVersion`
- exact SHA-256 `registryDigest` for the canonical 16-capability registry
- exact fixture and expected/actual state
- a safe correlation identifier
- intended environment and exact environment/deploy version
- exact source commit SHA (`sourceVersion`) for the clean tree under evaluation
- start/completion timestamps, non-negative latency, and completion within the
  15-minute freshness window
- `outcome: "passed"`
- at least one structured immutable evidence reference: allowlisted kind,
  `artifact://`, `log://`, `record://`, or `trace://` ref, and SHA-256 digest
- `failureArtifact: null`
- an Ed25519 `attestation` over the full receipt payload, verified with the
  trusted probe-runner public key whose SHA-256 SPKI fingerprint is allowlisted
  in the canonical registry

The harness checks source assertions as well as the runtime receipt. A prior
`certified` registry label becomes `stale` when current evidence is missing or
does not match. Text labels cannot make the gate green.

The signing payload is the receipt object with `attestation` removed, serialized
as UTF-8 JSON with object keys recursively sorted and array order preserved. The
receipt producer signs those bytes with its Ed25519 private key. The verifier is
given only the corresponding trusted public key and rejects it unless its
fingerprint is in `trustedAttestationKeyFingerprints`. The accepted fingerprint
is recorded in the report. An empty allowlist is intentionally fail-closed.
`registryDigest` is SHA-256 over the same canonical serialization of
`registry.json`. The executable valid test fixture and signature generation live
in `scripts/summer-commissioning/commissioning.test.mjs`; production private key
material never belongs in this repository.

For the heartbeat probe specifically, a scheduler reporting a completed turn is
not evidence of liveness when the turn emitted no assistant message, tool
marker, or terminal receipt. The passing runtime receipt must immutably identify
a later scheduled turn with a non-empty no-op or remediation result and explicit
Eve scheduler ownership. A receipt generated by an observer for an empty turn,
or by the existing Codex heartbeat without Eve ownership, fails closed.

Run the source-plus-receipt gate with an exact production-like version:

```bash
node scripts/summer-commissioning/commissioning.mjs \
  --environment production-like \
  --environment-version <exact-deploy-or-runtime-version> \
  --attestation-public-key <trusted-probe-runner-public-key.pem> \
  --evidence-dir <durable-probe-receipt-directory> \
  --output-dir <commissioning-artifact-directory>
```

The evidence and output directories must be distinct, non-overlapping paths. The
output directory must be private and owned by the current user. Timestamps use
canonical UTC RFC 3339 form (`YYYY-MM-DDTHH:mm:ss[.sss]Z`). Production runs also
require a clean Git tree, record its exact `HEAD` as `sourceVersion`, and reject
runtime receipts from any other source version.

Exit `0` means every critical probe has current source and runtime evidence.
Exit `2` means Summer remains uncommissioned. Failure artifacts are written
under `<output-dir>/failures/`.

## Evaluation and report artifacts

The harness emits one `jovie.summer-commissioning.evaluation-receipt/v1` per
capability and one `jovie.summer-commissioning.report/v1`. These are derived
artifacts, not substitutes for the externally signed probe receipt. A passing
evaluation must have only valid, passing source assertions, a certified actual
state, the signed runtime receipt path and correlation ID, and no failure
artifact. A failed evaluation must contain the capability ID, audited
implementation/readiness states, at least one non-empty blocker, and owner plus
remediation references.

The report records the exact registry digest, accepted attestation-key
fingerprint (or `null` when no key was supplied), environment/version, canonical
UTC generation time, unique probe/capability IDs, and summary counts derived
from its receipts. Every evaluation receipt and the enclosing report carry the
same exact `sourceVersion`; validation rejects any receipt whose source version
differs from the report. `commissioned` is true only when no critical receipt
failed.

## Burn-in gate

Do not start the 1–2 hour burn-in while deterministic critical probes are red.
Once they are green, use a bounded workload that covers normal and ambiguous
requests, multi-turn continuity, authorized multi-source reads, durable work,
dispatch and terminal observation, forced failure, temporary dependency loss,
duplicate/malformed events, restart/reconnect, escalation, and desktop/iMessage
parity.

Every burn-in failure must become one of:

1. a repair plus a regression probe/test, or
2. a durable blocker with owner, evidence, and invalidation condition.

Burn-in cannot override a missing deterministic probe or certify a different
environment/version.

After the bounded burn-in passes, run the same workload and receipt contract
for 24 hours. Commissioning requires zero duplicate executions, zero lost
durable work, zero unrecovered dependency failures, and all terminal outcomes
represented in the receipt set. The 24-hour soak does not start while any
deterministic probe or bounded burn-in case is red.
