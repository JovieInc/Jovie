# Analytics Indexes

These indexes support the dashboards in `lib/db/queries/analytics.ts`, where every query filters by `creatorProfileId` with a time-window predicate.

## Added indexes
- `idx_click_events_creator_profile_id_created_at` and `idx_click_events_creator_profile_id_created_at_link_type`
  - Speed up range scans on `click_events` for per-creator analytics (totals, referrers, cities, countries, top links) that filter by `created_at` and sometimes `link_type`.
- `idx_audience_members_creator_last_seen_at` and `idx_audience_members_creator_updated_at`
  - Used by unique visitor counts that filter `audience_members` by `last_seen_at` or `updated_at` alongside `creator_profile_id`.
- `idx_notification_subscriptions_creator_profile_id_created_at`
  - Helps subscriber counts filtered by `creator_profile_id` and `created_at`.

## EXPLAIN
No live dataset was available in this environment to capture before/after `EXPLAIN` output. The indexes target the `creatorProfileId + createdAt/lastSeenAt/updatedAt` filters used across the analytics queries to avoid sequential scans as event volume grows.
