-- Migration: add admin_costs table + costs_last_refreshed_at to admin_system_settings
-- v1 manual costs tracking per G-Brain naming.admin-operational-surfaces

ALTER TABLE "admin_system_settings" ADD COLUMN IF NOT EXISTS "costs_last_refreshed_at" timestamp;

CREATE TABLE IF NOT EXISTS "admin_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"monthly_usd" numeric(12, 2) DEFAULT '0' NOT NULL,
	"observed_30d_usd" numeric(12, 2) DEFAULT '0' NOT NULL,
	"period" text DEFAULT 'monthly' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"external_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_admin_costs_label" ON "admin_costs" ("label");
CREATE INDEX IF NOT EXISTS "idx_admin_costs_is_active" ON "admin_costs" ("is_active");
