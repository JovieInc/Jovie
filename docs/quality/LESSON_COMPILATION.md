# Reviewed lesson compilation

`compileLesson(request, environment)` in
[`lesson-compilation.mjs`](../../scripts/lib/lesson-compilation.mjs) qualifies a
reviewed lesson against an existing executable target. It creates no registry,
scheduler, model route, or merge authority. JOV-8420 owns analysis and independent
challenge; JOV-8425 owns binding real defect/Symphony evidence to this interface.

The request names the reviewed analysis, candidate Git revision, target ID and
version (SHA-256 of the canonical JSON encoding of its source string), exact
tenant/product/cohort/work-class/surface predicate, saving with evidence reference, rollback
revision/reason, expiry and revalidation trigger, replay reference, outcome, and
the existing rolling-CI learning receipt. Outcomes are `compiled`,
`no-new-invariant`, `owner-issue`, or `held`. Prose has no executable target kind.

The environment belongs to the existing owners, never the learner's JSON:

- `loadAnalysis(ref)` verifies the persisted JOV-8420 result using its capability
  and independence controls. Return that result with intake-owned `owner`,
  `lessonClass`, bounded `affectedScope`, and independently evidenced
  `expectedSaving: { unit, amount, evidenceRef }`. The finding/challenge digest,
  exact route resolutions and policy versions are preserved and checked.
- `targets` is the caller's existing validator/fixture/routing-policy/method
  inventory, with `id`, `kind`, `path`, `owner`, `estimatedCostUsd`, `applies`,
  `replayVersion`, and executable `replay`. Optional `invariantId` must bind an
  adopted invariant's consumer. A skill method also names `method` and executable
  source. Cost comes from this inventory; ties prefer validator, fixture, routing
  policy, then skill method. The request must select the cheapest applicable one.
- `loadReplay(ref)` resolves independent, development-only evidence bound to
  analysis reference, origin/candidate revisions and artifact version. Its
  producer must differ from both analysis routes. At most 32 uniquely identified
  cases name role, Git revision/path, tenant/product/cohort, work class, surface and access.
- Each target's trusted `replay` runs its real validator/method with bounded,
  regular Git blobs (`originSource`, `candidateSource`, `fixtureSource`), case
  `context`, and computed `applies`. It returns observed `origin` and `candidate`
  outcomes and the detected/prevented `causeKey`. The compiler never imports or
  executes candidate source. Callers must enforce their adapter's execution
  budget; the Git reader bounds each read to five seconds and one MiB.
- `authorize(subject)` delegates the exact digest/head to the existing writer or
  certification owner, returning `ok`, `digest`, `head`, `actorId`, and
  `policyVersion`. Neither analysis route can authorize, including evaluation or
  authorization policy changes. This interface grants no promotion authority.
- `repoRoot` supplies source/binding validation. Optional `intake` credentials and
  transport go directly to existing `upsertLinearIssueByTitleFingerprint` when
  no supported target applies. Stable cause/scope fingerprints reuse one owner
  issue across retries. Failed intake remains held.

Replay must show the originating failure and prevention/detection of that same
cause with the candidate. Valid controls must pass, including applicable and
outside-predicate cases. Every claimed surface needs replay; broad lessons need
all independently scoped siblings. `canon/invariants.jsonl` and its bindings are
validated by the existing registry validator. Rolling-CI proof fields must agree
with the executed replay and scope. No-new-invariant still requires evidence and
independent authorization, with a reviewed no-change disposition and an explicit
decision against another guardrail.

Pass the returned receipt directly to `evaluateLearningPromotion`. Its process
local qualification binds the entire receipt and expires at the declared time.
Tampering, serialization and comment-marker round trips invalidate qualification;
the owner must rerun compilation from durable evidence before promotion in a new
process or after the named artifact/policy revalidation trigger. Existing receipt
formats without compilation retain their existing semantics. Required CI and
native promotion controls continue to apply.

Ship now: bounded qualification through existing owners. Re-evaluate when
JOV-8425 supplies real historical cases. Then: validate those cases through this
same adapter contract without adding another gate or evidence registry.
