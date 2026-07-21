# Database

Single driver policy, immutable migrations, transaction discipline.

## Migration Files Are Immutable

- **NEVER** edit, delete, or rename migration SQL or snapshot files that already exist in `drizzle/migrations/` on the base branch.
- **ALLOW** generated append-only migration artifacts for a new migration: one new `*.sql`, one new `meta/*_snapshot.json`, and the corresponding append to `meta/_journal.json`.
- To fix a migration issue: create a NEW migration.

The `file-protection-check.sh` hook blocks edits to existing migration files.

`pnpm db:migrate` trusts the `drizzle.__drizzle_migrations` ledger and can report "up to date" on a drifted database; run `pnpm --filter @jovie/web run db:verify` (also wired into `scripts/setup.sh`) to compare the ledger against the journal and get repair steps.

For migration creation/run details: `docs/DB_MIGRATIONS.md`.

## Database Access (Single Driver Policy)

**ALWAYS use `import { db } from '@/lib/db'`** — this is the canonical database client.

| Correct | Wrong |
|---------|-------|
| `import { db } from '@/lib/db'` | `import { db } from '@/lib/db/client'` |
| Use `db.query.*` or `db.select()` | Direct SQL strings outside `lib/db` |
| `db.insert().values([...items])` | Loop with individual `db.insert()` calls |

The project uses `@neondatabase/serverless` with the **WebSocket driver** for stateful RLS connections. Application code creates a client-side `Pool` (max 20 per Vercel container) because WebSocket connections are stateful and need lifecycle management. The `DATABASE_URL` uses Neon's **direct** endpoint (not the `-pooler` endpoint).

Scripts and migrations use the HTTP driver for stateless one-off operations. The `lib/db/client.ts` is a legacy HTTP-based client — **do not use it**.

### Transaction Restrictions (Canonical Policy)

- **NEVER** introduce new direct `db.transaction()` usage in app code without explicit human approval.
- Existing transaction-based RLS/session helpers are legacy exceptions and must not be copied into new call-sites.
- If you need transaction-scoped session state, use an approved wrapper or escalate before adding new transaction logic.
- For atomicity, use Drizzle's batch operations: `db.insert().values([...items])`.
- If you need true ACID transactions, document the requirement and discuss alternatives.

### Forbidden Database Patterns

| Forbidden | Why | Alternative |
|-----------|-----|-------------|
| `db.transaction(async (tx) => ...)` | Requires explicit approval; use approved RLS wrappers | Sequential operations or batch insert |
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
