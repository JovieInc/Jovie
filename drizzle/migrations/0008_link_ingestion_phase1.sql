-- Phase 1: Link ingestion foundation + Linktree job scaffolding

-- Creator profile safeguards for ingestion writes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingestion_status') THEN
    CREATE TYPE ingestion_status AS ENUM ('idle', 'pending', 'processing', 'failed');
  END IF;
END $$;

ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS avatar_locked_by_user boolean NOT NULL DEFAULT false;

ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS display_name_locked boolean NOT NULL DEFAULT false;

ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS ingestion_status ingestion_status NOT NULL DEFAULT 'idle';

-- Shared ingestion source type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingestion_source_type') THEN
    CREATE TYPE ingestion_source_type AS ENUM ('manual', 'admin', 'ingested');
  END IF;
END $$;

-- Social link states + confidence
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_link_state') THEN
    CREATE TYPE social_link_state AS ENUM ('active', 'suggested', 'rejected');
  END IF;
END $$;

ALTER TABLE social_links
  ADD COLUMN IF NOT EXISTS state social_link_state NOT NULL DEFAULT 'active';

ALTER TABLE social_links
  ADD COLUMN IF NOT EXISTS confidence numeric(3, 2) NOT NULL DEFAULT 1.0;

ALTER TABLE social_links
  ADD COLUMN IF NOT EXISTS source_platform text;

ALTER TABLE social_links
  ADD COLUMN IF NOT EXISTS source_type ingestion_source_type NOT NULL DEFAULT 'manual';

ALTER TABLE social_links
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill legacy rows to keep compatibility
UPDATE social_links
SET
  state = COALESCE(state, 'active'),
  confidence = COALESCE(confidence, 1.0),
  source_type = COALESCE(source_type, 'manual'),
  is_active = COALESCE(is_active, true)
WHERE state IS NULL
   OR confidence IS NULL
   OR source_type IS NULL
   OR is_active IS NULL;

-- Social accounts for enriched handles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_account_status') THEN
    CREATE TYPE social_account_status AS ENUM ('suspected', 'confirmed', 'rejected');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_profile_id uuid NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  platform text NOT NULL,
  handle text,
  url text,
  status social_account_status NOT NULL DEFAULT 'suspected',
  confidence numeric(3, 2) DEFAULT 0.0,
  is_verified_flag boolean DEFAULT false,
  paid_flag boolean DEFAULT false,
  raw_data jsonb DEFAULT '{}'::jsonb,
  source_platform text,
  source_type ingestion_source_type NOT NULL DEFAULT 'ingested',
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

-- Profile photos ingestion metadata
ALTER TABLE profile_photos
  ADD COLUMN IF NOT EXISTS ingestion_owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE profile_photos
  ADD COLUMN IF NOT EXISTS source_platform text;

ALTER TABLE profile_photos
  ADD COLUMN IF NOT EXISTS source_type ingestion_source_type NOT NULL DEFAULT 'manual';

ALTER TABLE profile_photos
  ADD COLUMN IF NOT EXISTS confidence numeric(3, 2) NOT NULL DEFAULT 1.0;

ALTER TABLE profile_photos
  ADD COLUMN IF NOT EXISTS locked_by_user boolean NOT NULL DEFAULT false;

-- Ingestion jobs queue
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingestion_job_status') THEN
    CREATE TYPE ingestion_job_status AS ENUM ('pending', 'processing', 'succeeded', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  payload jsonb NOT NULL,
  status ingestion_job_status NOT NULL DEFAULT 'pending',
  error text,
  attempts integer NOT NULL DEFAULT 0,
  run_at timestamp NOT NULL DEFAULT now(),
  priority integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Scraper configurations per network
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scraper_strategy') THEN
    CREATE TYPE scraper_strategy AS ENUM ('http', 'browser', 'api');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS scraper_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL,
  strategy scraper_strategy NOT NULL DEFAULT 'http',
  max_concurrency integer NOT NULL DEFAULT 1,
  max_jobs_per_minute integer NOT NULL DEFAULT 30,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Default Linktree config to keep the worker guard-railed
INSERT INTO scraper_configs (id, network, strategy, max_concurrency, max_jobs_per_minute, enabled)
VALUES (gen_random_uuid(), 'linktree', 'http', 2, 30, true)
ON CONFLICT DO NOTHING;

-- Supporting indexes for ingestion workloads
CREATE INDEX IF NOT EXISTS idx_social_links_creator_state_platform
  ON social_links(creator_profile_id, state, platform);

CREATE INDEX IF NOT EXISTS idx_social_links_confidence
  ON social_links(confidence);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status_run
  ON ingestion_jobs(status, run_at);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_type_status
  ON ingestion_jobs(job_type, status);

CREATE INDEX IF NOT EXISTS idx_social_accounts_creator_platform
  ON social_accounts(creator_profile_id, platform);
