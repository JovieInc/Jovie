-- Internal-account classification (founder dogfood, E2E, canary, agent).
-- NULL = external customer. Company metrics exclude any row where this is set
-- OR the email matches the rules in lib/utils/email.ts, so the backfill below is
-- durability for rows whose rule later changes, not the only line of defence.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "account_class" text;
--> statement-breakpoint
UPDATE "users"
SET "account_class" = 'internal'
WHERE "account_class" IS NULL
  AND "email" IS NOT NULL
  AND lower("email") ~* $jovie_pattern$@(.*\.)?(jov\.ie|timwhite\.co|jov\.ie)$|@(.*\.)?(test\.jovie\.com)$|@(.*\.)?(example\.(com|net|org)|invalid|localhost|test)$|^[^@]*\+clerk_test(\+[^@]*)?@|^[^@]*\+synthetic-([a-z0-9])[^@]*@|^[^@]*\+jovie-prod-waitlist-canary@|^[^@]*\+(canary|e2e|prodcert|dogfood)([-+._][^@]*)?@$jovie_pattern$;
--> statement-breakpoint
-- Data fix (receipt): the founder confirmed this zero-activity account is his own.
-- Its address carries no tag, so it is marked by id. No-op in any database
-- without this row; never overwrites an existing class.
UPDATE "users"
SET "account_class" = 'internal'
WHERE "id" = 'b1ac1315-4f4a-4fd0-9f91-e2aa3ae1ee0f'
  AND "account_class" IS NULL;
