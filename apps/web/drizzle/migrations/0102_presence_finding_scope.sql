ALTER TABLE "library_presence_findings" ADD COLUMN "scope_type" text;--> statement-breakpoint
ALTER TABLE "library_presence_findings" ADD COLUMN "scope_id" text;--> statement-breakpoint
ALTER TABLE "library_presence_findings" ADD COLUMN "category" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_presence_findings_scope_idx" ON "library_presence_findings" ("creator_profile_id","scope_type","scope_id");--> statement-breakpoint
