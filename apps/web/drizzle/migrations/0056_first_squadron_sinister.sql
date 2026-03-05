CREATE TABLE "campaign_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"fit_score_threshold" numeric(5, 2) DEFAULT '50' NOT NULL,
	"batch_limit" integer DEFAULT 20 NOT NULL,
	"throttling_config" jsonb DEFAULT '{"minDelayMs":30000,"maxDelayMs":120000,"maxPerHour":30}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "discog_releases" ADD COLUMN "genres" text[];--> statement-breakpoint
ALTER TABLE "discog_releases" ADD COLUMN "copyright_line" text;--> statement-breakpoint
ALTER TABLE "discog_releases" ADD COLUMN "distributor" text;