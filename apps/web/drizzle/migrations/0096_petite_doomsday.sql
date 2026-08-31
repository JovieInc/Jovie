DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'artist_rule_event_type') THEN
		CREATE TYPE "public"."artist_rule_event_type" AS ENUM('suggested', 'activated', 'exception_granted', 'superseded', 'revoked', 'evaluated');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'artist_rule_scope') THEN
		CREATE TYPE "public"."artist_rule_scope" AS ENUM('artist', 'channel', 'release', 'item_kind', 'item');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'artist_rule_status') THEN
		CREATE TYPE "public"."artist_rule_status" AS ENUM('suggested', 'active', 'superseded', 'revoked');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'artist_rule_strength') THEN
		CREATE TYPE "public"."artist_rule_strength" AS ENUM('hard_constraint', 'preference');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'library_entity_type') THEN
		CREATE TYPE "public"."library_entity_type" AS ENUM('creator_document', 'release', 'recording', 'youtube_video', 'social_content', 'merch_product', 'artist', 'brand', 'source_link', 'offer', 'provider_placement');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'library_relationship_kind') THEN
		CREATE TYPE "public"."library_relationship_kind" AS ENUM('release_context', 'collaborator_credit', 'features_merch', 'mentions_brand', 'uses_tracked_link', 'promotes_offer', 'youtube_product_placement');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'library_relationship_status') THEN
		CREATE TYPE "public"."library_relationship_status" AS ENUM('suggested', 'active', 'rejected', 'removed');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'optimization_experiment_status') THEN
		CREATE TYPE "public"."optimization_experiment_status" AS ENUM('draft', 'running', 'paused', 'decided', 'cancelled');
	END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "artist_rule_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"event_type" "artist_rule_event_type" NOT NULL,
	"actor_user_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"category" text NOT NULL,
	"rule_key" text NOT NULL,
	"instruction" text NOT NULL,
	"strength" "artist_rule_strength" NOT NULL,
	"scope" "artist_rule_scope" DEFAULT 'artist' NOT NULL,
	"scope_value" text,
	"allow_override" boolean DEFAULT false NOT NULL,
	"status" "artist_rule_status" DEFAULT 'suggested' NOT NULL,
	"provenance" jsonb NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"effective_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"supersedes_rule_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"normalized_name" text NOT NULL,
	"display_name" text NOT NULL,
	"website_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"brand_id" uuid,
	"offer_type" text NOT NULL,
	"name" text NOT NULL,
	"destination_url" text NOT NULL,
	"source_link_id" uuid,
	"disclosure_text" text,
	"terms" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"effective_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"kind" "library_relationship_kind" NOT NULL,
	"subject_type" "library_entity_type" NOT NULL,
	"subject_id" text NOT NULL,
	"object_type" "library_entity_type" NOT NULL,
	"object_id" text NOT NULL,
	"status" "library_relationship_status" DEFAULT 'suggested' NOT NULL,
	"confidence" numeric(5, 4),
	"evidence" jsonb NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"effective_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimization_experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"subject_type" "library_entity_type" NOT NULL,
	"subject_id" text NOT NULL,
	"objective" text NOT NULL,
	"guardrails" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"variants" jsonb NOT NULL,
	"status" "optimization_experiment_status" DEFAULT 'draft' NOT NULL,
	"winner_variant_key" text,
	"decision_evidence" jsonb,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artist_rule_events" ADD CONSTRAINT "artist_rule_events_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_rule_events" ADD CONSTRAINT "artist_rule_events_rule_id_artist_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."artist_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_rule_events" ADD CONSTRAINT "artist_rule_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_rules" ADD CONSTRAINT "artist_rules_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_rules" ADD CONSTRAINT "artist_rules_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_rules" ADD CONSTRAINT "artist_rules_supersedes_rule_id_artist_rules_id_fk" FOREIGN KEY ("supersedes_rule_id") REFERENCES "public"."artist_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_brands" ADD CONSTRAINT "creator_brands_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_offers" ADD CONSTRAINT "creator_offers_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_offers" ADD CONSTRAINT "creator_offers_brand_id_creator_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."creator_brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_relationships" ADD CONSTRAINT "library_relationships_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_relationships" ADD CONSTRAINT "library_relationships_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_experiments" ADD CONSTRAINT "optimization_experiments_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_experiments" ADD CONSTRAINT "optimization_experiments_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artist_rule_events_rule_created_idx" ON "artist_rule_events" USING btree ("rule_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artist_rules_profile_status_idx" ON "artist_rules" USING btree ("creator_profile_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artist_rules_resolution_idx" ON "artist_rules" USING btree ("creator_profile_id","category","rule_key","scope","scope_value");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creator_brands_profile_name_unique" ON "creator_brands" USING btree ("creator_profile_id","normalized_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_offers_profile_status_idx" ON "creator_offers" USING btree ("creator_profile_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_relationships_identity_unique" ON "library_relationships" USING btree ("creator_profile_id","kind","subject_type","subject_id","object_type","object_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_relationships_subject_idx" ON "library_relationships" USING btree ("creator_profile_id","subject_type","subject_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_relationships_object_idx" ON "library_relationships" USING btree ("creator_profile_id","object_type","object_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "optimization_experiments_subject_idx" ON "optimization_experiments" USING btree ("creator_profile_id","subject_type","subject_id","status");--> statement-breakpoint

-- Every content-graph table is private creator data. FORCE RLS prevents table
-- owner bypass; the owner bridge preserves existing server callers until all
-- application reads are session-bound transactions.
ALTER TABLE "artist_rule_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "artist_rule_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "artist_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "artist_rules" FORCE ROW LEVEL SECURITY;
ALTER TABLE "creator_brands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "creator_brands" FORCE ROW LEVEL SECURITY;
ALTER TABLE "creator_offers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "creator_offers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "library_relationships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_relationships" FORCE ROW LEVEL SECURITY;
ALTER TABLE "optimization_experiments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "optimization_experiments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "youtube_videos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "youtube_videos" FORCE ROW LEVEL SECURITY;
ALTER TABLE "youtube_thumbnail_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "youtube_thumbnail_versions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "youtube_video_metric_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "youtube_video_metric_snapshots" FORCE ROW LEVEL SECURITY;
ALTER TABLE "youtube_video_release_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "youtube_video_release_links" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "artist_rule_events_private_access" ON "artist_rule_events" FOR ALL
  USING (can_manage_private_creator_profile(creator_profile_id))
  WITH CHECK (can_manage_private_creator_profile(creator_profile_id));
CREATE POLICY "artist_rule_events_system_all" ON "artist_rule_events" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "artist_rule_events_owner_bridge" ON "artist_rule_events" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('artist_rule_events'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('artist_rule_events'));
--> statement-breakpoint

CREATE POLICY "artist_rules_private_access" ON "artist_rules" FOR ALL
  USING (can_manage_private_creator_profile(creator_profile_id))
  WITH CHECK (can_manage_private_creator_profile(creator_profile_id));
CREATE POLICY "artist_rules_system_all" ON "artist_rules" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "artist_rules_owner_bridge" ON "artist_rules" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('artist_rules'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('artist_rules'));
--> statement-breakpoint

CREATE POLICY "creator_brands_private_access" ON "creator_brands" FOR ALL
  USING (can_manage_private_creator_profile(creator_profile_id))
  WITH CHECK (can_manage_private_creator_profile(creator_profile_id));
CREATE POLICY "creator_brands_system_all" ON "creator_brands" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "creator_brands_owner_bridge" ON "creator_brands" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('creator_brands'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('creator_brands'));
--> statement-breakpoint

CREATE POLICY "creator_offers_private_access" ON "creator_offers" FOR ALL
  USING (can_manage_private_creator_profile(creator_profile_id))
  WITH CHECK (can_manage_private_creator_profile(creator_profile_id));
CREATE POLICY "creator_offers_system_all" ON "creator_offers" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "creator_offers_owner_bridge" ON "creator_offers" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('creator_offers'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('creator_offers'));
--> statement-breakpoint

CREATE POLICY "library_relationships_private_access" ON "library_relationships" FOR ALL
  USING (can_manage_private_creator_profile(creator_profile_id))
  WITH CHECK (can_manage_private_creator_profile(creator_profile_id));
CREATE POLICY "library_relationships_system_all" ON "library_relationships" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "library_relationships_owner_bridge" ON "library_relationships" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('library_relationships'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('library_relationships'));
--> statement-breakpoint

CREATE POLICY "optimization_experiments_private_access" ON "optimization_experiments" FOR ALL
  USING (can_manage_private_creator_profile(creator_profile_id))
  WITH CHECK (can_manage_private_creator_profile(creator_profile_id));
CREATE POLICY "optimization_experiments_system_all" ON "optimization_experiments" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "optimization_experiments_owner_bridge" ON "optimization_experiments" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('optimization_experiments'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('optimization_experiments'));
--> statement-breakpoint

CREATE POLICY "youtube_videos_private_access" ON "youtube_videos" FOR ALL
  USING (can_manage_private_creator_profile(creator_profile_id))
  WITH CHECK (can_manage_private_creator_profile(creator_profile_id));
CREATE POLICY "youtube_videos_system_all" ON "youtube_videos" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "youtube_videos_owner_bridge" ON "youtube_videos" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('youtube_videos'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('youtube_videos'));
--> statement-breakpoint

CREATE POLICY "youtube_thumbnail_versions_private_access" ON "youtube_thumbnail_versions" FOR ALL
  USING (EXISTS (
    SELECT 1 FROM youtube_videos v
    WHERE v.id = "youtube_thumbnail_versions"."video_id" AND can_manage_private_creator_profile(v.creator_profile_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM youtube_videos v
    WHERE v.id = "youtube_thumbnail_versions"."video_id" AND can_manage_private_creator_profile(v.creator_profile_id)
  ));
CREATE POLICY "youtube_thumbnail_versions_system_all" ON "youtube_thumbnail_versions" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "youtube_thumbnail_versions_owner_bridge" ON "youtube_thumbnail_versions" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('youtube_thumbnail_versions'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('youtube_thumbnail_versions'));
--> statement-breakpoint

CREATE POLICY "youtube_video_metric_snapshots_private_access" ON "youtube_video_metric_snapshots" FOR ALL
  USING (EXISTS (
    SELECT 1 FROM youtube_videos v
    WHERE v.id = "youtube_video_metric_snapshots"."video_id" AND can_manage_private_creator_profile(v.creator_profile_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM youtube_videos v
    WHERE v.id = "youtube_video_metric_snapshots"."video_id" AND can_manage_private_creator_profile(v.creator_profile_id)
  ));
CREATE POLICY "youtube_video_metric_snapshots_system_all" ON "youtube_video_metric_snapshots" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "youtube_video_metric_snapshots_owner_bridge" ON "youtube_video_metric_snapshots" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('youtube_video_metric_snapshots'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('youtube_video_metric_snapshots'));
--> statement-breakpoint

CREATE POLICY "youtube_video_release_links_private_access" ON "youtube_video_release_links" FOR ALL
  USING (EXISTS (
    SELECT 1 FROM youtube_videos v
    WHERE v.id = "youtube_video_release_links"."video_id" AND can_manage_private_creator_profile(v.creator_profile_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM youtube_videos v
    WHERE v.id = "youtube_video_release_links"."video_id" AND can_manage_private_creator_profile(v.creator_profile_id)
  ));
CREATE POLICY "youtube_video_release_links_system_all" ON "youtube_video_release_links" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "youtube_video_release_links_owner_bridge" ON "youtube_video_release_links" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('youtube_video_release_links'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('youtube_video_release_links'));
--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_youtube_thumbnail_version_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'youtube thumbnail history is append-only';
  END IF;
  IF NEW.video_id IS DISTINCT FROM OLD.video_id
    OR NEW.image_url IS DISTINCT FROM OLD.image_url
    OR NEW.provenance IS DISTINCT FROM OLD.provenance
    OR NEW.experiment_id IS DISTINCT FROM OLD.experiment_id
    OR NEW.cohort_id IS DISTINCT FROM OLD.cohort_id
    OR NEW.detected_at IS DISTINCT FROM OLD.detected_at
  THEN
    RAISE EXCEPTION 'youtube thumbnail version identity is immutable';
  END IF;
  IF NEW.kind IS DISTINCT FROM OLD.kind AND NOT (
    (OLD.kind IN ('original', 'current') AND NEW.kind = 'previous')
    OR (OLD.kind = 'candidate' AND NEW.kind = 'current')
    OR (OLD.kind = 'previous' AND NEW.kind = 'current')
  ) THEN
    RAISE EXCEPTION 'invalid youtube thumbnail lifecycle transition';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER youtube_thumbnail_version_history_guard
  BEFORE UPDATE OR DELETE ON youtube_thumbnail_versions
  FOR EACH ROW EXECUTE FUNCTION enforce_youtube_thumbnail_version_history();
--> statement-breakpoint

-- Artist rule history is append-only. Direct edits are rejected, while rule
-- status changes emit an immutable event from the database itself.
CREATE OR REPLACE FUNCTION enforce_artist_rule_event_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'artist rule events are immutable';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER artist_rule_event_immutable_guard
  BEFORE UPDATE OR DELETE ON artist_rule_events
  FOR EACH ROW EXECUTE FUNCTION enforce_artist_rule_event_immutable();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION record_artist_rule_status_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event artist_rule_event_type;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := CASE NEW.status
      WHEN 'active' THEN 'activated'::artist_rule_event_type
      ELSE 'suggested'::artist_rule_event_type
    END;
  ELSIF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  ELSE
    v_event := CASE NEW.status
      WHEN 'active' THEN 'activated'::artist_rule_event_type
      WHEN 'superseded' THEN 'superseded'::artist_rule_event_type
      WHEN 'revoked' THEN 'revoked'::artist_rule_event_type
      ELSE 'suggested'::artist_rule_event_type
    END;
  END IF;

  INSERT INTO artist_rule_events (
    creator_profile_id,
    rule_id,
    event_type,
    actor_user_id,
    payload
  ) VALUES (
    NEW.creator_profile_id,
    NEW.id,
    v_event,
    NEW.confirmed_by,
    jsonb_build_object(
      'previousStatus', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      'status', NEW.status,
      'source', 'artist_rules_status_trigger'
    )
  );

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER artist_rule_status_event
  AFTER INSERT OR UPDATE OF status ON artist_rules
  FOR EACH ROW EXECUTE FUNCTION record_artist_rule_status_event();
