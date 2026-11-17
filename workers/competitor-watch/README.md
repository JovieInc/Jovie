# Competitor watch schema upgrades

New databases use `schema.sql`, which includes the current `excerpt` column.
`CREATE TABLE IF NOT EXISTS` does not upgrade a table created by an older version.

Before adopting this source on an existing database, inspect
`PRAGMA table_info(items)`. If `items` exists and has no `excerpt` column, apply
`legacy-migrations/0001_add_item_excerpt.sql` once through the existing authorized
database owner, before adopting the Worker. It preserves existing item metadata
and adds nullable input storage. Skip the legacy migration when the column is
already present, including databases initialized with the current `schema.sql`.
The legacy file is outside Wrangler's automatic migrations directory so it is
not accidentally reapplied to fresh databases.

Excerpts are temporary triage input. The existing triage pass clears inputs
older than its 45-day eligibility window, including failed or deferred items.
The router emits proposed actions; routing does not attest execution or adoption.
