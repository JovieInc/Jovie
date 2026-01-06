# Database Migrations (Neon + Drizzle)

This repo uses **Drizzle Kit** for schema migrations against **Neon Postgres**.

## Source of truth

- Schema: `apps/web/lib/db/schema.ts`
- Drizzle config: `apps/web/drizzle.config.ts`
- Migrations: `apps/web/drizzle/migrations/`
- Validation: `apps/web/scripts/validate-migrations.sh`
- Guard (append-only / one-migration policy): `apps/web/scripts/check-migrations.sh`

## Non-negotiables

- Do not create migration `.sql` files by hand.
- Do not edit or delete historical migrations that have landed on `main`.
- Prefer one migration per PR.

## Commands (canonical)

From `apps/web/package.json`:

- Generate: `pnpm --filter=@jovie/web run drizzle:generate`
- Migrate (local via Doppler): `pnpm --filter=@jovie/web run drizzle:migrate`
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

- Never use `CREATE INDEX CONCURRENTLY` (Drizzle runs migrations in a transaction).
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
