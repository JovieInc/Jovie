ALTER TABLE "ba_oauth_access_tokens" ADD COLUMN "authorization_code_id" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_tokens" ADD COLUMN "resources" jsonb;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_tokens" ADD COLUMN "requested_user_info_claims" jsonb;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_tokens" ADD COLUMN "revoked" timestamp;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_tokens" ADD COLUMN "confirmation" jsonb;--> statement-breakpoint
ALTER TABLE "ba_oauth_clients" ADD COLUMN "backchannel_logout_uri" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_clients" ADD COLUMN "backchannel_logout_session_required" boolean;--> statement-breakpoint
ALTER TABLE "ba_oauth_clients" ADD COLUMN "jwks" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_clients" ADD COLUMN "jwks_uri" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_clients" ADD COLUMN "dpop_bound_access_tokens" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "ba_oauth_consents" ADD COLUMN "resources" jsonb;--> statement-breakpoint
ALTER TABLE "ba_oauth_consents" ADD COLUMN "requested_user_info_claims" jsonb;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_tokens" ADD COLUMN "authorization_code_id" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_tokens" ADD COLUMN "resources" jsonb;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_tokens" ADD COLUMN "requested_user_info_claims" jsonb;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_tokens" ADD COLUMN "rotated_at" timestamp;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_tokens" ADD COLUMN "rotation_replay_response" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_tokens" ADD COLUMN "rotation_replay_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_tokens" ADD COLUMN "confirmation" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_oauth_access_tokens_authorization_code_id" ON "ba_oauth_access_tokens" USING btree ("authorization_code_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_oauth_refresh_tokens_authorization_code_id" ON "ba_oauth_refresh_tokens" USING btree ("authorization_code_id");
