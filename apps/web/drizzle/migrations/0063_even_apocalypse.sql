CREATE TABLE "feature_flag_overrides" (
	"flag_key" text PRIMARY KEY NOT NULL,
	"dev_enabled" boolean,
	"staging_enabled" boolean,
	"prod_enabled" boolean,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);