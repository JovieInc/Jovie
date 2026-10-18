# Artist identity shadow evaluation (JOV-6425)

Ship now: bounded offline replay and an explicitly admitted shadow function in
`scripts/evals/artist-identity.mjs`. No application, database, resolver, cron,
claim or account-access caller invokes it. EVENT: model advice grants no identity
or ownership authority. Existing confirmation, authorization and rollback remain
required for any separately admitted applied match.

At the reviewed base `cfd16deb81b349224eb9774c771b4b54ec43234e`, matching
aggregates provider ISRC results, enriches available artist profiles, filters
by minimum ISRC count, and ranks heuristic confidence. Auto-confirm requires
confidence >= 0.8 and >= 3 ISRC matches. Refinement retains both requirements;
discovery preserves confirmed, rejected and manual decisions atomically.
Those production paths are unchanged.

The evaluator maps opaque labels back only to the frozen retrieved IDs. Empty
candidates yield no match without I/O; a single candidate still needs assessment.
Exact-ID evidence and confirmed user corrections bypass Jev. Rejections,
conflicts, non-primary credits and absence of corroborating primary ISRC/UPC
evidence force review regardless of model concentration. No inference retrieves
new profiles. Unknown labels and malformed distributions are invalid.

Only names, aliases and bounded recording credits/identifiers reach Jev as
untrusted JSON. Bios, contacts, follower counts, genres, URLs, heuristic scores
and local correction references are excluded. Provenance, provider, tenant and
policy digests bind the local snapshot and request. Trusted owner callbacks
re-read that snapshot and prerequisite evidence before and after I/O. The
existing Gateway seam owns data/funding admission, deadlines, cancellation and
zero-retry transport. Outage, expiry or stale output leaves only review advice.

`artist-identity-corpus.mjs` supplies 42 synthetic contract fixtures, separated by
artist identity between tuning and holdout, plus the existing resolver's negative
Tim White / Beatport 406847 reference. This is historical repo evidence, not fresh
provider retrieval. Provenance dates are replay dates. Prospect discoveries from
JOV-7415 enter through the same versioned, labeled input contract with their
actual provenance; synthetic fixtures cannot establish live quality.
Each example supplies `asOf`, its evidence replay timestamp, and an identity
group that must stay wholly within one split.

`artist-identity-report.mjs` calibrates concentration solely on tuning labels,
then reports held-out precision, known false suggestions, unresolved suggestions,
per-slice risk, abstention and review workload. Zero-error samples include a
one-sided 95% binomial upper bound. Missing observations count as review. Recorded
Gateway observations and fixtures remain identified separately; unknown latency
or cost stays null. Total cost requires retained-flow and reasoning costs as well
as evaluator billing; no list-price estimate substitutes for billing.

Current disposition: **blocked**. JOV-6420 is administratively Done, but its
[pilot report](jev-release-task-classification.md#current-disposition) remains
inconclusive with zero executed comparisons. JOV-6425 requires positive pilot
evidence and admission for this workload. No paid call was made here. GBrain was
unreachable (`gbrain-unavailable`). Re-evaluate when JOV-6420 supplies that evidence;
then replay admitted prospect observations. A positive prerequisite still yields
an inconclusive artist receipt pending quality/economic proof and separately
admitted canary controls. This tooling never promotes itself.

Generate exact-version blocked evidence without inference:

```sh
pnpm exec node scripts/evals/artist-identity-report.mjs --source-sha "$(git rev-parse HEAD)" --out /tmp/artist-identity.json
pnpm exec node scripts/evals/artist-identity.test.mjs
```

Optional `--corpus`, `--observations` and `--evidence` accept JSON files. Each
observation carries `id`, `basis` (`fixture` or `gateway`), the version-bound
`receipt`, `endToEndLatencyMs`, `retainedCostUsd`, and `reasoningCostUsd`. The CLI
performs no external I/O and does not authorize execution or a canary.
