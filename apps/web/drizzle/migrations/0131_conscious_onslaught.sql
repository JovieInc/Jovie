CREATE TYPE "public"."press_coverage_excerpt_kind" AS ENUM('excerpt', 'creator_summary');--> statement-breakpoint
CREATE TYPE "public"."press_coverage_provenance" AS ENUM('verified_inspection', 'creator_attested');--> statement-breakpoint
CREATE TYPE "public"."press_coverage_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "press_coverages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"release_id" uuid,
	"source_url" text NOT NULL,
	"publisher_domain" text NOT NULL,
	"publisher_name" text,
	"headline" text,
	"published_at" timestamp with time zone,
	"excerpt" text,
	"excerpt_kind" "press_coverage_excerpt_kind" DEFAULT 'creator_summary' NOT NULL,
	"provenance" "press_coverage_provenance" NOT NULL,
	"mention_verified" boolean DEFAULT false NOT NULL,
	"inspection" jsonb NOT NULL,
	"outbound_source_link_id" uuid,
	"experiment_key" text DEFAULT 'LAUNCH-AUDIENCE-2026-10-01/press-to-audience' NOT NULL,
	"status" "press_coverage_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "press_coverages" ADD CONSTRAINT "press_coverages_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_coverages" ADD CONSTRAINT "press_coverages_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_coverages" ADD CONSTRAINT "press_coverages_outbound_source_link_id_audience_source_links_id_fk" FOREIGN KEY ("outbound_source_link_id") REFERENCES "public"."audience_source_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "press_coverages_slug_unique" ON "press_coverages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "press_coverages_creator_profile_status_idx" ON "press_coverages" USING btree ("creator_profile_id","status");