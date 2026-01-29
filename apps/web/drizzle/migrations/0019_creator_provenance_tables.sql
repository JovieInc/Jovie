CREATE TABLE IF NOT EXISTS "creator_avatar_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"source_platform" text NOT NULL,
	"source_url" text,
	"avatar_url" text NOT NULL,
	"confidence_score" numeric(4, 3) DEFAULT '0.700' NOT NULL,
	"color_palette" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "creator_profile_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"source_platform" text NOT NULL,
	"source_url" text,
	"display_name" text,
	"bio" text,
	"confidence_score" numeric(4, 3) DEFAULT '0.700' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creator_avatar_candidates_creator_profile_id_fk') THEN
    ALTER TABLE "creator_avatar_candidates" ADD CONSTRAINT "creator_avatar_candidates_creator_profile_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creator_profile_attributes_creator_profile_id_fk') THEN
    ALTER TABLE "creator_profile_attributes" ADD CONSTRAINT "creator_profile_attributes_creator_profile_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_creator_avatar_candidates_profile_id" ON "creator_avatar_candidates" USING btree ("creator_profile_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_creator_avatar_candidates_unique" ON "creator_avatar_candidates" USING btree ("creator_profile_id", "avatar_url");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profile_attributes_profile_id" ON "creator_profile_attributes" USING btree ("creator_profile_id", "created_at");
