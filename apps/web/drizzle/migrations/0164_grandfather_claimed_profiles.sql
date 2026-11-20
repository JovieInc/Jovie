-- Grandfather existing claimed public profiles (Tim 2026-11-01, claim-verify
-- spec Q2). Every profile that is claimed, public and linked to a Spotify
-- artist, and has no claim-verification record, is recorded as verified with
-- proofMethod 'legacy' and a 30-day window to verify. Proof becomes mandatory
-- only on a dispute or at 50k+ followers after the window (the daily sweep in
-- lib/claim/legacy-verification.server.ts, flag CLAIM_LEGACY_PROOF_SWEEP).
--
-- Data only and additive: one settings key is added, nothing else changes.
-- is_public is never written. status 'verified' passes
-- enforce_proof_before_public, and claimed rows pass enforce_lead_build_hold,
-- so neither trigger changes visibility. Rows that already hold a record are
-- skipped, so a re-run is a no-op.
--
-- Down path (manual, never automatic). Removes only the records written here
-- and still unchanged by any later decision:
--   UPDATE "creator_profiles"
--   SET "settings" = "settings" - 'claimVerification'
--   WHERE "settings" -> 'claimVerification' ->> 'decidedBy' = 'grandfather-2026-11';
UPDATE "creator_profiles"
SET "settings" = jsonb_set(
  COALESCE("settings", '{}'::jsonb),
  '{claimVerification}',
  jsonb_build_object(
    'schema', 'jovie-claim-verification/v1',
    'status', 'verified',
    'proofMethod', 'legacy',
    'spotifyArtistId', "spotify_id",
    'artistName', NULLIF(trim("display_name"), ''),
    'reach', jsonb_build_object(
      'signal', 'spotify_followers',
      'value', COALESCE("spotify_followers", 0),
      'threshold', 50000
    ),
    'requestedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'paidAt', NULL,
    'decidedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'decidedBy', 'grandfather-2026-11',
    'legacyNudgeDueAt', to_char((now() + interval '30 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
)
WHERE "is_claimed" IS TRUE
  AND "is_public" IS TRUE
  AND NULLIF(trim("spotify_id"), '') IS NOT NULL
  AND ("settings" IS NULL OR jsonb_typeof("settings") = 'object')
  AND "settings" -> 'claimVerification' IS NULL;
