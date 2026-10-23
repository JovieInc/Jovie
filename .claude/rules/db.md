---
paths: ["**/db/**", "**/drizzle/**", "**/migrations/**", "**/queries/**", ".squawk.toml"]
---

# Database

Single driver policy, immutable migrations, transaction discipline.

## Migration Files Are Immutable

- **NEVER** edit, delete, or rename migration SQL or snapshot files that already exist in `drizzle/migrations/` on the base branch.
- **ALLOW** generated append-only migration artifacts for a new migration: one new `*.sql`, one new `meta/*_snapshot.json`, and the corresponding append to `meta/_journal.json`.
- To fix a migration issue: create a NEW migration.

The `file-protection-check.sh` hook blocks edits to existing migration files.

## Squawk Lints Added or Changed Migration SQL

Source Validation's Migration Guard job runs Squawk 2.70.0 on `pull_request`. The binary is pinned by version and sha256 in `scripts/db/lint-changed-migrations.mjs`. The config is `.squawk.toml`.

- Squawk receives only `apps/web/drizzle/migrations/**/*.sql` files the pull request adds or changes. Unchanged migrations are not linted. Snapshots and `meta/` are not SQL migrations.
- With `assume_in_transaction` (Drizzle wraps each file), an index on a table created in that same file is allowed. `CREATE INDEX` on a table that already exists fails `require-concurrent-index-creation`. Put that index in `drizzle/online-indexes/`. `CREATE INDEX CONCURRENTLY` inside a Drizzle file remains forbidden by `validate-migrations.sh`.
- Adding `NOT NULL` without a default and changing a column type fail. Excluded rules are style or session-timeout rules that Drizzle SQL does not own. Each exclusion in `.squawk.toml` has a reason. Do not exclude a lock-safety rule to land a migration.

`pnpm db:migrate` trusts the `drizzle.__drizzle_migrations` ledger and can report "up to date" on a drifted database; run `pnpm --filter @jovie/web run db:verify` (also wired into `scripts/setup.sh`) to compare the ledger against the journal and get repair steps.

For migration creation/run details: `docs/DB_MIGRATIONS.md`.

## Database Access (Single Driver Policy)

**ALWAYS use `import { db } from '@/lib/db'`** — this is the canonical database client.

| Correct | Wrong |
|---------|-------|
| `import { db } from '@/lib/db'` | `import { db } from '@/lib/db/client'` |
| Use `db.query.*` or `db.select()` | Direct SQL strings outside `lib/db` |
| `db.insert().values([...items])` | Loop with individual `db.insert()` calls |

The project uses `@neondatabase/serverless` with the **WebSocket driver** for stateful RLS connections. Application code creates a client-side `Pool` (max 20 per Vercel container) because WebSocket connections are stateful and need lifecycle management. The production `DATABASE_URL` is Neon's `-pooler` endpoint (PgBouncer, transaction mode).

Scripts and migrations use the HTTP driver for stateless one-off operations. The `lib/db/client.ts` is a legacy HTTP-based client — **do not use it**.

### Production SQL from agents and scripts

Server connections behind the pooler are shared, so a session-level `SET` outlives your
query and applies to the next app transaction on that connection. On 2026-09-27 an ad-hoc
`psql "$DATABASE_URL" -c "set default_transaction_read_only=on; ..."` made production
writes fail for about 1h40m, including LYB OAuth token exchange.

- Read production with `scripts/db/prod-read.mjs "select ..."`. It uses the direct endpoint
  and `BEGIN READ ONLY ... COMMIT`.
- Otherwise, use only transaction-scoped state: `BEGIN READ ONLY`, `SET LOCAL`,
  `SET TRANSACTION`, or `set_config(..., true)`. Never use plain `SET`, `SET SESSION`,
  `set_config(..., false)`, or `ALTER ROLE/DATABASE ... SET`.
- `.claude/hooks/prod-db-session-guard.mjs` blocks these forms in agent Bash commands.

### Business Atomicity (Canonical Policy)

- A business invariant spanning multiple statements must commit entirely or roll
  back entirely. Sequential writes and one batch insert do not make the surrounding
  operation atomic. Prefer a conditional statement or a constraint when sufficient.
- Use `runAtomicDbOperation` from `@/lib/db/legacy-transaction`; this evolves the
  audited rollback boundary. Direct app-level `db.transaction()` remains forbidden.
- Resolve authentication/authorization first. Pass the trusted application user ID
  as `actorId`; privileged `system: true` is only for already-authorized system work.
  The wrapper pins local RLS and statement/lock/idle deadlines to `tx`.
- Every protected helper must use the supplied `tx`. Global client access fails
  closed inside certified callbacks, including indirect helpers and pooled queries
  constructed before entry. Never pass a global client as a protected handle.
- Callbacks contain awaited database work only: no authentication, external HTTP,
  models, images, notification delivery, detached tasks, or nested retry loops.
- Select `retry: 'never'` or `'serialization'` explicitly. Only SQLSTATE 40001/40P01
  replay the whole operation, within the original deadline. Transport errors and
  uncertain COMMIT results require durable-state reconciliation, never blind replay.
  JOV-3775 owns pool acquisition/cancellation budgets; a JS timeout is not SQL cancellation.
- Commit consequential state and existing durable intent/outbox together. Deliver
  after commit using stable deduplication keys and provider idempotency/reconciliation;
  do not promise exactly-once external delivery.
- Certify every write boundary with failure injection on real Postgres. Preserve
  ordinary single-statement and read-only paths. See [certification](../../docs/DB_ATOMIC_OPERATIONS.md).

```typescript
// actorId comes from authenticated server context; inputs are prepared already.
await runAtomicDbOperation(async tx => {
  await updateAccess(tx, input);
  await enqueueExistingDurableIntent(tx, input);
}, { actorId, retry: 'serialization' });
// External delivery runs in the existing worker after commit.
```

### Forbidden Database Patterns

| Forbidden | Why | Alternative |
|-----------|-----|-------------|
| Direct `db.transaction(async (tx) => ...)` | Bypasses certified atomicity contract | `runAtomicDbOperation` |
| `import { Pool } from 'pg'` | Manual pooling conflicts with Neon | `import { db } from '@/lib/db'` |
| `import pg from 'pg'` | Direct postgres driver | `import { db } from '@/lib/db'` |
| `new Pool()` or `pool.connect()` | Manual connection management | `import { db } from '@/lib/db'` |
| Loop with individual `db.insert()` | O(N) database operations | `db.insert().values([...items])` batch |

The `db-patterns-check.sh` post-write hook flags `db.transaction()`, `pg`/`pg-pool` imports, `new Pool()`, and `@/lib/db/client` imports.

## Schema Map

Reference: `docs/SCHEMA_MAP.md` answers "Which schema file defines this table? What are the key relationships?".

## Related Hard Invariants

- **Persistence-Critical Success Must Fail Closed** → `.claude/rules/security.md`
- **Public/Webhook Coordination Must Be Durable** → `.claude/rules/security.md`
