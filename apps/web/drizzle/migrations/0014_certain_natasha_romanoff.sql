WITH ranked_events AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY "lead_id", "event_type"
      ORDER BY "occurred_at" ASC, "created_at" ASC, "id" ASC
    ) AS row_rank
  FROM "lead_funnel_events"
)
DELETE FROM "lead_funnel_events"
WHERE ctid IN (
  SELECT ctid
  FROM ranked_events
  WHERE row_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_lead_funnel_events_lead_event_type_unique"
ON "lead_funnel_events" USING btree ("lead_id", "event_type");
