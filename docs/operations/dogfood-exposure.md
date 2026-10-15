# Effective dogfood exposure

JOV-7104 adds `jovie.dogfood-exposure/v1` to existing dogfood receipts.
The shared policy lives in
[`dogfood-exposure.ts`](../../packages/release-channel-contracts/dogfood-exposure.ts).
It evaluates evidence; existing producers retain targeting, enrollment, delivery
and orchestration authority.

An owner supplies `ExpectedExposure` through the existing mission context and
`DogfoodMissionSpec.expectedExposure`. The latter is authoritative at reliability
evaluation: a producer cannot certify its own replacement expectation. Scope
each mode separately. Legacy receipts remain readable for unrelated missions;
they cannot satisfy a mission with an exposure requirement.

The expectation binds product, mission, pseudonymous actor/account/session/device,
early-access or customer-control mode, exact build/source, backend/environment,
configuration generation/freshness, release owner and feature values/witness types.
Observations bind evaluated configuration, roster/session eligibility, safety
boundaries and actual rendered/capability evidence. Quarantine synthetic metrics
in both modes. Do not send raw identities or LYB health traits to analytics.

Use `runExposureMission(expected, adapter, mission)` at producer entry. Its
`subscribe` callback must observe login/account/session renewal, build/deploy,
configuration/cohort and revocation events. An event invalidates the run even
when state changes back. Recreate the binding and rerun; do not reuse evidence.
The guard checks entry and completion, rejects old snapshots against its clock,
and permits one existing authorized targeting/cache reconciliation. It never
repairs entitlements, consent, kill switches or missing implementation. Driver
errors still belong to the existing producer's failure path.

Jovie's server adapter resolves enrollment/revocation through the existing
`resolveDogfoodExposureForSession` authority and compares it with the account and
session actually observed by the client. `dogfoodSubjectRef` produces first-party
receipt references. The runtime observer must read real evaluated values and
visible, executed UI/capabilities; copying the expectation is fixture evidence.

Playwright, command and iOS report adapters retain execution observations in
`exposure`. Scoped runs with absent or invalid proof become `blocked` with
`BLOCKED_EXPOSURE`, `BLOCKED_BUILD` or `UNKNOWN_CONFIGURATION`. Required
reliability windows retain recent blocked runs. Optional missions do not block
unrelated certification or ordinary app use.

LYB's existing `lyb-native-certification.mjs` accepts `manifest.expectedExposure`
and `receipt.exposure`, with `startedAt`/`completedAt`. It independently binds the
installed source/build, requires rendered witnesses to match hashed captures,
and rejects fixture/bypass launch arguments. Simulator fixture certification
without an exposure requirement remains a separate evidence scope.

Ship now: shared evaluation, entry guard, roster adapter and receipt checks.
Re-evaluate when JOV-8401 supplies real entry/launch observations and installed
GUI/native replay; then commission both modes through JOV-8056/LYB-143/LYB-45.
JOV-7104 retains the broader event-driven coverage/capacity/Summer acceptance.
The deterministic tests prove rejection and reconciliation logic, not production
GUI exposure, physical-device installation or fleet operation.
