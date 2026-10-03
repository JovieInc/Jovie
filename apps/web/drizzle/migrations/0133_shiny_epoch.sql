ALTER TABLE "lead_pipeline_settings" ALTER COLUMN "dm_template" SET DEFAULT 'Hey {displayName}! I found your Linktree and built Jovie to give creators a better link-in-bio. Here''s your free page: {claimLink}';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "outreach_consent_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "outreach_consent_source" text;
