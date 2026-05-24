DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merch_card_status') THEN
		CREATE TYPE "public"."merch_card_status" AS ENUM('draft', 'live', 'paused', 'archived', 'sold_out', 'failed');
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merch_design_lane') THEN
		CREATE TYPE "public"."merch_design_lane" AS ENUM('band_tour_uniform', 'fashion_graphic_item', 'artist_world_artifact');
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merch_design_option_status') THEN
		CREATE TYPE "public"."merch_design_option_status" AS ENUM('candidate', 'selected', 'rejected');
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merch_fulfillment_job_status') THEN
		CREATE TYPE "public"."merch_fulfillment_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'blocked');
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merch_generation_status') THEN
		CREATE TYPE "public"."merch_generation_status" AS ENUM('generating', 'ready', 'failed');
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merch_order_status') THEN
		CREATE TYPE "public"."merch_order_status" AS ENUM('checkout_created', 'paid', 'paid_fulfillment_hold', 'paid_fulfillment_failed', 'printful_draft_created', 'submitted_to_printful', 'fulfilling', 'shipped', 'delivered', 'cancelled', 'refunded', 'failed');
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merch_payout_status') THEN
		CREATE TYPE "public"."merch_payout_status" AS ENUM('accrued', 'held_for_refund_window', 'ready_to_pay', 'paid_manually', 'reversed');
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merch_technique') THEN
		CREATE TYPE "public"."merch_technique" AS ENUM('dtg', 'embroidery', 'cut_and_sew', 'sublimation', 'other');
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" ADD COLUMN IF NOT EXISTS "processing_started_at" timestamp;--> statement-breakpoint
CREATE TABLE "merch_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"created_by_clerk_user_id" text NOT NULL,
	"selected_design_option_id" uuid,
	"status" "merch_card_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"product_type" text NOT NULL,
	"primary_image_url" text NOT NULL,
	"mockup_urls" text[] DEFAULT '{}' NOT NULL,
	"printful" jsonb NOT NULL,
	"currency" "currency_code" DEFAULT 'USD' NOT NULL,
	"retail_price_cents" integer NOT NULL,
	"estimated_printful_product_cost_cents" integer NOT NULL,
	"estimated_shipping_cost_cents" integer DEFAULT 0 NOT NULL,
	"platform_fee_cents" integer DEFAULT 0 NOT NULL,
	"artist_royalty_rate_bps" integer DEFAULT 5000 NOT NULL,
	"artist_payout_per_unit_estimate_cents" integer DEFAULT 0 NOT NULL,
	"jovie_margin_per_unit_estimate_cents" integer DEFAULT 0 NOT NULL,
	"pricing" jsonb NOT NULL,
	"rank_score" integer DEFAULT 0 NOT NULL,
	"position" integer,
	"pinned" boolean DEFAULT false NOT NULL,
	"visibility_rules" jsonb DEFAULT '{"public":true,"fanSegments":[],"geoRules":[],"inventoryRules":[]}'::jsonb NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"add_to_carts" integer DEFAULT 0 NOT NULL,
	"purchases" integer DEFAULT 0 NOT NULL,
	"gross_revenue_cents" integer DEFAULT 0 NOT NULL,
	"gross_margin_cents" integer DEFAULT 0 NOT NULL,
	"artist_payout_accrued_cents" integer DEFAULT 0 NOT NULL,
	"learning" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp,
	"paused_at" timestamp,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "merch_design_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_batch_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"option_number" integer NOT NULL,
	"status" "merch_design_option_status" DEFAULT 'candidate' NOT NULL,
	"design_lane" "merch_design_lane" NOT NULL,
	"design_name" text NOT NULL,
	"product_type" text NOT NULL,
	"printful_product_name" text NOT NULL,
	"printful_catalog_product_id" integer NOT NULL,
	"printful_catalog_variant_ids" integer[] DEFAULT '{}' NOT NULL,
	"variant_map" jsonb NOT NULL,
	"colorway" text NOT NULL,
	"available_sizes" text[] DEFAULT '{}' NOT NULL,
	"placements" text[] DEFAULT '{}' NOT NULL,
	"technique" "merch_technique" DEFAULT 'dtg' NOT NULL,
	"retail_price_cents" integer NOT NULL,
	"estimated_printful_product_cost_cents" integer NOT NULL,
	"estimated_shipping_cost_cents" integer DEFAULT 0 NOT NULL,
	"estimated_gross_margin_cents" integer DEFAULT 0 NOT NULL,
	"artist_share_cents" integer DEFAULT 0 NOT NULL,
	"jovie_share_cents" integer DEFAULT 0 NOT NULL,
	"pricing" jsonb NOT NULL,
	"concept" text NOT NULL,
	"why_it_fits" text NOT NULL,
	"mockup_urls" text[] DEFAULT '{}' NOT NULL,
	"print_file_urls" text[] DEFAULT '{}' NOT NULL,
	"production_warnings" text[] DEFAULT '{}' NOT NULL,
	"quality_review" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"learning" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merch_fulfillment_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merch_order_id" uuid NOT NULL,
	"status" "merch_fulfillment_job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp DEFAULT now() NOT NULL,
	"locked_at" timestamp,
	"locked_by" text,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "merch_fulfillment_jobs_merch_order_id_unique" UNIQUE("merch_order_id")
);
--> statement-breakpoint
CREATE TABLE "merch_generation_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"created_by_clerk_user_id" text NOT NULL,
	"chat_conversation_id" uuid,
	"chat_turn_id" uuid,
	"prompt" text NOT NULL,
	"command" text DEFAULT 'create_merch' NOT NULL,
	"artist_brief" jsonb NOT NULL,
	"status" "merch_generation_status" DEFAULT 'generating' NOT NULL,
	"error" text,
	"selected_option_id" uuid,
	"selected_merch_card_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "merch_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"merch_card_id" uuid NOT NULL,
	"status" "merch_order_status" DEFAULT 'checkout_created' NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"printful_order_id" text,
	"printful_external_id" text,
	"printful_status" text,
	"selected_variant_id" integer NOT NULL,
	"selected_variant_key" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"buyer_email" text,
	"buyer_name" text,
	"shipping_address" jsonb,
	"currency" "currency_code" DEFAULT 'USD' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"shipping_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"stripe_fee_estimate_cents" integer DEFAULT 0 NOT NULL,
	"printful_product_cost_cents" integer DEFAULT 0 NOT NULL,
	"printful_shipping_cost_cents" integer DEFAULT 0 NOT NULL,
	"refund_reserve_cents" integer DEFAULT 0 NOT NULL,
	"artist_payout_estimate_cents" integer DEFAULT 0 NOT NULL,
	"jovie_share_estimate_cents" integer DEFAULT 0 NOT NULL,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	"fulfilled_at" timestamp,
	"shipped_at" timestamp,
	"delivered_at" timestamp,
	"refunded_at" timestamp,
	CONSTRAINT "merch_orders_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id"),
	CONSTRAINT "merch_orders_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "merch_orders_printful_order_id_unique" UNIQUE("printful_order_id"),
	CONSTRAINT "merch_orders_printful_external_id_unique" UNIQUE("printful_external_id")
);
--> statement-breakpoint
CREATE TABLE "merch_payout_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"merch_order_id" uuid NOT NULL,
	"merch_card_id" uuid NOT NULL,
	"gross_sale_cents" integer NOT NULL,
	"tax_collected_cents" integer DEFAULT 0 NOT NULL,
	"shipping_collected_cents" integer DEFAULT 0 NOT NULL,
	"stripe_fee_estimate_cents" integer DEFAULT 0 NOT NULL,
	"printful_product_cost_cents" integer DEFAULT 0 NOT NULL,
	"printful_shipping_cost_cents" integer DEFAULT 0 NOT NULL,
	"refund_reserve_cents" integer DEFAULT 0 NOT NULL,
	"net_profit_estimate_cents" integer DEFAULT 0 NOT NULL,
	"artist_share_cents" integer DEFAULT 0 NOT NULL,
	"jovie_share_cents" integer DEFAULT 0 NOT NULL,
	"payout_status" "merch_payout_status" DEFAULT 'held_for_refund_window' NOT NULL,
	"payout_batch_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ready_at" timestamp,
	"paid_at" timestamp,
	"reversed_at" timestamp,
	CONSTRAINT "merch_payout_ledger_entries_merch_order_id_unique" UNIQUE("merch_order_id")
);
--> statement-breakpoint
ALTER TABLE "merch_cards" ADD CONSTRAINT "merch_cards_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_cards" ADD CONSTRAINT "merch_cards_selected_design_option_id_merch_design_options_id_fk" FOREIGN KEY ("selected_design_option_id") REFERENCES "public"."merch_design_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_design_options" ADD CONSTRAINT "merch_design_options_generation_batch_id_merch_generation_batches_id_fk" FOREIGN KEY ("generation_batch_id") REFERENCES "public"."merch_generation_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_design_options" ADD CONSTRAINT "merch_design_options_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_fulfillment_jobs" ADD CONSTRAINT "merch_fulfillment_jobs_merch_order_id_merch_orders_id_fk" FOREIGN KEY ("merch_order_id") REFERENCES "public"."merch_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_generation_batches" ADD CONSTRAINT "merch_generation_batches_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_generation_batches" ADD CONSTRAINT "merch_generation_batches_chat_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("chat_conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_generation_batches" ADD CONSTRAINT "merch_generation_batches_chat_turn_id_chat_turns_id_fk" FOREIGN KEY ("chat_turn_id") REFERENCES "public"."chat_turns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_generation_batches" ADD CONSTRAINT "merch_generation_batches_selected_option_id_merch_design_options_id_fk" FOREIGN KEY ("selected_option_id") REFERENCES "public"."merch_design_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_generation_batches" ADD CONSTRAINT "merch_generation_batches_selected_merch_card_id_merch_cards_id_fk" FOREIGN KEY ("selected_merch_card_id") REFERENCES "public"."merch_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_orders" ADD CONSTRAINT "merch_orders_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_orders" ADD CONSTRAINT "merch_orders_merch_card_id_merch_cards_id_fk" FOREIGN KEY ("merch_card_id") REFERENCES "public"."merch_cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_payout_ledger_entries" ADD CONSTRAINT "merch_payout_ledger_entries_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_payout_ledger_entries" ADD CONSTRAINT "merch_payout_ledger_entries_merch_order_id_merch_orders_id_fk" FOREIGN KEY ("merch_order_id") REFERENCES "public"."merch_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_payout_ledger_entries" ADD CONSTRAINT "merch_payout_ledger_entries_merch_card_id_merch_cards_id_fk" FOREIGN KEY ("merch_card_id") REFERENCES "public"."merch_cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merch_cards_creator_status_rank_idx" ON "merch_cards" USING btree ("creator_profile_id","status","rank_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merch_cards_live_idx" ON "merch_cards" USING btree ("creator_profile_id","rank_score") WHERE status = 'live';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "merch_design_options_batch_option_unique" ON "merch_design_options" USING btree ("generation_batch_id","option_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merch_design_options_creator_status_idx" ON "merch_design_options" USING btree ("creator_profile_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merch_fulfillment_jobs_status_next_run_idx" ON "merch_fulfillment_jobs" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merch_generation_batches_creator_created_idx" ON "merch_generation_batches" USING btree ("creator_profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merch_generation_batches_status_created_idx" ON "merch_generation_batches" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merch_orders_card_created_idx" ON "merch_orders" USING btree ("merch_card_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merch_orders_creator_status_idx" ON "merch_orders" USING btree ("creator_profile_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merch_payout_creator_status_idx" ON "merch_payout_ledger_entries" USING btree ("creator_profile_id","payout_status");
