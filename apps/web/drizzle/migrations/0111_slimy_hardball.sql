DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "creator_profiles"
    WHERE "stripe_account_id" IS NOT NULL
    GROUP BY "stripe_account_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'creator_profiles contains duplicate stripe_account_id values';
  END IF;
END $$;--> statement-breakpoint
DROP INDEX IF EXISTS "idx_creator_profiles_stripe_account_id";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creator_profiles_stripe_account_id_unique" ON "creator_profiles" USING btree ("stripe_account_id") WHERE stripe_account_id IS NOT NULL;
