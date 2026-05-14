-- JOV-1842: Denormalize active-alerts state on audience_members so the audience
-- table can render a single bell + channel chips cell without inferring SMS
-- status from raw phone presence.

ALTER TABLE "audience_members" ADD COLUMN "has_active_alerts" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audience_members" ADD COLUMN "active_alert_channels" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "audience_members" ADD COLUMN "last_alert_confirmed_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audience_members_active_alerts" ON "audience_members" USING btree ("creator_profile_id","last_seen_at") WHERE has_active_alerts = true;--> statement-breakpoint

-- Backfill from notification_subscriptions: a subscription is "active" when it
-- has confirmed_at set and unsubscribed_at is null. We aggregate channels and
-- pick the most recent confirmed_at per (creator_profile_id, phone/email).
WITH active_alerts AS (
  SELECT
    am.id AS audience_member_id,
    ARRAY(
      SELECT DISTINCT ns.channel::text
      FROM notification_subscriptions ns
      WHERE ns.creator_profile_id = am.creator_profile_id
        AND ns.confirmed_at IS NOT NULL
        AND ns.unsubscribed_at IS NULL
        AND (
          (ns.phone IS NOT NULL AND ns.phone = am.phone)
          OR (ns.email IS NOT NULL AND lower(ns.email) = lower(am.email))
        )
      ORDER BY ns.channel::text
    ) AS channels,
    (
      SELECT max(ns.confirmed_at)
      FROM notification_subscriptions ns
      WHERE ns.creator_profile_id = am.creator_profile_id
        AND ns.confirmed_at IS NOT NULL
        AND ns.unsubscribed_at IS NULL
        AND (
          (ns.phone IS NOT NULL AND ns.phone = am.phone)
          OR (ns.email IS NOT NULL AND lower(ns.email) = lower(am.email))
        )
    ) AS last_confirmed_at
  FROM audience_members am
  WHERE am.phone IS NOT NULL OR am.email IS NOT NULL
)
UPDATE audience_members am
SET
  has_active_alerts = (cardinality(aa.channels) > 0),
  active_alert_channels = to_jsonb(aa.channels),
  last_alert_confirmed_at = aa.last_confirmed_at
FROM active_alerts aa
WHERE am.id = aa.audience_member_id
  AND cardinality(aa.channels) > 0;
