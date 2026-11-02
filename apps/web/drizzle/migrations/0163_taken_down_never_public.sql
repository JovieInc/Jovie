-- Claim disputes (Tim, 2026-11-01). Two statuses join the proof-before-public
-- rule. `taken_down` is never public, for every writer, whether or not the
-- record is proof-only. `disputed` is only reachable from `verified` and the
-- page stays up, frozen, so it passes like `verified`; otherwise a dispute on a
-- proof-only page would take it offline. Everything else is unchanged from
-- 0148. The trigger already fires on is_public and settings updates.
CREATE OR REPLACE FUNCTION "enforce_proof_before_public"() RETURNS trigger AS $$
BEGIN
  IF NEW."is_public" IS TRUE
     AND (
       (NEW."settings" -> 'claimVerification' ->> 'status') = 'taken_down'
       OR (
         (NEW."settings" -> 'claimVerification' ->> 'proofOnly') = 'true'
         AND (NEW."settings" -> 'claimVerification' ->> 'status') IS DISTINCT FROM 'verified'
         AND (NEW."settings" -> 'claimVerification' ->> 'status') IS DISTINCT FROM 'disputed'
       )
     )
  THEN
    NEW."is_public" := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
