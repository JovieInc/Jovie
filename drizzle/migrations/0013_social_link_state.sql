-- Ensure the social_links.state column exists so queries can safely reference it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_link_state') THEN
    CREATE TYPE social_link_state AS ENUM ('active', 'suggested', 'rejected');
  END IF;
END $$;

ALTER TABLE social_links
  ADD COLUMN IF NOT EXISTS state social_link_state NOT NULL DEFAULT 'active';
