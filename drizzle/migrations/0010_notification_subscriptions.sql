-- Notification subscriptions captured from profile notification inputs

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_channel') THEN
    CREATE TYPE notification_channel AS ENUM ('email', 'phone');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_profile_id uuid NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL,
  email text,
  phone text,
  country_code text,
  ip_address text,
  source text,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT notification_subscriptions_contact_check CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_subscriptions_profile_email
  ON notification_subscriptions(creator_profile_id, email)
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_subscriptions_profile_phone
  ON notification_subscriptions(creator_profile_id, phone)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_profile_created
  ON notification_subscriptions(creator_profile_id, created_at DESC);

ALTER TABLE notification_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_subscriptions_insert_any ON notification_subscriptions
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY notification_subscriptions_select_owner ON notification_subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM creator_profiles cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.id = notification_subscriptions.creator_profile_id
        AND u.clerk_id = current_setting('app.clerk_user_id', true)::text
    )
  );

CREATE POLICY notification_subscriptions_update_owner ON notification_subscriptions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM creator_profiles cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.id = notification_subscriptions.creator_profile_id
        AND u.clerk_id = current_setting('app.clerk_user_id', true)::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM creator_profiles cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.id = notification_subscriptions.creator_profile_id
        AND u.clerk_id = current_setting('app.clerk_user_id', true)::text
    )
  );

CREATE POLICY notification_subscriptions_delete_owner ON notification_subscriptions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM creator_profiles cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.id = notification_subscriptions.creator_profile_id
        AND u.clerk_id = current_setting('app.clerk_user_id', true)::text
    )
  );
