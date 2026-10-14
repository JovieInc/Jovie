CREATE TABLE "dogfooder_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dogfooder_id" uuid NOT NULL,
	"product" text NOT NULL,
	"account_subject" text NOT NULL,
	"session_subject" text,
	"device_subject" text,
	"binding_key" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dogfooders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_key" text NOT NULL,
	"actor_kind" text NOT NULL,
	"display_name" text NOT NULL,
	"tier" text,
	"products" text[] DEFAULT '{}' NOT NULL,
	"channel" text,
	"handle" text,
	"jovie_user_id" uuid,
	"consent" jsonb NOT NULL,
	"signal_state" text DEFAULT 'invited' NOT NULL,
	"vouched_by" text,
	"calibration" jsonb,
	"contact_budget" jsonb DEFAULT '{"maxContacts":1,"windowDays":7}'::jsonb NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"allowed_modes" text[] DEFAULT '{"customer_control","early_access"}' NOT NULL,
	"agent_surfaces" text[] DEFAULT '{}' NOT NULL,
	"membership_expires_at" timestamp with time zone,
	"last_contacted_at" timestamp with time zone,
	"last_feedback_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dogfooders_products_check" CHECK (cardinality("dogfooders"."products") > 0 AND "dogfooders"."products" <@ ARRAY['jov', 'lyb', 'ovie']::text[]),
	CONSTRAINT "dogfooders_allowed_modes_check" CHECK (cardinality("dogfooders"."allowed_modes") > 0 AND "dogfooders"."allowed_modes" <@ ARRAY['customer_control', 'early_access']::text[]),
	CONSTRAINT "dogfooders_agent_surfaces_check" CHECK ("dogfooders"."agent_surfaces" <@ ARRAY['api', 'browser', 'cli', 'cloud', 'local', 'mcp', 'native']::text[]),
	CONSTRAINT "dogfooders_actor_tier_check" CHECK (("dogfooders"."actor_kind" = 'agent' AND "dogfooders"."tier" IS NULL) OR ("dogfooders"."actor_kind" <> 'agent'))
);
--> statement-breakpoint
ALTER TABLE "dogfooder_bindings" ADD CONSTRAINT "dogfooder_bindings_dogfooder_id_dogfooders_id_fk" FOREIGN KEY ("dogfooder_id") REFERENCES "public"."dogfooders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dogfooders" ADD CONSTRAINT "dogfooders_jovie_user_id_users_id_fk" FOREIGN KEY ("jovie_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dogfooder_bindings_key_unique" ON "dogfooder_bindings" USING btree ("binding_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dogfooder_bindings_account_unique" ON "dogfooder_bindings" USING btree ("product","account_subject") WHERE "dogfooder_bindings"."session_subject" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dogfooder_bindings_session_unique" ON "dogfooder_bindings" USING btree ("product","session_subject") WHERE "dogfooder_bindings"."session_subject" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dogfooder_bindings_account_idx" ON "dogfooder_bindings" USING btree ("product","account_subject");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dogfooder_bindings_dogfooder_idx" ON "dogfooder_bindings" USING btree ("dogfooder_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dogfooders_actor_key_unique" ON "dogfooders" USING btree ("actor_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dogfooders_jovie_user_unique" ON "dogfooders" USING btree ("jovie_user_id") WHERE "dogfooders"."jovie_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dogfooders_state_idx" ON "dogfooders" USING btree ("signal_state");
