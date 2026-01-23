# Database Performance Optimizations (Prelaunch)

This document summarizes the highest-impact database performance optimizations
based on a review of the schema (`apps/web/lib/db/schema/*`) and query hotspots
in the web app (notably analytics, audience, and admin dashboards).

## Scope and Evidence

High-frequency, data-heavy queries:
- Analytics rollups: `getAnalyticsData` and `getUserDashboardAnalytics`
  (`apps/web/lib/db/queries/analytics.ts`) scan `click_events` with time ranges,
  `is_bot` filters, and group-by aggregates.
- Audience and activity views:
  - `apps/web/app/app/dashboard/audience/audience-data.ts`
  - `apps/web/app/api/dashboard/activity/recent/route.ts`
  These sort and paginate `audience_members` and `notification_subscriptions`.
- Data retention cleanup:
  `apps/web/lib/analytics/data-retention.ts` deletes by `created_at` and
  `last_seen_at` without supporting indexes.
- Admin usage series:
  `apps/web/lib/admin/overview.ts` groups `click_events` by date.

## Top Optimizations (ordered by impact)

### 1) Partition high-volume event tables by time
**Targets:** `click_events`, `audience_members`, `notification_subscriptions`

**Why:** These are append-only tables with retention deletes and frequent
time-range scans. Partitioning eliminates large table scans and turns retention
into fast partition drops.

**Approach:**
- Range partition by month on `created_at` (or `last_seen_at` for
  `audience_members`).
- Add a default partition for safety.
- Use partition-level BRIN indexes for time scans.
- Update retention jobs to drop old partitions instead of row deletes.

**Expected impact:** 10x+ reduction in I/O for analytics and retention as data
grows.

### 2) Add analytics rollup tables or materialized views
**Targets:** analytics queries that repeatedly aggregate large event tables.

**Why:** `getAnalyticsData` and dashboard analytics rebuild the same aggregates
per request. Rollups reduce repeated scans and heavy group-by work.

**Suggested rollups:**
- `click_events_daily` keyed by `(creator_profile_id, day, link_type, is_bot)`
  with counts.
- `click_events_top_links` keyed by `(creator_profile_id, day, link_id)` with
  counts.
- `audience_members_daily` keyed by `(creator_profile_id, day)` for unique
  members and identified users.

**Update strategy:** hourly or near-real-time jobs; replace dashboard queries to
read rollups first, falling back to raw tables only when needed.

### 3) Add missing indexes aligned with query patterns
**Goal:** support the current query shapes without relying on full scans.

**Click events**
- `click_events.created_at` has no standalone index; retention and admin series
  delete/scan by time.
- Add a partial index or BRIN on `created_at`.
- Add a partial index for bot-filtered analytics:
  `(creator_profile_id, created_at DESC) WHERE is_bot = false`
- Consider an expression index for tip source analytics:
  `(creator_profile_id, link_type, (metadata->>'source'))`

**Audience members**
- Add `(creator_profile_id, last_seen_at DESC)` for activity feeds and default
  sort in `audience-data.ts`.
- Add `(creator_profile_id, updated_at DESC)` for dashboard analytics.
- Add a partial retention index:
  `WHERE type = 'anonymous' AND email IS NULL AND phone IS NULL`

**Notification subscriptions**
- Add `(creator_profile_id, created_at DESC)` for activity feed and paging.

**Schema hygiene**
- Make `click_events.is_bot` NOT NULL default `false` (backfill existing NULLs)
  to avoid `is_bot = false OR is_bot IS NULL` filters and improve index usage.

### 4) Normalize large JSONB fields on `audience_members`
**Targets:** `latest_actions`, `referrer_history`

**Why:** These JSONB arrays grow over time and force large row rewrites on every
update, increasing bloat and write latency.

**Approach:**
- Move to `audience_actions` and `audience_referrers` tables with
  `(audience_member_id, created_at)` indexes.
- Keep small summary fields (latest action, last referrer) on
  `audience_members` for list views.

### 5) Improve observability for query hotspots
**Why:** Prelaunch is the best time to capture baseline performance data.

**Actions:**
- Enable `pg_stat_statements` and log slow queries.
- Extend `lib/monitoring/database-performance.ts` metrics into a persistent
  store (or log pipeline) for top query ranking.
- Add an admin-only "EXPLAIN samples" endpoint for heavy queries.

## Quick Wins (1-2 days)
1. Add indexes for `audience_members` and `notification_subscriptions`.
2. Add BRIN or partial index on `click_events.created_at` for retention.
3. Make `click_events.is_bot` NOT NULL and add a partial index for
   non-bot analytics.

## Larger Schema Changes (prelaunch-friendly)
1. Partition event tables by month and update retention to drop partitions.
2. Introduce analytics rollup tables/materialized views.
3. Normalize audience JSONB histories into event tables.

## Open Questions
- Expected retention policy beyond 90 days?
- Projected scale (events per day, audience size)?
- Is near-real-time analytics required, or is hourly refresh acceptable?

