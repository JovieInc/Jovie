# Shipping Lead terminal evidence — JOV-6586

Status: source preparation only. The local candidate projector and private-file
adapter are connected to the checked-in launcher and versioned provider bundle.
They are not installed on Gem or connected to consumer terminal reconciliation,
signing or capacity release. No runtime promotion, restart or commissioning is implied.

## Adopt-first decision (2026-09-25)

**Compose** the existing Codex app-server notification stream, existing
`codex-rotate` stdout capture, existing private Summer consumer journal, and
existing GitHub/native-queue/production validators. There is no new scheduler,
provider, account store, controller or worker execution path. The custom part is
binding one admitted Summer task to the actual native session and its Git result.

- The approved upstream workflow uses the maintained Codex 0.155.1 package and
  existing `codex-rotate`; it has no terminal-result publisher. The checked-in
  legacy Symphony router is not that workflow's launch path.
- [The exact upstream protocol](https://github.com/openai/codex/blob/rust-v0.155.1/codex-rs/app-server-protocol/schema/json/v2/TurnCompletedNotification.json)
  binds `threadId` and `turn.id/status`. Its completion statuses are not useful-work
  or deployment claims. Source is [Apache-2.0 licensed](https://github.com/openai/codex/blob/rust-v0.155.1/LICENSE).
- Existing fallback-result receipts are tied to a different executor/lease. Do
  not relabel them as native upstream evidence. Generic tracing products would
  add another ingestion/credential boundary and still would not establish this
  application-specific task/lease/merge relationship.
- Keep observation local and persist only the bounded projection: task/issue,
  session, runtime binding, timestamps and Git heads. Do not persist raw prompts,
  tool output, account identifiers or credentials. JSON projections are portable;
  removing the observation does not change the provider protocol.
- Re-evaluate when upstream provides a maintained complete task/result receipt,
  the installed protocol changes, or the existing launcher ceases to capture
  native stdout. Then adopt that receipt/transport and retain application checks.

## Required end-to-end boundary

1. The existing consumer verifies the signed task and records canonical admission
   intent before any mutation. A private, verified journal is the source of the
   capture binding; notification text cannot select tasks, commands or paths.
2. Observe native lifecycle notifications only, matching the verified workspace
   and service invocation. Record the clean starting Git head before worker work.
   Reject ambiguous threads, reused turns, missing starts and clock regression.
3. Preserve stdout byte-for-byte. Invalid, oversized, truncated or interrupted
   observations cannot publish proof. A next turn invalidates a previous turn's
   candidate. A successful unchanged/dirty Git workspace is not useful work.
4. Persist the candidate atomically under the existing private consumer state,
   bound to reviewed installed producer bytes. It must retain
   `executionTerminated: false`; stream EOF is not process-stop proof.
5. The existing consumer must match the canonical lease and positive official
   owner/session acceptance, prove the matching execution is stopped in the same
   runtime generation, and independently verify the exact candidate head's PR,
   required CI, native merge and production/runtime receipt. An attached PR, Done
   state, absent queue row or normal agent-turn completion alone never qualifies.
6. Persist verified terminal evidence in the existing journal before signing its
   outcome. Only acknowledged signed terminal consumption may release Summer's
   reservation. Uncertainty retains capacity and never redispatches canonical
   mutations. Exercise failure, duplicate, continuation and crash paths.

Remaining implementation and deployment work stays in JOV-6586; runtime
attestation remains JOV-6531. The pending approval for restoring the previously
approved workflow does not authorize installing or enabling this candidate.

## Local capture boundary

The native app-server branch of `codex-rotate` passes stdout through the adjacent
projector before its existing tee/classifier. Non-app-server work and old bundles
without the companion retain their original capture path. Provider generation v3
binds both Python modules in its existing hash manifest; old v1/v2 generations
remain readable and valid rollback candidates. No global launcher is replaced
by this source change. The approved stock workflow must receive an independently
qualified launcher binding before this can produce live evidence.

The adapter reads the existing consumer's private journal, matches the actual
service invocation and issue workspace, records Git directly, and rechecks the
task and producer bytes before immutable publication under
`state/summer-symphony-consumer/worker-evidence`. Signature authority remains with
the consumer; private ownership and a candidate digest do not replace signed
task validation. Missing admission simply preserves native stdout without proof.
No prompts, tool output, account identity or credentials enter the candidate.

The candidate still records `executionTerminated: false`. Consumer correlation
across native continuation turns, positive process-stop proof, exact commit/CI/
merge/production verification, durable terminal reconciliation and signed
reservation release remain part of JOV-6586.
