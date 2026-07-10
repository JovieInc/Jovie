-- Custom SQL migration file, put your code below! --
-- Memory graph data is tenant-owned and must not rely on application WHERE
-- clauses alone. Resolve both Better Auth app UUIDs and legacy Clerk IDs while
-- the identity migration is still in flight.
CREATE OR REPLACE FUNCTION current_memory_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM users AS u
  WHERE u.id::text = NULLIF(current_setting('app.clerk_user_id', true), '')
     OR u.clerk_id = NULLIF(current_setting('app.clerk_user_id', true), '')
  LIMIT 1;
$$;
--> statement-breakpoint

ALTER TABLE "memory_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memory_enrichment_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memory_entities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memory_entity_edges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memory_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memory_observations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memory_opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memory_source_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memory_asset_entity_mentions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memory_entity_aliases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memory_entity_identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memory_event_participants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "memory_assets_user_isolation" ON "memory_assets";
CREATE POLICY "memory_assets_user_isolation" ON "memory_assets"
  FOR ALL USING ("user_id" = current_memory_user_id())
  WITH CHECK ("user_id" = current_memory_user_id());
DROP POLICY IF EXISTS "memory_enrichment_jobs_user_isolation" ON "memory_enrichment_jobs";
CREATE POLICY "memory_enrichment_jobs_user_isolation" ON "memory_enrichment_jobs"
  FOR ALL USING ("user_id" = current_memory_user_id())
  WITH CHECK ("user_id" = current_memory_user_id());
DROP POLICY IF EXISTS "memory_entities_user_isolation" ON "memory_entities";
CREATE POLICY "memory_entities_user_isolation" ON "memory_entities"
  FOR ALL USING ("user_id" = current_memory_user_id())
  WITH CHECK ("user_id" = current_memory_user_id());
DROP POLICY IF EXISTS "memory_entity_edges_user_isolation" ON "memory_entity_edges";
CREATE POLICY "memory_entity_edges_user_isolation" ON "memory_entity_edges"
  FOR ALL USING ("user_id" = current_memory_user_id())
  WITH CHECK ("user_id" = current_memory_user_id());
DROP POLICY IF EXISTS "memory_events_user_isolation" ON "memory_events";
CREATE POLICY "memory_events_user_isolation" ON "memory_events"
  FOR ALL USING ("user_id" = current_memory_user_id())
  WITH CHECK ("user_id" = current_memory_user_id());
DROP POLICY IF EXISTS "memory_observations_user_isolation" ON "memory_observations";
CREATE POLICY "memory_observations_user_isolation" ON "memory_observations"
  FOR ALL USING ("user_id" = current_memory_user_id())
  WITH CHECK ("user_id" = current_memory_user_id());
DROP POLICY IF EXISTS "memory_opportunities_user_isolation" ON "memory_opportunities";
CREATE POLICY "memory_opportunities_user_isolation" ON "memory_opportunities"
  FOR ALL USING ("user_id" = current_memory_user_id())
  WITH CHECK ("user_id" = current_memory_user_id());
DROP POLICY IF EXISTS "memory_source_records_user_isolation" ON "memory_source_records";
CREATE POLICY "memory_source_records_user_isolation" ON "memory_source_records"
  FOR ALL USING ("user_id" = current_memory_user_id())
  WITH CHECK ("user_id" = current_memory_user_id());
--> statement-breakpoint

DROP POLICY IF EXISTS "memory_asset_entity_mentions_user_isolation" ON "memory_asset_entity_mentions";
CREATE POLICY "memory_asset_entity_mentions_user_isolation" ON "memory_asset_entity_mentions"
  FOR ALL USING (
    EXISTS (SELECT 1 FROM memory_assets a WHERE a.id = asset_id AND a.user_id = current_memory_user_id())
    OR EXISTS (SELECT 1 FROM memory_entities e WHERE e.id = entity_id AND e.user_id = current_memory_user_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM memory_assets a WHERE a.id = asset_id AND a.user_id = current_memory_user_id())
    AND EXISTS (SELECT 1 FROM memory_entities e WHERE e.id = entity_id AND e.user_id = current_memory_user_id())
  );
DROP POLICY IF EXISTS "memory_entity_aliases_user_isolation" ON "memory_entity_aliases";
CREATE POLICY "memory_entity_aliases_user_isolation" ON "memory_entity_aliases"
  FOR ALL USING (EXISTS (SELECT 1 FROM memory_entities e WHERE e.id = entity_id AND e.user_id = current_memory_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM memory_entities e WHERE e.id = entity_id AND e.user_id = current_memory_user_id()));
DROP POLICY IF EXISTS "memory_entity_identities_user_isolation" ON "memory_entity_identities";
CREATE POLICY "memory_entity_identities_user_isolation" ON "memory_entity_identities"
  FOR ALL USING (EXISTS (SELECT 1 FROM memory_entities e WHERE e.id = entity_id AND e.user_id = current_memory_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM memory_entities e WHERE e.id = entity_id AND e.user_id = current_memory_user_id()));
DROP POLICY IF EXISTS "memory_event_participants_user_isolation" ON "memory_event_participants";
CREATE POLICY "memory_event_participants_user_isolation" ON "memory_event_participants"
  FOR ALL USING (
    EXISTS (SELECT 1 FROM memory_events e WHERE e.id = event_id AND e.user_id = current_memory_user_id())
    OR EXISTS (SELECT 1 FROM memory_entities e WHERE e.id = entity_id AND e.user_id = current_memory_user_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM memory_events e WHERE e.id = event_id AND e.user_id = current_memory_user_id())
    AND EXISTS (SELECT 1 FROM memory_entities e WHERE e.id = entity_id AND e.user_id = current_memory_user_id())
  );
