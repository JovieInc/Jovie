# Database connection budget

Status: source and isolated-Neon certification added by JOV-3066. Production
provider values are not inferred from source.

## Evidence ledger (2026-10-12)

| Value | Evidence | Result |
| --- | --- | --- |
| Application pool per process | `resolvePoolConfig` | 20 by default; tests use 1; `DB_POOL_MAX` may lower but never raise 20 |
| Idle/acquire timeout | `resolvePoolConfig` | 20,000 ms / 15,000 ms |
| Application transport policy | `.claude/rules/db.md` and isolated Neon CI URL selection | Neon WebSocket client through transaction-pooled endpoint |
| Actual production endpoint | Doppler read attempted from this lane | Unknown: no Doppler token was available |
| Server `max_connections` | Requires live SQL | Unknown in production; emitted by isolated-Neon certification |
| Application-role connection limit | Requires live SQL and role inspection | Unknown in production; emitted by isolated-Neon certification |
| Pooler backend limit | Requires Neon control-plane evidence | Unknown |
| Peak production runtime instances, including deploy overlap | Requires Vercel runtime evidence | Unknown |
| Peak production connections and acquisition latency | Requires runtime/provider evidence | Unknown; authorized DB health exposes pool peak/error counters and CI emits acquisition samples |
| Worker/test/direct-admin demand | Requires deployment and operator evidence | Unknown in production; CI tests use an isolated branch and a one-connection test pool |
| Accepted production headroom | Needs every preceding production value | Unknown; no numeric budget is accepted yet |

The pool is lazy: `max` is a client ceiling, not a number of connections opened
at startup. It is also process-local, not fleet-global. With transaction pooling,
the sum of Vercel client pools is not the number of Postgres backends; the
provider pooler backend limit is the relevant application-side backend ceiling.

## Budget admission

For a direct endpoint, the conservative backend ceiling is:

```text
pool max × (peak instances + overlapping-deploy instances)
+ direct workers + tests + administration reserve
```

For the transaction-pooled application endpoint, replace the first term with
the measured pooler backend limit. `evaluateFleetConnectionBudget` implements
this distinction and fails closed to `unknown`. Admission is green only when
every input is known and the result is no greater than the minimum effective
server and role limit. Interactive headroom must remain after bounded workers,
tests, and administration. Unknown is not green.

`DB_POOL_MAX` is the reversible per-process control. It accepts 1–20 and cannot
increase the audited source ceiling. Do not set it from the historical
unverified 100-connection claim. First collect the provider and runtime values,
then choose the largest value that leaves the accepted interactive reserve.

## Certification

The isolated-Neon database lane resolves `db_url_pooled` before running
`tests/integration/rls-identity-pin.test.ts`. When `DB_CERTIFICATION=true`, the
test fails unless that URL is a Neon pooler endpoint. It then records scoped
server/role limits, observed connections, three-client peak and acquisition
samples, and server headroom. These are ephemeral-branch facts, not production
claims.

The same real-driver suite proves:

- two concurrent handles retain distinct transaction-local RLS identities;
- both commit and rollback clear those identities;
- `SET LOCAL statement_timeout` is cleared by rollback and the handle remains
  usable after cancellation;
- idle clients are reaped, the pool reconnects, `end()` releases all clients,
  and a replacement pool can reconnect;
- the pinned WebSocket driver works through the transaction pooler without
  session-level identity, timeout, temporary-table, or advisory-lock reliance.

Migrations are a separate process and now convert a Neon pooler URL to its
direct host before taking session advisory locks. Read-only production
administration continues to use `scripts/db/prod-read.mjs`, which also selects
the direct host and wraps one statement in `BEGIN READ ONLY`. No migration-only
credential is exposed through the application environment schema. The actual
production role privileges remain unknown until inspected; do not claim that
source separation proves least privilege.

## Staged rollout and rollback

1. Land the telemetry, direct migration transport, and pooled certification
   without changing the production URL or default pool size.
2. Run the isolated database certification on the exact merge-group head.
3. Record production server/role/pooler limits plus Vercel instance/deploy
   overlap, worker/test/admin demand, peak connections, and acquisition latency.
4. Set a lower `DB_POOL_MAX` only if the complete calculation admits it. Observe
   authorized `/api/health/db` pool max/peak/wait/error data and connection-error
   telemetry through a deployment overlap and bounded worker burst.
5. Roll back instantly by removing the override (restores 20). Revert the URL
   independently only if same-handle RLS, local-timeout, commit/rollback, idle
   reap, and reconnect evidence remains green on the replacement transport.

**Ship now:** measurement/certification controls and direct session-sensitive
administration; no production pool-size or URL change.

**Re-evaluate when:** the unknown production values above have current evidence.

**Then:** accept a numeric backend budget, stage the override, and certify the
observed overlap/burst before treating JOV-3066 as production-commissioned.
