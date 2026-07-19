# CI/release incident prevention contract

This is the operator-facing index for the CI/release drain recorded in
[`../postmortems/2026-07-ci-release-drain.md`](../postmortems/2026-07-ci-release-drain.md).
It is deliberately paired with the machine-readable ledger at
[`../../.github/ci-harness/ci-release-incidents.json`](../../.github/ci-harness/ci-release-incidents.json).
The ledger, this index, the postmortem, and the canonical bootstrap must stay
in lockstep: `node scripts/ci-release-incident-contract.mjs` fails closed when
an incident is missing a regression, CI-stage owner, documentation, or
template/scaffold propagation.

## Ownership and inheritance boundary

`JovieInc/ci` is the organization’s canonical reusable CI repository. Its
shared actions, policy, and `templates/jovie-ci-release-prevention/` are the
inheritance mechanism; there is no organization-level `JovieInc/.github`
repository. A new project must use that bootstrap and pass
`node scripts/test-jovie-ci-template-scaffold.mjs`. Its manifest must name
`template`, `template_version`, `ledger`, `verifier`, and `scaffold_proof`.
Do not create a second template in an application repository.

An `@v1` ref is a moving major-version channel, **not** immutable provenance.
Third-party actions must be SHA-pinned. Central-template consumers advance only
through the controlled updater and its reviewed template-version mapping; the
fresh scaffold verifies the resolved mapping rather than treating a tag as an
attestation.

The table is an index, not a substitute for the verifier. “Regression” means
the deterministic command/path recorded for that same `id` in the JSON ledger;
the contract verifier checks that it exists and is runnable. “Inherited proof”
means `templates/jovie-ci-release-prevention/` and its manifest are present in
a freshly generated project and `node scripts/test-jovie-ci-template-scaffold.mjs`
succeeds.

| ID | Failure mode and invariant | Regression and CI-stage owner | Operator playbook | Inherited proof |
| --- | --- | --- | --- | --- |
| `ci-release/source-pr-queue-evidence` | A source PR requires only its source-PR contract, while exact combined-head unit evidence belongs to `merge_group`; required contexts run on every applicable PR or are emitted by one stable aggregate. | Ledger regression; **source PR / merge queue** owner. | Use [PR flow](../PR_FLOW.md#2-ci-is-risk-tiered-the-performance-core) to classify the event; never make a merge-group-only context source-required. | `JovieInc/ci` caller and clean-scaffold fixture retain the source/merge-group context split. |
| `ci-release/duplicate-ci-retry-loop` | One event has one authoritative CI path; duplicate source, merge-group, and main routes cannot recursively retry, and a required context is never path-skipped without a stable aggregate replacement. | Ledger regression; **trigger admission** owner. | Inspect event/ref/concurrency identity before retrying; preserve the required context while disabling the duplicate route. | Shared trigger/required-context policy is copied and asserted in scaffold. |
| `ci-release/legacy-merge-queue-label` | In native mode, `merge-queue` is never added, interpreted, or retained. Graphite behavior is available only through an explicit Graphite backend and cannot rewrite the native enrolled exact head. | Ledger regression; **queue enrollment** owner. | Reconcile authoritative native queue state and exact head. Do not apply, preserve, or read the legacy label; select Graphite only through its explicit backend configuration. | Queue backend policy and fixture reject label-driven native-mode fanout. |
| `ci-release/async-update-branch-bounds` | Async Update Branch accepts only the expected exact-head transition, structured results, and bounded subprocesses. | Ledger regression; **PR mutation** owner. | Reject changed heads and prose-only responses; inspect the bounded operation receipt before retrying. | Bootstrap carries the bounded mutation action and scaffold case. |
| `ci-release/superseded-run-capacity` | A superseded or stale run cannot consume fixed runner capacity after its replacement is authoritative. | Ledger regression; **concurrency/capacity** owner. | Cancel by verified run/ref identity; never cancel main/release work through PR-scoped policy. | Shared concurrency policy and fixture reserve current work only. |
| `ci-release/runner-heartbeat-routing` | Only fresh, structured, explicit self-hosted heartbeat evidence can route work to a cold runner; uncertainty falls back to hosted. | Ledger regression; **runner routing** owner. | Validate heartbeat age, runner labels, and payload; use hosted fallback when any field is stale or malformed. | `JovieInc/ci` runner-routing action and clean scaffold test assert fail-closed fallback. |
| `ci-release/runner-image-prerequisites` | A runnable image proves prerequisite marker, Node/pnpm service PATH, and Playwright payload before it serves work. | Ledger regression; **runner image** owner. | Quarantine an image missing any prerequisite; rebuild instead of patching a live runner. | Shared setup/image bootstrap and scaffold verifier require all three attestations. |
| `ci-release/runner-image-source-sha-provenance` | A runnable image carries an immutable source-SHA provenance attestation that matches the approved image source. | Ledger regression; **runner image provenance** owner. | Reject a missing or mismatched attestation and rebuild from the recorded source SHA; never infer provenance from a tag. | Shared image bootstrap and clean-scaffold verifier require source-SHA equality. |
| `ci-release/cache-artifact-fanout` | Self-hosted cache/artifact uploads are bounded; multi-gigabyte fanout is rejected before transfer. | Ledger regression; **artifact/cache** owner. | Inspect producer, size, and fanout receipts; retain only the named build artifact and move broad uploads off the self-hosted path. | Canonical action and fresh scaffold enforce upload budget. |
| `ci-release/runner-emergency-headroom` | Matrices cannot claim all runner capacity; protected emergency headroom remains schedulable. | Ledger regression; **capacity scheduler** owner. | Reduce matrix parallelism or pause optional work; do not consume the emergency reservation to clear routine backlog. | Shared matrix policy and scaffold test prove the reservation. |
| `ci-release/sentry-read-gate-scopes` | A credential that can upload Sentry artifacts is not accepted as proof it can execute the production read gate. | Ledger regression; **post-deploy error gate** owner. | Run the read-scope preflight against the configured project; stop promotion if upload and read capabilities differ. | Canonical Sentry gate and fixture require separate read proof. |
| `ci-release/doppler-sync-freshness` | Doppler-to-GitHub sync has an attributed capability and bounded freshness; unknown or stale sync is unhealthy. | Ledger regression; **secret distribution** owner. | Compare source version, sync receipt, and required capability; escalate stale or unattributed values without printing them. | Bootstrap renders the sync check and fixture exercises stale/capability failure. |
| `ci-release/vercel-immutable-probe` | Protected immutable Vercel URLs must be probed as public artifacts; an SSO redirect is failure, not availability. | Ledger regression; **post-deploy public probe** owner. | Record immutable URL, redirect chain, and response class; repair access configuration rather than accepting the protected endpoint. | Shared probe action and scaffold fixture reject SSO redirection. |
| `ci-release/seo-redirect-auth-html` | SEO probes reject cross-origin redirects and login HTML even if the final HTTP status is 200. | Ledger regression; **post-deploy SEO** owner. | Inspect final origin, content type, canonical response, and assertion output; do not use status code alone. | Inherited SEO action and fixture include cross-origin/login fixtures. |
| `ci-release/lighthouse-assertion-matches` | Lighthouse cannot pass when it audited a login page or matched zero expected assertions. | Ledger regression; **post-deploy Lighthouse** owner. | Verify immutable target, authenticated state only when explicit, and non-zero named assertion matches before accepting a run. | Shared Lighthouse contract and scaffold fixture reject zero-match reports. |
| `ci-release/bypass-secret-containment` | Bypass secrets never appear in redirects, subresources, URLs, logs, or cross-origin request headers. | Ledger regression; **probe security** owner. | Revoke exposure paths through configuration, scrub only approved ephemeral evidence, and rerun the redaction verifier; never paste a value into an issue. | Canonical probe action and fixture scan all five egress surfaces. |
| `ci-release/production-workflow-provenance` | A production rerun executes current approved workflow code, not an immutable old workflow definition. | Ledger regression; **production admission** owner. | Compare workflow source SHA and main SHA; dispatch a new authorized run rather than rerunning stale code. | Bootstrap’s production caller and scaffold require current-workflow provenance. |
| `ci-release/production-evidence-freshness` | Exact-main, provenance, and deploy markers must all match current production before evidence is accepted. | Ledger regression; **production verification** owner. | Reject stale markers; re-establish exact current-main proof through the single production mutation owner. | Shared verifier and fixture cover stale marker rejection. |
| `ci-release/controller-loop-bounds` | Controllers, watchdogs, labels, and remediation have an idempotency key, bounded retries, and a terminal stop. | Ledger regression; **control-plane remediation** owner. | Find the origin/action key, disable the triggering loop, and hand off after the cap; never restart a controller to mask a loop. | Canonical controller contract and scaffold fixture prove termination. |
| `ci-release/gbrain-readiness-diagnosis` | GBrain readiness distinguishes pool saturation from wedged or DNS-broken database sessions and reports actionable state. | Ledger regression; **coordination readiness** owner. | Check `/ready`, registrations, locks, and DB/DNS diagnosis; do not treat `/health` or a pool message as readiness. | Bootstrap health check and fixture cover wedged/DNS outcomes. |
| `ci-release/gbrain-pool-recovery` | Recovery distinguishes upstream reachability from local pool health and uses only bounded, safe restart/recovery steps. | Ledger regression; **GBrain recovery** owner. | Prove upstream reachability and local pool state first; run the bounded recovery test, then stop/escalate rather than repeatedly restarting a wedged service. | Bootstrap recovery helper and fixture cover saturated, wedged, and DNS-broken sessions. |
| `ci-release/coordination-query-bounds` | Coordination commands have explicit deadline and concurrency bounds for ownership/current-priority queries; exhaustion emits a fail-closed system-blocker message, never an unbounded sequential scan. | Ledger regression; **agent coordination** owner. | Use targeted query limits, deadline, and concurrency budget; record the claim only after successful preflight, otherwise report the prescribed system blocker. | Bootstrap preflight and clean-scaffold test enforce bounded arguments and fail-closed output. |
| `ci-release/admin-secret-log-redaction` | Admin credentials are redacted before any persistent service log write. | Ledger regression; **service logging** owner. | Stop the unsafe writer, rotate only under authorized incident handling, and validate log sinks with redaction fixtures. | Canonical logging bootstrap and scaffold fixture reject credential-bearing output. |
| `ci-release/gbrain-admin-secret-log-redaction` | A generated GBrain admin token never reaches persistent logs; a deterministic no-secret fixture proves redaction and the rotation runbook contains no token value. | Ledger regression; **GBrain administration** owner. | Treat possible exposure as an incident without copying the token: follow the rotation runbook, validate redaction with the no-secret fixture, and retain only redacted receipts. | GBrain bootstrap and scaffold fixture assert no token egress or fixture output exposure. |
| `ci-release/agent-task-identity-context-drift` | Every agent final answer asserts the assigned task identity and objective; a context-drift mismatch fails closed before completion is claimed. | Ledger regression; **agent delivery contract** owner. | Compare assignment identity/objective with the completion receipt; reopen or hand off on mismatch instead of reporting a neighboring task as done. | Bootstrap agent contract and scaffold fixture require the final-answer objective assertion. |
| `ci-release/secret-scan-synthetic-merge-base` | Secret Scan validates synthetic merge integrity: parent 1 is the effective base, parent 2 is the exact source, merge-tree equality holds, live-base TOCTOU is rejected, and the source need not contain the live base. | Ledger regression; **merge-group secret scan** owner. | Verify both parent SHAs and recomputed merge tree against the queued synthetic commit; reject changed live base or inferred source ancestry. | Shared merge-group scanner and clean-scaffold fixture cover parent ordering, equality, TOCTOU, and divergent source/live-base cases. |

## Change control

Adding or modifying an incident requires one atomic change across the JSON
ledger, this index, the postmortem, the `JovieInc/ci` bootstrap, and the
fresh-scaffold fixture. The CI contract is intentionally fail-closed: a prose
entry without an executable verifier or inherited proof is not a prevention.
