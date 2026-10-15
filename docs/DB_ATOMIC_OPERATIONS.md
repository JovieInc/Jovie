# Short atomic database operations — JOV-6269

Tracking: DB-AUDIT-20260913/04. `runAtomicDbOperation` evolves the audited rollback boundary; JOV-6267's pinned identity helpers remain intact.

| Certified path | All-or-nothing invariant | Injected boundaries |
| --- | --- | --- |
| Admin waitlist approval | Old profile unclaimed, target claimed, entry invited, audit inserted, user approved, token persisted, deduplicated invite job queued | After each of 7 writes |
| Admin waitlist revocation | Profile unclaimed, entry/token revoked, audit inserted, user access removed | After each of 4 writes |

[Real Postgres proof](../apps/web/tests/integration/atomic-operation.test.ts) calls production helpers against temporary fixture tables, compares full snapshots at every failure boundary, then verifies success and repeated-request reconciliation. It proves rollback, local identity/timeout cleanup and SQL cancellation; it does not certify production RLS roles, schema constraints, or the Neon transport.

Run against a disposable loopback Postgres database named `jov6269_atomic`:
`ATOMIC_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55469/jov6269_atomic pnpm --filter @jovie/web exec vitest run --config=vitest.config.ci.mts tests/integration/atomic-operation.test.ts`.

Authentication/admin authorization precedes entry; cache invalidation follows commit. The existing ingestion job commits with the invite token, has a unique dedup key, and invite delivery uses a token-derived provider idempotency key in [email-jobs.ts](../apps/web/lib/waitlist/email-jobs.ts). Reconcile entry/token/job state after an ambiguous commit; delivery is not exactly once.

Retries use the existing 40001/40P01 classifier, at most three whole attempts under one deadline. Local statement/lock/idle limits bound SQL; the pre-commit deadline check rolls back late callbacks. Acquisition and cancellation/cleanup budgets remain JOV-3775's boundary, not a promise that a rejected JS timer stops SQL.

Ship now: certify these two workflows with the existing API timeout cap. Re-evaluate when another multi-statement invariant changes or measured timeout failures appear; then require write-boundary proof or revise measured workload budgets under JOV-3775.

Rollback: revert this application commit; no migration or credential change. Merge, deployed build and observed runtime proof belong on JOV-6269/its PR after independent qualification; a draft and local tests are not deployment evidence.
