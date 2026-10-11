CREATE TABLE "agent_visibility_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"artist_id" text NOT NULL,
	"capability_hash" text NOT NULL,
	"preview" jsonb NOT NULL,
	"acquisition" jsonb NOT NULL,
	"expires_at" timestamp NOT NULL,
	"claimed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_visibility_drafts_expires_at_idx" ON "agent_visibility_drafts" USING btree ("expires_at");
--> statement-breakpoint
-- Draft capabilities are checked by the server. Ordinary database users have
-- no direct row access; reuse the existing server table-owner bridge.
ALTER TABLE "agent_visibility_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_visibility_drafts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "agent_visibility_drafts_owner_bridge"
  ON "agent_visibility_drafts"
  FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('agent_visibility_drafts'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('agent_visibility_drafts'));
