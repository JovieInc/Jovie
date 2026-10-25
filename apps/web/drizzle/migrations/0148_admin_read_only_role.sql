-- Read-only operator role. NOT VALID: the column is new and null for every existing row,
-- so both checks hold trivially; this avoids a full scan lock on users (Squawk).
ALTER TABLE "users" ADD COLUMN "admin_role" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_admin_role_check" CHECK ("users"."admin_role" IS NULL OR "users"."admin_role" = 'read_only') NOT VALID;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_admin_role_exclusive_check" CHECK (NOT ("users"."is_admin" AND "users"."admin_role" IS NOT NULL)) NOT VALID;