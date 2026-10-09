# Exact production recovery after Sentry transport uncertainty

Owner: Shipping-Control. Tracking: JOV-8065, related JOV-4965 and JOV-7195.
Status: reviewable design; not dispatch or marker-write authority.

## Incident binding

Controller run `37862155268`, attempt 1, uses workflow head
`83e557090adf435ef33bac1e225c2d1f2cbc17d0`. Its deployed artifact is
`d54ecb15ce7f3890e80fbf651da193e94753fecc` (PR21064), immutable deployment
`dpl_HymFkHKdUzH62SDteskhCc3hQdUh`. These identities must remain separate.

Sentry job `113607624208` failed at the project lookup with HTTP503 and curl
exit22. Baseline collection, soak, post-window collection and evaluation were
skipped. This is missing evidence, not an error spike or a passing observation.
Promotion passed; centralized rollback was skipped. Public/OAuth results do not
replace the missing Sentry, post-deploy auth, public smoke or Lighthouse evidence.

The existing `production-marker-recovery.yml` requires original Sentry SUCCESS.
This incident does not qualify. `production-controller-health.yml` also refuses
controller replay without a preserved marker because production may already
have been mutated. Do not replay, re-promote, change aliases or relax either guard.

## Source repair and review boundary

The ordinary Sentry action now bounds each read to three attempts, with a 5s
connection timeout, 15s attempt timeout, 1s retry delay and 40s retry scheduling
budget. An outer timeout bounds Retry-After, retries and body reads to 55s, with
at most one further second before forced termination. HTTP/auth failures,
malformed or concatenated JSON, missing project identity and exhausted transport
still fail. Each successful response must contain exactly one JSON document.
Queries use complete minute-aligned windows; empty, incomplete, stale, duplicate
or malformed minute buckets refuse numeric evidence. Complete zero-filled
buckets remain valid zero counts. The existing final resolver reports
`gate_status=error` for uncertainty. Thresholds, filters and rollback authority
stay unchanged. The existing reference window is named pre-observation because
the gate runs after promotion; it is not an original predeploy baseline.
No recovery is executed by this source repair.

A recovery implementation belongs to the existing Shipping-Control workflow
and production FIFO, not a second release controller. Before execution it needs
an owner-reviewed source PR, deterministic failure-path tests, normal required
CI and qualified source admission. Review must include marker-consumer policy,
not only the workflow that writes the artifact. A runbook or successful HTTP
read cannot grant recovery authority. Retain original SUCCESS requirements for
the existing mode; any proposed uncertainty mode must be explicit and fail closed
until its separate receipt contract and trusted producer are reviewed and landed.

## Proposed nonmutating verification sequence

1. **Bind the original attempt.** Read the exact completed Production Controller
   run and complete paginated jobs inventory from GitHub. Validate repository,
   main workflow path, run/attempt and verified forward lineage from the candidate
   to the workflow head. Require exact successful promotion, skipped centralized
   rollback and an identified transient Sentry read failure before evaluation.
   Unknown API results, truncated jobs, actual Sentry `failed` results or a run
   that executed rollback refuse admission. Never rewrite the original job result.
2. **Acquire the existing production FIFO and recheck ownership before admission.**
   Resolve both immutable deployment and canonical alias: exact deployment ID,
   READY, production target and full candidate SHA. Require all canonical routing
   observations to prove that identity. A newer deployment owning production, a
   mismatch or exhausted uncertainty stops recovery. Main advancing alone is
   not evidence of a different installed artifact. Preserve any already valid
   marker and stop neutrally rather than producing a duplicate.
3. **Collect genuine, named Sentry windows.** Resolve canonical numeric project ID
   with bounded reads and query only production error events. Record requested
   and observed UTC start/end, query/filter, full release SHA, counts and retrieval
   times. Validate response structure and complete time buckets; an empty or
   missing series cannot silently become a zero-count PASS. Query total-production
   and candidate-release counts for attribution. Each window is immutable once
   admitted; retry the same query, never slide its boundaries to seek a pass.
4. **Separate historical and fresh evidence.** The original predeploy baseline
   was never collected. A historical reconstruction requires a trusted original
   promotion timestamp, complete retained Sentry buckets for the requested range
   and an explicit `historical-reconstruction` label. Otherwise it is absent.
   If review authorizes a new observation, bind a new UTC start, a 30-minute
   reference ending there and a subsequent five-minute observation. Both are
   recovery-era observations, potentially after deployment. Name them
   `recovery-reference` and `recovery-observation`; never claim they reproduce
   the original predeploy baseline. Review must explicitly approve what this
   new evidence can certify. Apply the existing numeric thresholds and
   production/candidate filters without weakening them. Missing, malformed,
   incomplete, stale or contradictory data stays unknown and refuses a marker.
5. **Run every mandatory verification against the immutable candidate.** Reuse
   the source-owned exact-build auth, Better Auth/OAuth, public-profile alias,
   endpoint/public smoke, Done-invariant rescan and production Lighthouse
   implementations with their existing assertions, credentials and evidence
   guards. The incident's skipped auth/public/Lighthouse jobs need real passing
   evidence. Do not substitute skipped jobs, fixtures, public HTTP200 or the old
   production generation. Missing protected provisioning blocks recovery; no new
   accounts, credentials or grants. Preserve reports through existing secret and
   Playwright artifact guards. No source reinstall or redeployment is required.
6. **Bound time and recheck identity.** Proposed whole-recovery deadline: 55 minutes,
   subject to owner review against existing probe budgets. Bound every request,
   retry, sleep and subprocess within the remaining deadline. Recheck canonical
   ownership at Sentry observation boundaries and after the mandatory probes.
   Windows and reports carry exact identity and timestamps; stale evidence or
   changed ownership refuses admission. Budget exhaustion yields uncertainty,
   never a green marker and never rollback authority.
7. **Recheck at the marker boundary.** While still holding the FIFO, perform a
   fresh canonical alias/deployment/SHA/environment recheck and require every
   mandatory gate PASS for the same candidate and recovery attempt. Re-read the
   durable marker inventory and retain all original artifacts. A newly observed
   valid marker makes the action neutral; ambiguous or conflicting markers stop.
   Do not delete evidence to make admission pass. Refuse if a newer release owns
   production, even if every earlier probe passed.
8. **Write only the reviewed recovery receipt.** A proposed versioned receipt
   binds the original controller run/attempt, candidate SHA/deployment, recovery
   workflow source SHA/run/attempt, source-review receipt, original Sentry
   uncertainty, distinct Sentry windows and actual gate-report hashes/timestamps.
   Marker consumers must accept only the allowlisted trusted producer and this
   reviewed schema, and independently validate its full gate/window binding.
   Never mint the old verified-marker shape from arbitrary observation JSON or
   a manually supplied `passed` field. This design grants no current marker write.

## Required deterministic acceptance before execution

- HTTP503 followed by exact success retries within the budget; all-unknown,
  unauthorized, malformed and incomplete Sentry responses never pass.
- Authentic original uncertainty differs from an observed error spike and from
  an original successful Sentry gate. Wrong run/attempt, workflow, candidate,
  deployment, event or ancestry refuses recovery.
- New observation windows cannot be serialized or read as original predeploy
  evidence. Missing historical windows remain absent, not zero counts.
- Every required auth/public/Lighthouse/identity report is exact, fresh and PASS.
  Skipped, wrong-generation, stale or missing evidence refuses the receipt.
- Newer canonical ownership before admission, during observation or immediately
  before marker write stops recovery without mutation. All-unknown identity and
  changed durable marker inventory also stop safely.
- The trusted marker consumer rejects forged review/gate fields, unreviewed
  producers, wrong hashes, overlapping windows and duplicate receipt races.
- No dispatch, replay, promote, alias or rollback command is reachable from the
  verifier; evidence publication occurs only after the final identity boundary.

Ship now: bounded reads on ordinary future Sentry gates. Re-evaluate when the
owner-reviewed recovery contract and all deterministic checks are qualified.
Then: execute the nonmutating proof once only while this candidate owns production,
or stop and retain the incident evidence if a newer release owns it.
