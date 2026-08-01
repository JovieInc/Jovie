-- JOV-3061: Enable RLS + FORCE on sensitive billing/chat/PII tables.
-- Hand-written: Drizzle cannot emit RLS policy SQL from schema files.
--
-- Model:
-- 1) ENABLE + FORCE so non-owner roles and the table owner are subject to policies.
-- 2) Ownership / public / system policies express intended access.
-- 3) Owner-only null-session bridge keeps existing server paths working until every
--    call site sets app.clerk_user_id (progressive enforcement; non-owners stay denied).
-- 4) System identities (system_*) used by withSystemIngestionSession and trusted jobs.

-- Resolve session identity to users.id (supports post-cutover users.id UUID and legacy clerk_id).
CREATE OR REPLACE FUNCTION current_app_user_uuid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT u.id
  FROM users u
  WHERE u.id::text = NULLIF(current_setting('app.clerk_user_id', true), '')
     OR u.clerk_id = NULLIF(current_setting('app.clerk_user_id', true), '')
  LIMIT 1;
$$;
--> statement-breakpoint

COMMENT ON FUNCTION current_app_user_uuid()
  IS 'RLS helper: map app.clerk_user_id (users.id UUID or legacy clerk_id) to users.id';
--> statement-breakpoint

-- True when the session is a trusted system/job identity (prefix system_).
CREATE OR REPLACE FUNCTION is_system_rls_session()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.clerk_user_id', true), '') LIKE 'system_%',
    false
  );
$$;
--> statement-breakpoint

COMMENT ON FUNCTION is_system_rls_session()
  IS 'RLS helper: true when app.clerk_user_id is a trusted system_* job identity';
--> statement-breakpoint

-- True when no app identity is set on the connection.
CREATE OR REPLACE FUNCTION is_rls_session_unset()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.clerk_user_id', true), '') IS NULL;
$$;
--> statement-breakpoint

-- True when the effective role (current_user) owns the named public table.
-- INVOKER on purpose: SECURITY DEFINER would make current_user the function
-- owner and the owner-bridge would always pass. SET ROLE / non-owner roles
-- must evaluate as themselves so the bridge stays owner-only.
CREATE OR REPLACE FUNCTION is_rls_table_owner(p_table text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = p_table
      AND c.relkind = 'r'
      AND c.relowner = (
        SELECT oid FROM pg_roles WHERE rolname = current_user
      )
  );
$$;
--> statement-breakpoint

COMMENT ON FUNCTION is_rls_table_owner(text)
  IS 'RLS helper: true when current_user owns the given public table (owner bridge only; INVOKER)';
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- creator_profiles
-- ---------------------------------------------------------------------------
ALTER TABLE "creator_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "creator_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "creator_profiles_select_public" ON "creator_profiles";
DROP POLICY IF EXISTS "creator_profiles_select_owner" ON "creator_profiles";
DROP POLICY IF EXISTS "creator_profiles_update_owner" ON "creator_profiles";
DROP POLICY IF EXISTS "creator_profiles_insert_owner" ON "creator_profiles";
DROP POLICY IF EXISTS "creator_profiles_delete_owner" ON "creator_profiles";
DROP POLICY IF EXISTS "creator_profiles_system_all" ON "creator_profiles";
DROP POLICY IF EXISTS "creator_profiles_owner_bridge" ON "creator_profiles";
--> statement-breakpoint

CREATE POLICY "creator_profiles_select_public"
  ON "creator_profiles"
  FOR SELECT
  USING (COALESCE(is_public, false) = true);
--> statement-breakpoint

CREATE POLICY "creator_profiles_select_owner"
  ON "creator_profiles"
  FOR SELECT
  USING (
    user_id = current_app_user_uuid()
    OR EXISTS (
      SELECT 1
      FROM user_profile_claims upc
      WHERE upc.creator_profile_id = creator_profiles.id
        AND upc.user_id = current_app_user_uuid()
    )
  );
--> statement-breakpoint

CREATE POLICY "creator_profiles_update_owner"
  ON "creator_profiles"
  FOR UPDATE
  USING (
    user_id = current_app_user_uuid()
    OR EXISTS (
      SELECT 1
      FROM user_profile_claims upc
      WHERE upc.creator_profile_id = creator_profiles.id
        AND upc.user_id = current_app_user_uuid()
        AND upc.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    user_id = current_app_user_uuid()
    OR EXISTS (
      SELECT 1
      FROM user_profile_claims upc
      WHERE upc.creator_profile_id = creator_profiles.id
        AND upc.user_id = current_app_user_uuid()
        AND upc.role IN ('owner', 'manager')
    )
  );
--> statement-breakpoint

CREATE POLICY "creator_profiles_insert_owner"
  ON "creator_profiles"
  FOR INSERT
  WITH CHECK (
    user_id IS NULL
    OR user_id = current_app_user_uuid()
    OR is_system_rls_session()
  );
--> statement-breakpoint

CREATE POLICY "creator_profiles_delete_owner"
  ON "creator_profiles"
  FOR DELETE
  USING (
    user_id = current_app_user_uuid()
    OR is_system_rls_session()
  );
--> statement-breakpoint

CREATE POLICY "creator_profiles_system_all"
  ON "creator_profiles"
  FOR ALL
  USING (is_system_rls_session())
  WITH CHECK (is_system_rls_session());
--> statement-breakpoint

CREATE POLICY "creator_profiles_owner_bridge"
  ON "creator_profiles"
  FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('creator_profiles'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('creator_profiles'));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- profile_photos
-- ---------------------------------------------------------------------------
ALTER TABLE "profile_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profile_photos" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "profile_photos_select_public" ON "profile_photos";
DROP POLICY IF EXISTS "profile_photos_select_owner" ON "profile_photos";
DROP POLICY IF EXISTS "profile_photos_write_owner" ON "profile_photos";
DROP POLICY IF EXISTS "profile_photos_system_all" ON "profile_photos";
DROP POLICY IF EXISTS "profile_photos_owner_bridge" ON "profile_photos";
--> statement-breakpoint

CREATE POLICY "profile_photos_select_public"
  ON "profile_photos"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM creator_profiles cp
      WHERE cp.id = profile_photos.creator_profile_id
        AND COALESCE(cp.is_public, false) = true
    )
  );
--> statement-breakpoint

CREATE POLICY "profile_photos_select_owner"
  ON "profile_photos"
  FOR SELECT
  USING (user_id = current_app_user_uuid());
--> statement-breakpoint

CREATE POLICY "profile_photos_write_owner"
  ON "profile_photos"
  FOR ALL
  USING (user_id = current_app_user_uuid())
  WITH CHECK (user_id = current_app_user_uuid());
--> statement-breakpoint

CREATE POLICY "profile_photos_system_all"
  ON "profile_photos"
  FOR ALL
  USING (is_system_rls_session())
  WITH CHECK (is_system_rls_session());
--> statement-breakpoint

CREATE POLICY "profile_photos_owner_bridge"
  ON "profile_photos"
  FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('profile_photos'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('profile_photos'));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- user_profile_claims
-- ---------------------------------------------------------------------------
ALTER TABLE "user_profile_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_profile_claims" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "user_profile_claims_select_owner" ON "user_profile_claims";
DROP POLICY IF EXISTS "user_profile_claims_write_owner" ON "user_profile_claims";
DROP POLICY IF EXISTS "user_profile_claims_system_all" ON "user_profile_claims";
DROP POLICY IF EXISTS "user_profile_claims_owner_bridge" ON "user_profile_claims";
--> statement-breakpoint

CREATE POLICY "user_profile_claims_select_owner"
  ON "user_profile_claims"
  FOR SELECT
  USING (user_id = current_app_user_uuid());
--> statement-breakpoint

CREATE POLICY "user_profile_claims_write_owner"
  ON "user_profile_claims"
  FOR ALL
  USING (user_id = current_app_user_uuid())
  WITH CHECK (user_id = current_app_user_uuid());
--> statement-breakpoint

CREATE POLICY "user_profile_claims_system_all"
  ON "user_profile_claims"
  FOR ALL
  USING (is_system_rls_session())
  WITH CHECK (is_system_rls_session());
--> statement-breakpoint

CREATE POLICY "user_profile_claims_owner_bridge"
  ON "user_profile_claims"
  FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('user_profile_claims'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('user_profile_claims'));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- billing_audit_log (financial + PII)
-- ---------------------------------------------------------------------------
ALTER TABLE "billing_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_audit_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "billing_audit_log_select_own" ON "billing_audit_log";
DROP POLICY IF EXISTS "billing_audit_log_system_all" ON "billing_audit_log";
DROP POLICY IF EXISTS "billing_audit_log_owner_bridge" ON "billing_audit_log";
--> statement-breakpoint

CREATE POLICY "billing_audit_log_select_own"
  ON "billing_audit_log"
  FOR SELECT
  USING (user_id = current_app_user_uuid());
--> statement-breakpoint

CREATE POLICY "billing_audit_log_system_all"
  ON "billing_audit_log"
  FOR ALL
  USING (is_system_rls_session())
  WITH CHECK (is_system_rls_session());
--> statement-breakpoint

CREATE POLICY "billing_audit_log_owner_bridge"
  ON "billing_audit_log"
  FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('billing_audit_log'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('billing_audit_log'));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- stripe_webhook_events (billing payloads)
-- ---------------------------------------------------------------------------
ALTER TABLE "stripe_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stripe_webhook_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "stripe_webhook_events_system_all" ON "stripe_webhook_events";
DROP POLICY IF EXISTS "stripe_webhook_events_owner_bridge" ON "stripe_webhook_events";
--> statement-breakpoint

CREATE POLICY "stripe_webhook_events_system_all"
  ON "stripe_webhook_events"
  FOR ALL
  USING (is_system_rls_session())
  WITH CHECK (is_system_rls_session());
--> statement-breakpoint

CREATE POLICY "stripe_webhook_events_owner_bridge"
  ON "stripe_webhook_events"
  FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('stripe_webhook_events'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('stripe_webhook_events'));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- chat_conversations
-- ---------------------------------------------------------------------------
ALTER TABLE "chat_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_conversations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "chat_conversations_select_owner" ON "chat_conversations";
DROP POLICY IF EXISTS "chat_conversations_write_owner" ON "chat_conversations";
DROP POLICY IF EXISTS "chat_conversations_system_all" ON "chat_conversations";
DROP POLICY IF EXISTS "chat_conversations_owner_bridge" ON "chat_conversations";
--> statement-breakpoint

CREATE POLICY "chat_conversations_select_owner"
  ON "chat_conversations"
  FOR SELECT
  USING (user_id = current_app_user_uuid());
--> statement-breakpoint

CREATE POLICY "chat_conversations_write_owner"
  ON "chat_conversations"
  FOR ALL
  USING (
    user_id = current_app_user_uuid()
    OR user_id IS NULL
  )
  WITH CHECK (
    user_id = current_app_user_uuid()
    OR user_id IS NULL
  );
--> statement-breakpoint

CREATE POLICY "chat_conversations_system_all"
  ON "chat_conversations"
  FOR ALL
  USING (is_system_rls_session())
  WITH CHECK (is_system_rls_session());
--> statement-breakpoint

CREATE POLICY "chat_conversations_owner_bridge"
  ON "chat_conversations"
  FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('chat_conversations'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('chat_conversations'));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- chat_messages (via conversation ownership)
-- ---------------------------------------------------------------------------
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_messages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "chat_messages_select_owner" ON "chat_messages";
DROP POLICY IF EXISTS "chat_messages_write_owner" ON "chat_messages";
DROP POLICY IF EXISTS "chat_messages_system_all" ON "chat_messages";
DROP POLICY IF EXISTS "chat_messages_owner_bridge" ON "chat_messages";
--> statement-breakpoint

CREATE POLICY "chat_messages_select_owner"
  ON "chat_messages"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM chat_conversations cc
      WHERE cc.id = chat_messages.conversation_id
        AND (
          cc.user_id = current_app_user_uuid()
          OR cc.user_id IS NULL
        )
    )
  );
--> statement-breakpoint

CREATE POLICY "chat_messages_write_owner"
  ON "chat_messages"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM chat_conversations cc
      WHERE cc.id = chat_messages.conversation_id
        AND (
          cc.user_id = current_app_user_uuid()
          OR cc.user_id IS NULL
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM chat_conversations cc
      WHERE cc.id = chat_messages.conversation_id
        AND (
          cc.user_id = current_app_user_uuid()
          OR cc.user_id IS NULL
        )
    )
  );
--> statement-breakpoint

CREATE POLICY "chat_messages_system_all"
  ON "chat_messages"
  FOR ALL
  USING (is_system_rls_session())
  WITH CHECK (is_system_rls_session());
--> statement-breakpoint

CREATE POLICY "chat_messages_owner_bridge"
  ON "chat_messages"
  FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('chat_messages'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('chat_messages'));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- tips (financial + tipper PII)
-- ---------------------------------------------------------------------------
ALTER TABLE "tips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tips" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "tips_select_owner" ON "tips";
DROP POLICY IF EXISTS "tips_insert_public" ON "tips";
DROP POLICY IF EXISTS "tips_system_all" ON "tips";
DROP POLICY IF EXISTS "tips_owner_bridge" ON "tips";
--> statement-breakpoint

CREATE POLICY "tips_select_owner"
  ON "tips"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM creator_profiles cp
      WHERE cp.id = tips.creator_profile_id
        AND (
          cp.user_id = current_app_user_uuid()
          OR EXISTS (
            SELECT 1
            FROM user_profile_claims upc
            WHERE upc.creator_profile_id = cp.id
              AND upc.user_id = current_app_user_uuid()
          )
        )
    )
  );
--> statement-breakpoint

-- Public tip checkout creates rows before any user session exists.
CREATE POLICY "tips_insert_public"
  ON "tips"
  FOR INSERT
  WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY "tips_system_all"
  ON "tips"
  FOR ALL
  USING (is_system_rls_session())
  WITH CHECK (is_system_rls_session());
--> statement-breakpoint

CREATE POLICY "tips_owner_bridge"
  ON "tips"
  FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('tips'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('tips'));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- ingestion_jobs (server-only queue; deny user self-access)
-- ---------------------------------------------------------------------------
ALTER TABLE "ingestion_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingestion_jobs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "ingestion_jobs_system_all" ON "ingestion_jobs";
DROP POLICY IF EXISTS "ingestion_jobs_owner_bridge" ON "ingestion_jobs";
--> statement-breakpoint

CREATE POLICY "ingestion_jobs_system_all"
  ON "ingestion_jobs"
  FOR ALL
  USING (is_system_rls_session())
  WITH CHECK (is_system_rls_session());
--> statement-breakpoint

CREATE POLICY "ingestion_jobs_owner_bridge"
  ON "ingestion_jobs"
  FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('ingestion_jobs'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('ingestion_jobs'));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- admin_audit_log (admin-only; no end-user self-access)
-- ---------------------------------------------------------------------------
ALTER TABLE "admin_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_audit_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "admin_audit_log_system_all" ON "admin_audit_log";
DROP POLICY IF EXISTS "admin_audit_log_owner_bridge" ON "admin_audit_log";
--> statement-breakpoint

CREATE POLICY "admin_audit_log_system_all"
  ON "admin_audit_log"
  FOR ALL
  USING (is_system_rls_session())
  WITH CHECK (is_system_rls_session());
--> statement-breakpoint

CREATE POLICY "admin_audit_log_owner_bridge"
  ON "admin_audit_log"
  FOR ALL
  USING (is_rls_session_unset() AND is_rls_table_owner('admin_audit_log'))
  WITH CHECK (is_rls_session_unset() AND is_rls_table_owner('admin_audit_log'));
