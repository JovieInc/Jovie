-- Migration: Add RLS policies to sensitive tables for security hardening
-- Tables: stripe_webhook_events, signed_link_access, ingestion_jobs

-- Enable RLS on stripe_webhook_events (contains payment data)
ALTER TABLE "public"."stripe_webhook_events" ENABLE ROW LEVEL SECURITY;

-- Policy: Only system/admin can read webhook events
-- Users can only see events that belong to them via user_clerk_id
CREATE POLICY "stripe_webhook_events_select_own" ON "public"."stripe_webhook_events"
  FOR SELECT
  USING (
    user_clerk_id = current_setting('app.clerk_user_id', true)::text
    OR current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );

-- Policy: Only system can insert webhook events (from Stripe webhook handler)
CREATE POLICY "stripe_webhook_events_insert_system" ON "public"."stripe_webhook_events"
  FOR INSERT
  WITH CHECK (
    current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );

-- Policy: Only system can update webhook events
CREATE POLICY "stripe_webhook_events_update_system" ON "public"."stripe_webhook_events"
  FOR UPDATE
  USING (
    current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );

-- Enable RLS on signed_link_access (contains signed tokens and IP addresses)
ALTER TABLE "public"."signed_link_access" ENABLE ROW LEVEL SECURITY;

-- Policy: System can manage all signed links (for creation/cleanup)
CREATE POLICY "signed_link_access_system_all" ON "public"."signed_link_access"
  FOR ALL
  USING (
    current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );

-- Enable RLS on ingestion_jobs (contains job payloads)
ALTER TABLE "public"."ingestion_jobs" ENABLE ROW LEVEL SECURITY;

-- Policy: Only system can manage ingestion jobs
CREATE POLICY "ingestion_jobs_system_all" ON "public"."ingestion_jobs"
  FOR ALL
  USING (
    current_setting('app.clerk_user_id', true) = 'system_ingestion'
  );

-- Grant usage to authenticated users (RLS will control row access)
GRANT SELECT ON "public"."stripe_webhook_events" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."signed_link_access" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."ingestion_jobs" TO authenticated;
