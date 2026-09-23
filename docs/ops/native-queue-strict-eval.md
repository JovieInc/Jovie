# Native merge-when-ready acceptance

The finishing agent requests GitHub Merge when ready once for the checked source
head. GitHub owns admission, required checks, synthetic merge groups and landing.
The existing read-only evaluator observes that lifecycle; it is not a shipping
gate, admission controller or remediation scheduler.

```sh
node scripts/native-queue-eval.mjs collect .context/native-queue-eval/acceptance.json <evaluator-source-sha>
node scripts/native-queue-eval.mjs evaluate .context/native-queue-eval/acceptance.json
pnpm ci:control:test
```

The optional evaluator SHA binds hosted CI, attempt, structural job and actual
selector/coverage output. Pending or missing validation remains BLOCKED. Successful
structural output persists in the job log beyond the artifact's short excerpt.

Collection is read-only. FAIL/BLOCKED exits nonzero; raw receipts and adjacent
`.result.json` dispositions persist. Preserve failed cohorts. Schema v2 requires a
new bundle: v1 controller evidence cannot certify native acceptance.

Required acceptance:

- At least three distinct complete inventory observations, with a fresh final
  observation and matching identity readback. Bind repository, exact source/base/
  synthetic revisions, policy and times. API errors and inventory drift block.
- Give every open PR a typed disposition. ELIGIBLE requires source checks, reviews
  and the existing source exclusions; native intent alone is not admission. Any
  observed eligible head without later positioned admission remains BLOCKED.
- Prove two distinct consecutive native merges. Bind each captured live queue
  entry to GitHub's authenticated REST pull receipt: PR number, source head,
  target repository/main, merged state, merged time and final commit. Record the
  authenticated native enqueuer and merger identities, accepting ordinary Users
  and Bots without an account-name allowlist.
- Require successful exact synthetic-head CI, all configured required checks
  completed before merge, actual selected product suites and artifact provenance,
  no policy bypass, and main reachability. The second synthetic base must equal
  the first merged commit. A label, CLEAN status or one merge is insufficient.
- Exercise missing/failed checks, conflicts, reviews, changed heads, mismatched
  receipts and false success in the existing CI control selector with its current
  per-file coverage floors. Report local tests, hosted evaluator CI, admission,
  merges and continued progress separately.

The live queue entry is admission authority. Historical timeline events can lag
behind a current entry; an old removal is not a veto on a new native admission.
The evaluator does not fetch Auto-Enroll source, drain budgets, controller runs or
queue timeline events. Three controller cycles, App-only ownership and the old
controller-derived admission deadline are retired requirements. GitHub's check
response timeout is not a guarantee about time waiting for queue capacity.

Entry changes across observed snapshots remain a failed continuity observation,
not permission to dequeue or block a PR. Missing proof remains BLOCKED; an
observed failed cohort must remain available alongside subsequent cohorts. These
snapshots do not prove absence of failures or removals between observations.
Collected JSON is evidence from the authenticated collector, not a cryptographic
attestation: isolated passing fixtures only prove evaluator behavior.

Ship now: extend the existing evaluator for native queue evidence. Re-evaluate
when current hosted evaluator coverage and two consecutive real native merges
are recorded. Then measure admission wait, check duration, merges/hour, rebuilds
and cancellations with the queue owner before any reversible settings trial.
Keep required checks, reviews, coverage and failure isolation intact.
