# Database Migrations (Neon + Drizzle)

This repo uses **Drizzle Kit** for schema migrations against **Neon Postgres**.

## Source of truth

- Schema: `apps/web/lib/db/schema.ts`
- Drizzle config: `apps/web/drizzle.config.ts`
- Migrations: `apps/web/drizzle/migrations/`
- Approved online-index artifacts: `apps/web/drizzle/online-indexes/`
- Validation: `apps/web/scripts/validate-migrations.sh`
- Guard (append-only / one-migration policy): `apps/web/scripts/check-migrations.sh`

## Non-negotiables

- Do not create migration `.sql` files by hand.
- Do not edit or delete historical migrations that have landed on `main`.
- Prefer one migration per PR.

## Commands (canonical)

Run these commands from the repo root:

- Generate: `pnpm --filter=@jovie/web run drizzle:generate`
- Migrate (local via Doppler): `pnpm run db:web:migrate`
- Apply approved online indexes: `ALLOW_ONLINE_INDEX_MIGRATIONS=true pnpm --filter=@jovie/web run drizzle:migrate:online-indexes:ci`
- Validate migration invariants: `pnpm --filter=@jovie/web run migration:validate`
- Enforce linear history policy: `pnpm --filter=@jovie/web run migration:guard`
- Check drift: `pnpm --filter=@jovie/web run drizzle:check`

The repo also provides a “ship” aggregator:

- `pnpm --filter=@jovie/web run ship`

## Editing newly generated migrations

Drizzle sometimes generates SQL that violates repo invariants. It is acceptable to adjust a **newly generated** migration in your PR so that:

- The migration is idempotent where required
- It passes `migration:validate`

Once a migration is merged to `main`, treat it as immutable.

## Required invariants (enforced by scripts)

- Never use `CREATE INDEX CONCURRENTLY` in a Drizzle migration. Hot-table
  exceptions use the separately reviewed online-index artifact runner.
- Use idempotent patterns for:
  - `CREATE INDEX` (`IF NOT EXISTS`)
  - `ALTER TYPE ... ADD VALUE` (`IF NOT EXISTS`)
  - `CREATE TYPE` via a `DO $$ ...` guard (Postgres does not support `CREATE TYPE IF NOT EXISTS`).

See:

- `docs/MIGRATION_CONCURRENTLY_RULE.md`

## Database-level protection (optional but supported)

There is a database event trigger script that can block direct DDL outside migrations:

- `apps/web/scripts/setup-migration-protection.sql`

It supports an emergency bypass:

- `SET app.allow_schema_changes = 'true';`

## Certified online-index path

Only use this path when the measured query plan and write workload in JOV-6273 justify avoiding a transactional index build. Add one append-only JSON artifact named `<YYYYMMDDHHMM>_<description>.json` with `id`, `approvalIssue`, `schema`, `index`, and the exact expected `pg_get_indexdef` output. The release runs it after ordinary Drizzle migrations on staging and production.

The runner does not trust `IF NOT EXISTS`: it holds the shared migration advisory lock, sets a 5-second `lock_timeout` and 10-minute `statement_timeout`, compares the catalog definition and `indisvalid`, repairs a matching invalid index with `DROP INDEX CONCURRENTLY` plus rebuild, and writes the artifact checksum to `drizzle.__jovie_online_index_migrations` only after post-build certification. This path is performance-only and rejects unique indexes because the application must not depend on the index for correctness.

Rollout requires the artifact PR, `ALLOW_ONLINE_INDEX_MIGRATIONS=true`, a staging pass, and old/new application compatibility (the application must not require the index for correctness). On failure, stop rollout and inspect `pg_index.indisvalid` plus `pg_get_indexdef`; rerunning is the recovery for a matching invalid build. A mismatched same-name index or changed applied checksum fails closed and must be resolved by a new reviewed artifact. Removing a valid index is a separate, explicitly approved `DROP INDEX CONCURRENTLY` operation.
