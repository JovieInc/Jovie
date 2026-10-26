-- Ownership proof before a page is public (Tim/lead 2026-10-25). A profile whose
-- claim verification is proof-only (free admission, identity unproven) must
-- never be public until an operator marks it verified. One enforcement point
-- instead of every writer: onboarding, mobile completion, dashboard PATCH,
-- ingestion auto-publish and switch-profile all end in an UPDATE of
-- creator_profiles. The trigger coerces is_public to false (it never raises,
-- so no product path breaks); the verified decision sets is_public and the
-- verified status in one UPDATE, which passes.
CREATE OR REPLACE FUNCTION "enforce_proof_before_public"() RETURNS trigger AS $$
BEGIN
  IF NEW."is_public" IS TRUE
     AND (NEW."settings" -> 'claimVerification' ->> 'proofOnly') = 'true'
     AND (NEW."settings" -> 'claimVerification' ->> 'status') IS DISTINCT FROM 'verified'
  THEN
    NEW."is_public" := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "creator_profiles_proof_before_public" ON "creator_profiles";
--> statement-breakpoint
CREATE TRIGGER "creator_profiles_proof_before_public"
  BEFORE INSERT OR UPDATE OF "is_public", "settings" ON "creator_profiles"
  FOR EACH ROW EXECUTE FUNCTION "enforce_proof_before_public"();
