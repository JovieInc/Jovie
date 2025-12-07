-- Creator profile performance indexes
-- Guardrails: Drizzle runs inside a transaction; avoid CONCURRENTLY here.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_creator_profiles_username_normalized'
  ) THEN
    CREATE INDEX idx_creator_profiles_username_normalized
      ON creator_profiles (username_normalized);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_social_links_creator_profile_sort_order'
  ) THEN
    CREATE INDEX idx_social_links_creator_profile_sort_order
      ON social_links (creator_profile_id, sort_order);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_creator_contacts_creator_profile_active_sort'
  ) THEN
    CREATE INDEX idx_creator_contacts_creator_profile_active_sort
      ON creator_contacts (creator_profile_id, is_active, sort_order);
  END IF;
END $$;
