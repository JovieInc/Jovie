# Database Performance Guidance

This document records source-level index and query observations
based on the schema (`apps/web/lib/db/schema/*`) and query hotspots
in the web app (notably analytics, audience, and admin dashboards).

## Scope and Evidence

High-frequency, data-heavy queries:
- Analytics rollups: `getAnalyticsData` and `getUserDashboardAnalytics`
  (`apps/web/lib/db/queries/analytics.ts`) scan `click_events` with time ranges,
  `is_bot` filters, and group-by aggregates.
- Audience and activity views:
  - `apps/web/app/app/(shell)/dashboard/audience/audience-data.ts`
  - `apps/web/app/api/dashboard/activity/recent/route.ts`
  These sort and paginate `audience_members` and `notification_subscriptions`.
- Data retention cleanup:
  `apps/web/lib/analytics/data-retention.ts` deletes by `created_at` and
  `last_seen_at`; supporting indexes exist in the schema. Verify deployed plans.
- Admin usage series:
  `apps/web/lib/admin/overview.ts` groups `click_events` by date.

## Source inventory and measurement gates

### 1) Measure before partitioning

`audience_members` and `notification_subscriptions` are mutable entities, not
append-only event logs. The checked-in schema does not partition these tables.
No measured workload here supports partition drops or a claimed 10x I/O gain.
Use the current retention predicates and indexes; measure row counts, growth,
`EXPLAIN (ANALYZE, BUFFERS)`, write latency and deletion cost before proposing DDL.

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

### 3) Add missing indexes aligned with query patterns — MOSTLY DONE
**Goal:** support the current query shapes without relying on full scans.

> **Update (2026-02-09):** Most recommended indexes have been implemented in the
> Drizzle schema. The following status reflects verified schema definitions.

**Click events** (all addressed)
- ~~`click_events.created_at` has no standalone index~~ — **DONE**: `createdAtIdx` on `(created_at)`
- ~~Add a partial index for bot-filtered analytics~~ — **DONE**: `nonBotClicksIdx` partial index on `(creator_profile_id, created_at) WHERE is_bot = false OR is_bot IS NULL`
- ~~Expression index for tip source~~ — **DONE**: added via dashboard migration 0020
- Additional indexes: `creatorProfileIsBotCreatedAtIdx` on `(creator_profile_id, is_bot, created_at)`, `linkTypeAnalyticsIndex` on `(creator_profile_id, link_type, created_at)`

**Audience members** (all addressed)
- ~~Add `(creator_profile_id, last_seen_at DESC)`~~ — **DONE**: `creatorProfileLastSeenIdx`
- ~~Add `(creator_profile_id, updated_at DESC)`~~ — **DONE**: `creatorProfileUpdatedIdx`
- ~~Add a partial retention index~~ — **DONE**: `retentionIdx` on `(last_seen_at) WHERE type = 'anonymous' AND email IS NULL AND phone IS NULL`
- Additional indexes: `fingerprintLookupIdx`, `emailLookupIdx` (partial indexes for dashboard subquery optimization)

**Notification subscriptions** (addressed)
- ~~Add `(creator_profile_id, created_at DESC)`~~ — **DONE**: `creatorProfileCreatedAtIdx`

**Other tables verified (2026-02-09):**
- `creator_contacts`: `profileActiveIdx` compound on `(creator_profile_id, is_active, sort_order, created_at)`
- `social_accounts`: `profilePlatformStatusIdx` compound on `(creator_profile_id, platform, status)`

**Schema hygiene** (remaining)
- Make `click_events.is_bot` NOT NULL default `false` (backfill existing NULLs)
  to avoid `is_bot = false OR is_bot IS NULL` filters and improve index usage.

### 4) Preserve bounded audience projections

Live actions use `audience_actions`; visits also write `audience_referrers`.
`latest_actions` is capped at five by the event writer; visit referrer history
is capped at three. Dashboard details and analytics still read these JSONB fields.
Migration 0030 created event tables, without a historical parity backfill.
Do not remove projections or normalize bounded tags, UTM, properties or context
without query evidence. See [transition inventory](../db/legacy-model-transitions.md)
for gaps, rebuild/parity gates and the bounded missing-owner backfill.

### 5) Improve observability for query hotspots
**Why:** Prelaunch is the best time to capture baseline performance data.

**Actions:**
- Enable `pg_stat_statements` and log slow queries.
- Extend `lib/monitoring/database-performance.ts` metrics into a persistent
  store (or log pipeline) for top query ranking.
- Add an admin-only "EXPLAIN samples" endpoint for heavy queries.

## Decision rule

**Ship now:** retain supported indexes and compatibility projections.
**Re-evaluate when:** measured scans, retention cost or row growth breach an
observed budget. **Then:** benchmark the smallest query/index/rollup change on
representative data and verify old/new application compatibility before rollout.
The rollups above are proposals, not deployed tables or measured speedups.
