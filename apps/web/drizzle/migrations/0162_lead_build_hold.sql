-- Lead-built profiles stay private until certified or claimed (Tim 2026-10-29).
-- The lead pipeline builds pages for real prospect artists from public data.
-- Until the profile passes per-profile certification and the dogfood judge, or
-- the artist claims it, it must not be reachable or indexed. Same shape as
-- enforce_proof_before_public: one enforcement point for every writer. The
-- trigger coerces is_public to false (never raises). A claim sets user_id /
-- is_claimed, certification stamps settings.leadBuild.releasedAt; either passes.
CREATE OR REPLACE FUNCTION "enforce_lead_build_hold"() RETURNS trigger AS $$
BEGIN
  -- Background writers may replace settings read before the hold was applied.
  -- Retain both active holds and certification receipts across stale writes.
  IF TG_OP = 'UPDATE'
     AND (OLD."settings" -> 'leadBuild' ->> 'held') = 'true'
     AND (NEW."settings" -> 'leadBuild' ->> 'releasedAt') IS NULL
     AND NEW."user_id" IS NULL
     AND COALESCE(NEW."is_claimed", false) IS FALSE
  THEN
    NEW."settings" := jsonb_set(
      COALESCE(NEW."settings", '{}'::jsonb),
      '{leadBuild}',
      OLD."settings" -> 'leadBuild'
    );
  END IF;

  IF NEW."is_public" IS TRUE
     AND (NEW."settings" -> 'leadBuild' ->> 'held') = 'true'
     AND (NEW."settings" -> 'leadBuild' ->> 'releasedAt') IS NULL
     AND NEW."user_id" IS NULL
     AND COALESCE(NEW."is_claimed", false) IS FALSE
  THEN
    NEW."is_public" := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "creator_profiles_lead_build_hold" ON "creator_profiles";
--> statement-breakpoint
CREATE TRIGGER "creator_profiles_lead_build_hold"
  BEFORE INSERT OR UPDATE OF "is_public", "settings" ON "creator_profiles"
  FOR EACH ROW EXECUTE FUNCTION "enforce_lead_build_hold"();
--> statement-breakpoint
-- Close the live exposure: every unclaimed profile a lead built goes private.
UPDATE "creator_profiles" cp
SET "settings" = jsonb_set(
      COALESCE(cp."settings", '{}'::jsonb),
      '{leadBuild}',
      jsonb_build_object('held', true, 'reason', 'lead_built_uncertified')
    ),
    "is_public" = false,
    "updated_at" = now()
FROM "leads" l
WHERE l."creator_profile_id" = cp."id"
  AND cp."user_id" IS NULL
  AND COALESCE(cp."is_claimed", false) IS FALSE
  AND (cp."settings" -> 'leadBuild' ->> 'releasedAt') IS NULL;
