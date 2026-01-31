-- Dashboard Performance Indexes
-- Addresses bottlenecks identified in docs/dashboard-performance-audit.md

-- Index for JSON metadata source filtering in tipping stats queries
-- Supports: clickEvents.metadata->>'source' = 'qr' | 'link'
CREATE INDEX IF NOT EXISTS "idx_click_events_metadata_source"
  ON "click_events" ((metadata->>'source'))
  WHERE creator_profile_id IS NOT NULL;--> statement-breakpoint

-- Index for geographic aggregation queries (city)
-- Supports: GROUP BY city in analytics
CREATE INDEX IF NOT EXISTS "idx_click_events_creator_city"
  ON "click_events" (creator_profile_id, city)
  WHERE city IS NOT NULL;--> statement-breakpoint

-- Index for geographic aggregation queries (country)
-- Supports: GROUP BY country in analytics
CREATE INDEX IF NOT EXISTS "idx_click_events_creator_country"
  ON "click_events" (creator_profile_id, country)
  WHERE country IS NOT NULL;--> statement-breakpoint

-- Index for referrer aggregation queries
-- Supports: GROUP BY referrer in analytics (top referrers)
CREATE INDEX IF NOT EXISTS "idx_click_events_creator_referrer"
  ON "click_events" (creator_profile_id, referrer)
  WHERE referrer IS NOT NULL;
