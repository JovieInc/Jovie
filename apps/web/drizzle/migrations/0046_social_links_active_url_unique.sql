-- Partial unique index on (creator_profile_id, platform, normalize_social_url(url))
-- for the active+visible subset. Closes the legacy ingestion gap that allowed
-- duplicate (creator, platform, url) rows to land in the DB and render as
-- "YouTube YouTube YouTube" in the profile preview (JOV-2149).
--
-- Normalization mirrors apps/web/lib/utils/social-platform.ts `dedupeKey`:
--   1. Lowercase
--   2. Strip leading scheme (http:// or https://)
--   3. Strip leading "www." host prefix
--   4. Strip trailing slashes from the path portion (before any query string)
--   5. Preserve the query string (e.g. facebook.com/profile.php?id=1 vs ?id=2)
--
-- Self-healing: the migration soft-deletes any existing duplicates within
-- each (creator_profile_id, platform, normalize_social_url(url)) group,
-- keeping the most recently updated row active and marking the rest as
-- is_active=false, state='rejected'. Originals are preserved for forensic
-- review — no rows are hard-deleted. ('rejected' matches the canonical
-- soft-delete state used by `app/api/dashboard/social-links DELETE`; the
-- `social_link_state` enum has no 'inactive' member.) This makes the
-- migration safe to run on databases that already hold duplicates (the
-- audit script is retained for ad-hoc dry-run inspection but is no
-- longer a required preflight).

-- 1. Define a normalize_social_url() function that mirrors the app's
--    dedupeKey for VALID URLs. Marked IMMUTABLE so it can be indexed.
--
--    Steps (mirror lib/utils/social-platform.ts dedupeKey):
--      a. Lowercase the entire URL.
--      b. Strip the leading scheme (http:// or https://).
--      c. Strip the leading "www." host prefix.
--      d. Strip trailing slashes from the path portion. This is done by
--         splitting on the first '?' or '#' (preserving the query/fragment
--         tail), trimming trailing '/' from the path part, then re-joining.
--         This avoids relying on regex lookahead and is bounded by string
--         length — no super-linear backtracking risk.
CREATE OR REPLACE FUNCTION normalize_social_url(raw_url text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $func$
DECLARE
  lowered     text;
  no_scheme   text;
  no_www      text;
  qfrag_start integer;
  path_part   text;
  tail_part   text;
BEGIN
  IF raw_url IS NULL THEN
    RETURN NULL;
  END IF;

  lowered   := lower(raw_url);
  no_scheme := regexp_replace(lowered, '^https?://', '');
  no_www    := regexp_replace(no_scheme, '^www\.', '');

  -- Find the first '?' or '#' marker. position() returns 0 if absent.
  qfrag_start := least(
    nullif(position('?' IN no_www), 0),
    nullif(position('#' IN no_www), 0)
  );

  IF qfrag_start IS NULL THEN
    path_part := no_www;
    tail_part := '';
  ELSE
    path_part := substring(no_www FROM 1 FOR qfrag_start - 1);
    tail_part := substring(no_www FROM qfrag_start);
  END IF;

  -- Strip trailing slashes from the path portion only. The tail
  -- (query string / fragment) is preserved verbatim.
  path_part := regexp_replace(path_part, '/+$', '');

  RETURN path_part || tail_part;
END;
$func$;
--> statement-breakpoint

-- 2. Inline self-clean: soft-delete duplicate active rows, keeping the
--    most-recently-updated row per (creator, platform, normalized_url)
--    group. Original rows are preserved (is_active=false, state=rejected)
--    for forensic review — the 'rejected' state matches the canonical
--    soft-delete path used elsewhere in the app.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY creator_profile_id, platform, normalize_social_url(url)
      ORDER BY updated_at DESC, created_at DESC, id ASC
    ) AS rn
  FROM social_links
  WHERE is_active = true AND state = 'active'
)
UPDATE social_links sl
   SET is_active = false,
       state = 'rejected',
       updated_at = now()
  FROM ranked r
 WHERE sl.id = r.id
   AND r.rn > 1;
--> statement-breakpoint

-- 3. Create the partial unique index. Uses the normalize function above
--    so DB canonicalization aligns with the app dedupe key.
--
--    Production rollout note: `social_links` is bounded by user count and
--    is small at our scale, so a blocking unique-index build is acceptable
--    here. If the table grows past ~1M rows the index can be rebuilt via
--    `CREATE UNIQUE INDEX CONCURRENTLY` outside a transaction, then this
--    index dropped. Tracked in Linear.
CREATE UNIQUE INDEX IF NOT EXISTS "social_links_creator_platform_url_unique"
  ON "social_links" USING btree (
    "creator_profile_id",
    "platform",
    normalize_social_url("url")
  )
  WHERE is_active = true AND state = 'active';
