CREATE UNIQUE INDEX IF NOT EXISTS "idx_lead_funnel_events_lead_event_type_unique" ON "lead_funnel_events" USING btree ("lead_id","event_type");
