DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'library_collision_disposition') THEN
		CREATE TYPE "public"."library_collision_disposition" AS ENUM('unreviewed', 'not_this_artist', 'not_this_song', 'confirmed_match');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'library_presence_action_mode') THEN
		CREATE TYPE "public"."library_presence_action_mode" AS ENUM('direct_update', 'draft_request', 'filter_only');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'library_presence_finding_kind') THEN
		CREATE TYPE "public"."library_presence_finding_kind" AS ENUM('repair', 'collision', 'placement_opportunity');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'library_presence_finding_status') THEN
		CREATE TYPE "public"."library_presence_finding_status" AS ENUM('open', 'drafted', 'resolved', 'dismissed');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'library_presence_issue_type') THEN
		CREATE TYPE "public"."library_presence_issue_type" AS ENUM('dead_link', 'missing_jovie_link', 'wrong_artist', 'wrong_song', 'wrong_identifier', 'placement_opportunity');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rightsholder_domain') THEN
		CREATE TYPE "public"."rightsholder_domain" AS ENUM('composition', 'master', 'unknown');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rightsholder_evidence_class') THEN
		CREATE TYPE "public"."rightsholder_evidence_class" AS ENUM('attested', 'observed', 'claimed');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rightsholder_evidence_source') THEN
		CREATE TYPE "public"."rightsholder_evidence_source" AS ENUM('artist_attestation', 'songview', 'mlc', 'catalog', 'other');
	END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "library_presence_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"kind" "library_presence_finding_kind" NOT NULL,
	"issue_type" "library_presence_issue_type" NOT NULL,
	"platform" text NOT NULL,
	"source_key" text NOT NULL,
	"title" text NOT NULL,
	"current_url" text,
	"expected_url" text,
	"action_mode" "library_presence_action_mode" NOT NULL,
	"status" "library_presence_finding_status" DEFAULT 'open' NOT NULL,
	"collision_disposition" "library_collision_disposition",
	"draft_request" text,
	"evidence" jsonb NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_rightsholder_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"party_name" text NOT NULL,
	"role" text NOT NULL,
	"domain" "rightsholder_domain" NOT NULL,
	"evidence_class" "rightsholder_evidence_class" NOT NULL,
	"source" "rightsholder_evidence_source" NOT NULL,
	"share_bps" integer,
	"source_work_id" text,
	"source_url" text,
	"evidence" jsonb NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "promo_downloads" ADD COLUMN "rights_control_attested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_downloads" ADD COLUMN "rights_control_attested_by" uuid;--> statement-breakpoint
ALTER TABLE "promo_downloads" ADD COLUMN "rights_control_attested_at" timestamp;--> statement-breakpoint
ALTER TABLE "library_presence_findings" ADD CONSTRAINT "library_presence_findings_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_presence_findings" ADD CONSTRAINT "library_presence_findings_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_rightsholder_evidence" ADD CONSTRAINT "library_rightsholder_evidence_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_presence_findings_source_unique" ON "library_presence_findings" USING btree ("creator_profile_id","source_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_presence_findings_queue_idx" ON "library_presence_findings" USING btree ("creator_profile_id","subject_type","subject_id","kind","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_rightsholder_evidence_subject_idx" ON "library_rightsholder_evidence" USING btree ("creator_profile_id","subject_type","subject_id","evidence_class");--> statement-breakpoint
ALTER TABLE "promo_downloads" ADD CONSTRAINT "promo_downloads_rights_control_attested_by_users_id_fk" FOREIGN KEY ("rights_control_attested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

-- Existing promo files predate the full-control attestation and therefore
-- fail closed until their artist explicitly re-attests.
UPDATE "promo_downloads"
SET "is_active" = false
WHERE "rights_control_attested" = false;
--> statement-breakpoint

ALTER TABLE "library_presence_findings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_presence_findings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "library_rightsholder_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_rightsholder_evidence" FORCE ROW LEVEL SECURITY;
ALTER TABLE "promo_downloads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promo_downloads" FORCE ROW LEVEL SECURITY;
ALTER TABLE "promo_download_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promo_download_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "library_presence_findings_private_access" ON "library_presence_findings" FOR ALL
  USING (can_manage_private_creator_profile(creator_profile_id))
  WITH CHECK (can_manage_private_creator_profile(creator_profile_id));
CREATE POLICY "library_presence_findings_system_all" ON "library_presence_findings" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "library_presence_findings_owner_bridge" ON "library_presence_findings" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('library_presence_findings'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('library_presence_findings'));
--> statement-breakpoint

CREATE POLICY "library_rightsholder_evidence_private_access" ON "library_rightsholder_evidence" FOR ALL
  USING (can_manage_private_creator_profile(creator_profile_id))
  WITH CHECK (can_manage_private_creator_profile(creator_profile_id));
CREATE POLICY "library_rightsholder_evidence_system_all" ON "library_rightsholder_evidence" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "library_rightsholder_evidence_owner_bridge" ON "library_rightsholder_evidence" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('library_rightsholder_evidence'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('library_rightsholder_evidence'));
--> statement-breakpoint

CREATE POLICY "promo_downloads_private_access" ON "promo_downloads" FOR ALL
  USING (can_manage_private_creator_profile(creator_profile_id))
  WITH CHECK (can_manage_private_creator_profile(creator_profile_id));
CREATE POLICY "promo_downloads_system_all" ON "promo_downloads" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "promo_downloads_owner_bridge" ON "promo_downloads" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('promo_downloads'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('promo_downloads'));
--> statement-breakpoint

CREATE POLICY "promo_download_events_private_access" ON "promo_download_events" FOR ALL
  USING (can_manage_private_creator_profile(creator_profile_id))
  WITH CHECK (can_manage_private_creator_profile(creator_profile_id));
CREATE POLICY "promo_download_events_system_all" ON "promo_download_events" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "promo_download_events_owner_bridge" ON "promo_download_events" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('promo_download_events'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('promo_download_events'));
--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_library_rightsholder_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.source IN ('songview', 'mlc')
    AND NEW.evidence_class IS DISTINCT FROM 'observed'::rightsholder_evidence_class
  THEN
    RAISE EXCEPTION 'public registry evidence must remain observed';
  END IF;
  IF NEW.evidence_class = 'attested'::rightsholder_evidence_class
    AND NEW.source IS DISTINCT FROM 'artist_attestation'::rightsholder_evidence_source
  THEN
    RAISE EXCEPTION 'attested evidence requires artist attestation';
  END IF;
  IF NEW.share_bps IS NOT NULL AND (NEW.share_bps < 0 OR NEW.share_bps > 10000) THEN
    RAISE EXCEPTION 'rightsholder share must be between 0 and 10000 basis points';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER library_rightsholder_evidence_guard
  BEFORE INSERT OR UPDATE ON library_rightsholder_evidence
  FOR EACH ROW EXECUTE FUNCTION enforce_library_rightsholder_evidence();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_library_presence_finding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.kind = 'collision'::library_presence_finding_kind THEN
    IF NEW.issue_type NOT IN ('wrong_artist', 'wrong_song', 'wrong_identifier') THEN
      RAISE EXCEPTION 'collision findings require an identity issue';
    END IF;
    IF NEW.action_mode IS DISTINCT FROM 'filter_only'::library_presence_action_mode THEN
      RAISE EXCEPTION 'collision findings require a filter action';
    END IF;
    IF NEW.collision_disposition IS NULL THEN
      NEW.collision_disposition := 'unreviewed'::library_collision_disposition;
    END IF;
  ELSIF NEW.collision_disposition IS NOT NULL THEN
    RAISE EXCEPTION 'only collision findings may set a collision disposition';
  END IF;
  IF NEW.status = 'drafted'::library_presence_finding_status
    AND (NEW.draft_request IS NULL OR btrim(NEW.draft_request) = '')
  THEN
    RAISE EXCEPTION 'drafted repair findings require draft copy';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER library_presence_finding_guard
  BEFORE INSERT OR UPDATE ON library_presence_findings
  FOR EACH ROW EXECUTE FUNCTION enforce_library_presence_finding();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_promo_download_rights_attestation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.rights_control_attested THEN
    IF NEW.rights_control_attested IS DISTINCT FROM OLD.rights_control_attested
      OR NEW.rights_control_attested_by IS DISTINCT FROM OLD.rights_control_attested_by
      OR NEW.rights_control_attested_at IS DISTINCT FROM OLD.rights_control_attested_at
    THEN
      RAISE EXCEPTION 'promo download rights attestation is immutable';
    END IF;
  END IF;
  IF NEW.rights_control_attested AND (
    NEW.rights_control_attested_by IS NULL OR NEW.rights_control_attested_at IS NULL
  ) THEN
    RAISE EXCEPTION 'rights attestation requires actor and timestamp';
  END IF;
  IF NEW.is_active AND NOT NEW.rights_control_attested THEN
    RAISE EXCEPTION 'active downloads require full-control attestation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER promo_download_rights_attestation_guard
  BEFORE INSERT OR UPDATE ON promo_downloads
  FOR EACH ROW EXECUTE FUNCTION enforce_promo_download_rights_attestation();
--> statement-breakpoint

-- Founder-locked public evidence for the canonical Tim profile. These are
-- queue inputs only: no outbound request is sent and no external page is
-- marked repaired by this migration.
WITH tim_profile AS (
  SELECT id FROM creator_profiles WHERE username_normalized = 'tim' LIMIT 1
), findings (
  source_key, kind, issue_type, platform, title, current_url, expected_url,
  action_mode, draft_request, evidence
) AS (
  VALUES
    ('tim-2026-08-28-genius-artist-link', 'repair'::library_presence_finding_kind, 'dead_link'::library_presence_issue_type, 'Genius', 'Replace dead tw.wtf artist link', NULL, 'https://jov.ie/tim', 'direct_update'::library_presence_action_mode, NULL, jsonb_build_object('deadUrl', 'http://tw.wtf/listen')),
    ('tim-2026-08-28-genius-tmo-links', 'repair'::library_presence_finding_kind, 'missing_jovie_link'::library_presence_issue_type, 'Genius', 'Attach official Take Me Over links', NULL, 'https://jov.ie/tim/take-me-over-2', 'direct_update'::library_presence_action_mode, NULL, jsonb_build_object('youtubeVideoId', 'LtDL1HHq954', 'spotifyTrackId', '4bc0TJNIiGEJjFYDwHuOjX')),
    ('tim-2026-08-28-lastfm-link', 'repair'::library_presence_finding_kind, 'missing_jovie_link'::library_presence_issue_type, 'Last.fm', 'Add canonical Jovie profile', NULL, 'https://jov.ie/tim', 'direct_update'::library_presence_action_mode, NULL, '{}'::jsonb),
    ('tim-2026-08-28-musicbrainz-link', 'repair'::library_presence_finding_kind, 'missing_jovie_link'::library_presence_issue_type, 'MusicBrainz', 'Add canonical Jovie profile', NULL, 'https://jov.ie/tim', 'direct_update'::library_presence_action_mode, NULL, '{}'::jsonb),
    ('tim-2026-08-28-soundcloud-link', 'repair'::library_presence_finding_kind, 'missing_jovie_link'::library_presence_issue_type, 'SoundCloud', 'Add canonical Jovie profile', NULL, 'https://jov.ie/tim', 'direct_update'::library_presence_action_mode, NULL, '{}'::jsonb),
    ('tim-2026-08-28-spotify-artist-link', 'repair'::library_presence_finding_kind, 'missing_jovie_link'::library_presence_issue_type, 'Spotify for Artists', 'Add canonical Jovie profile', NULL, 'https://jov.ie/tim', 'direct_update'::library_presence_action_mode, NULL, '{}'::jsonb),
    ('tim-2026-08-28-youtube-about-link', 'repair'::library_presence_finding_kind, 'missing_jovie_link'::library_presence_issue_type, 'YouTube About', 'Add canonical Jovie profile', NULL, 'https://jov.ie/tim', 'direct_update'::library_presence_action_mode, NULL, '{}'::jsonb),
    ('tim-2026-08-28-discogs-id', 'collision'::library_presence_finding_kind, 'wrong_identifier'::library_presence_issue_type, 'Discogs', 'Keep Tim White (20), artist 3685842', NULL, 'https://www.discogs.com/artist/3685842', 'filter_only'::library_presence_action_mode, NULL, jsonb_build_object('correctArtistId', '3685842', 'label', 'Tim White (20)')),
    ('tim-2026-08-28-beatport-id', 'collision'::library_presence_finding_kind, 'wrong_identifier'::library_presence_issue_type, 'Beatport', 'Use artist 410907, not 406847', 'https://www.beatport.com/artist/tim-white/406847', 'https://www.beatport.com/artist/tim-white/410907', 'filter_only'::library_presence_action_mode, NULL, '{}'::jsonb),
    ('tim-2026-08-28-allmusic-id', 'collision'::library_presence_finding_kind, 'wrong_identifier'::library_presence_issue_type, 'AllMusic', 'Use mn0003388877, not mn0003321847', NULL, 'https://www.allmusic.com/artist/tim-white-mn0003388877', 'filter_only'::library_presence_action_mode, NULL, jsonb_build_object('wrongArtistId', 'mn0003321847')),
    ('tim-2026-08-28-instagram-catalog', 'repair'::library_presence_finding_kind, 'wrong_identifier'::library_presence_issue_type, 'Instagram', 'Use catalog account @timwhite', 'https://instagram.com/itstimwhite', 'https://instagram.com/timwhite', 'direct_update'::library_presence_action_mode, NULL, '{}'::jsonb),
    ('tim-2026-08-28-jovie-instagram-slug', 'repair'::library_presence_finding_kind, 'dead_link'::library_presence_issue_type, 'Jovie', 'Repair /tim/instagram', 'https://jov.ie/tim/instagram', 'https://jov.ie/tim', 'direct_update'::library_presence_action_mode, NULL, '{}'::jsonb),
    ('tim-2026-08-28-jovie-tmo-slug', 'repair'::library_presence_finding_kind, 'dead_link'::library_presence_issue_type, 'Jovie', 'Repair Take Me Over legacy slug', 'https://jov.ie/tim/take-me-over', 'https://jov.ie/tim/take-me-over-2', 'direct_update'::library_presence_action_mode, NULL, '{}'::jsonb),
    ('tim-2026-08-28-collision-peking-duk', 'collision'::library_presence_finding_kind, 'wrong_artist'::library_presence_issue_type, 'Open web', 'Peking Duk result is not this artist', NULL, NULL, 'filter_only'::library_presence_action_mode, NULL, jsonb_build_object('artist', 'Peking Duk')),
    ('tim-2026-08-28-collision-cut-copy', 'collision'::library_presence_finding_kind, 'wrong_artist'::library_presence_issue_type, 'Open web', 'Cut Copy result is not this artist', NULL, NULL, 'filter_only'::library_presence_action_mode, NULL, jsonb_build_object('artist', 'Cut Copy')),
    ('tim-2026-08-28-collision-safia', 'collision'::library_presence_finding_kind, 'wrong_artist'::library_presence_issue_type, 'Open web', 'SAFIA result is not this artist', NULL, NULL, 'filter_only'::library_presence_action_mode, NULL, jsonb_build_object('artist', 'SAFIA')),
    ('tim-2026-08-28-collision-other-tim-whites', 'collision'::library_presence_finding_kind, 'wrong_artist'::library_presence_issue_type, 'Open web', 'Other Tim White identities are not this artist', NULL, NULL, 'filter_only'::library_presence_action_mode, NULL, jsonb_build_object('entityClass', 'same_name_artist'))
)
INSERT INTO library_presence_findings (
  creator_profile_id, subject_type, subject_id, kind, issue_type, platform,
  source_key, title, current_url, expected_url, action_mode, status,
  collision_disposition, draft_request, evidence, detected_at
)
SELECT
  p.id, 'artist', p.id::text, f.kind, f.issue_type, f.platform, f.source_key,
  f.title, f.current_url, f.expected_url, f.action_mode, 'open',
  CASE WHEN f.kind = 'collision' THEN 'unreviewed'::library_collision_disposition ELSE NULL END,
  f.draft_request, f.evidence, '2026-08-28T00:00:00Z'::timestamptz
FROM tim_profile p CROSS JOIN findings f
ON CONFLICT (creator_profile_id, source_key) DO NOTHING;
--> statement-breakpoint

WITH tim_profile AS (
  SELECT id FROM creator_profiles WHERE username_normalized = 'tim' LIMIT 1
), tmo_release AS (
  SELECT r.id, r.creator_profile_id
  FROM discog_releases r
  JOIN tim_profile p ON p.id = r.creator_profile_id
  WHERE lower(r.title) = 'take me over'
  ORDER BY r.release_date DESC NULLS LAST
  LIMIT 1
), writers (party_name) AS (
  VALUES ('Tim White'), ('Gibson'), ('Stallone')
)
INSERT INTO library_rightsholder_evidence (
  creator_profile_id, subject_type, subject_id, party_name, role, domain,
  evidence_class, source, share_bps, source_work_id, evidence, captured_at
)
SELECT
  r.creator_profile_id, 'release', r.id::text, w.party_name, 'writer',
  'composition', 'observed', 'other', NULL,
  'tim-lock-2026-08-28:tmo',
  jsonb_build_object('note', 'Multi-writer observation; not a master-control attestation'),
  '2026-08-28T00:00:00Z'::timestamptz
FROM tmo_release r CROSS JOIN writers w;
