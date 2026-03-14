-- Performance index for tipping stats aggregation queries.
-- Covers the common pattern: SUM(amount_cents) WHERE creator_profile_id = ? AND created_at >= ?
-- The (creator_profile_id, status, created_at) ordering allows the planner to use an
-- index scan for both the dashboard tipping stats (time-bounded) and the earnings
-- API (status = 'completed') without falling back to a sequential scan on the tips table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tips_status_amount"
  ON "tips" ("creator_profile_id", "status", "created_at");
