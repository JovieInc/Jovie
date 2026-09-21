CREATE TABLE IF NOT EXISTS "ba_oauth_client_assertions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ba_oauth_client_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ba_oauth_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"access_token_ttl" integer,
	"refresh_token_ttl" integer,
	"signing_algorithm" text,
	"signing_key_id" text,
	"allowed_scopes" jsonb,
	"custom_claims" jsonb,
	"dpop_bound_access_tokens_required" boolean DEFAULT false,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"policy_version" integer DEFAULT 1,
	"metadata" jsonb,
	CONSTRAINT "ba_oauth_resources_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
ALTER TABLE "ba_oauth_clients" ADD COLUMN IF NOT EXISTS "client_discovery_id" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_clients" ADD COLUMN IF NOT EXISTS "client_credentials_scopes" jsonb;--> statement-breakpoint
ALTER TABLE "ba_oauth_clients" ADD COLUMN IF NOT EXISTS "application_type" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_client_resources" DROP CONSTRAINT IF EXISTS "ba_oauth_client_resources_client_id_ba_oauth_clients_client_id_fk";--> statement-breakpoint
ALTER TABLE "ba_oauth_client_resources" DROP CONSTRAINT IF EXISTS "ba_oauth_client_resources_resource_id_ba_oauth_resources_identifier_fk";--> statement-breakpoint
ALTER TABLE "ba_oauth_client_resources" ADD CONSTRAINT "ba_oauth_client_resources_client_id_ba_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."ba_oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_client_resources" ADD CONSTRAINT "ba_oauth_client_resources_resource_id_ba_oauth_resources_identifier_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."ba_oauth_resources"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_oauth_client_resources_client_id" ON "ba_oauth_client_resources" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_oauth_client_resources_resource_id" ON "ba_oauth_client_resources" USING btree ("resource_id");