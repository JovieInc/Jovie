CREATE TABLE "artist_rule_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"scope" "artist_rule_scope" NOT NULL,
	"scope_value" text NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"authorized_by" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artist_rule_exceptions" ADD CONSTRAINT "artist_rule_exceptions_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_rule_exceptions" ADD CONSTRAINT "artist_rule_exceptions_rule_id_artist_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."artist_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_rule_exceptions" ADD CONSTRAINT "artist_rule_exceptions_authorized_by_users_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artist_rule_exceptions_rule_scope_idx" ON "artist_rule_exceptions" USING btree ("rule_id","scope","scope_value","created_at");--> statement-breakpoint

ALTER TABLE "artist_rule_exceptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "artist_rule_exceptions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "artist_rule_exceptions_private_access" ON "artist_rule_exceptions" FOR ALL
  USING (can_manage_private_creator_profile(creator_profile_id))
  WITH CHECK (can_manage_private_creator_profile(creator_profile_id));
CREATE POLICY "artist_rule_exceptions_system_all" ON "artist_rule_exceptions" FOR ALL
  USING (is_system_rls_session()) WITH CHECK (is_system_rls_session());
CREATE POLICY "artist_rule_exceptions_owner_bridge" ON "artist_rule_exceptions" FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('artist_rule_exceptions'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('artist_rule_exceptions'));
--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_artist_rule_exception()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_allow_override boolean;
  v_status artist_rule_status;
  v_profile_id uuid;
BEGIN
  SELECT allow_override, status, creator_profile_id
    INTO v_allow_override, v_status, v_profile_id
  FROM artist_rules
  WHERE id = NEW.rule_id;

  IF v_profile_id IS NULL OR v_profile_id IS DISTINCT FROM NEW.creator_profile_id THEN
    RAISE EXCEPTION 'artist rule exception profile mismatch';
  END IF;
  IF v_status IS DISTINCT FROM 'active'::artist_rule_status THEN
    RAISE EXCEPTION 'only active artist rules can be overridden';
  END IF;
  IF NOT v_allow_override THEN
    RAISE EXCEPTION 'artist rule does not allow overrides';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER artist_rule_exception_guard
  BEFORE INSERT ON artist_rule_exceptions
  FOR EACH ROW EXECUTE FUNCTION enforce_artist_rule_exception();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION record_artist_rule_exception_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO artist_rule_events (
    creator_profile_id,
    rule_id,
    event_type,
    actor_user_id,
    payload
  ) VALUES (
    NEW.creator_profile_id,
    NEW.rule_id,
    'exception_granted'::artist_rule_event_type,
    NEW.authorized_by,
    jsonb_build_object(
      'exceptionId', NEW.id,
      'scope', NEW.scope,
      'scopeValue', NEW.scope_value,
      'reason', NEW.reason,
      'evidence', NEW.evidence,
      'expiresAt', NEW.expires_at
    )
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER artist_rule_exception_event
  AFTER INSERT ON artist_rule_exceptions
  FOR EACH ROW EXECUTE FUNCTION record_artist_rule_exception_event();
