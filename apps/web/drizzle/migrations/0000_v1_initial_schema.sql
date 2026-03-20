DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'artist_role') THEN
    CREATE TYPE "public"."artist_role" AS ENUM('main_artist', 'featured_artist', 'remixer', 'producer', 'co_producer', 'composer', 'lyricist', 'arranger', 'conductor', 'mix_engineer', 'mastering_engineer', 'vs', 'with', 'other');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'artist_type') THEN
    CREATE TYPE "public"."artist_type" AS ENUM('person', 'group', 'orchestra', 'choir', 'character', 'other');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audience_device_type') THEN
    CREATE TYPE "public"."audience_device_type" AS ENUM('mobile', 'desktop', 'tablet', 'unknown');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audience_intent_level') THEN
    CREATE TYPE "public"."audience_intent_level" AS ENUM('high', 'medium', 'low');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audience_member_type') THEN
    CREATE TYPE "public"."audience_member_type" AS ENUM('anonymous', 'email', 'sms', 'spotify', 'customer');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_message_role') THEN
    CREATE TYPE "public"."chat_message_role" AS ENUM('user', 'assistant');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'claim_invite_status') THEN
    CREATE TYPE "public"."claim_invite_status" AS ENUM('pending', 'scheduled', 'sending', 'sent', 'bounced', 'failed', 'unsubscribed');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_channel') THEN
    CREATE TYPE "public"."contact_channel" AS ENUM('email', 'phone');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_role') THEN
    CREATE TYPE "public"."contact_role" AS ENUM('bookings', 'management', 'press_pr', 'brand_partnerships', 'music_collaboration', 'fan_general', 'other');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_slug_type') THEN
    CREATE TYPE "public"."content_slug_type" AS ENUM('release', 'track', 'release_track');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'creator_type') THEN
    CREATE TYPE "public"."creator_type" AS ENUM('artist', 'podcaster', 'influencer', 'creator');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'currency_code') THEN
    CREATE TYPE "public"."currency_code" AS ENUM('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_status') THEN
    CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'suppressed');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discog_release_type') THEN
    CREATE TYPE "public"."discog_release_type" AS ENUM('single', 'ep', 'album', 'compilation', 'live', 'mixtape', 'other');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dsp_bio_sync_method') THEN
    CREATE TYPE "public"."dsp_bio_sync_method" AS ENUM('api', 'email');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dsp_bio_sync_status') THEN
    CREATE TYPE "public"."dsp_bio_sync_status" AS ENUM('pending', 'sending', 'sent', 'delivered', 'failed', 'unsupported');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dsp_match_status') THEN
    CREATE TYPE "public"."dsp_match_status" AS ENUM('suggested', 'confirmed', 'rejected', 'auto_confirmed');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_email_category') THEN
    CREATE TYPE "public"."inbox_email_category" AS ENUM('booking', 'music_collaboration', 'brand_partnership', 'management', 'fan_mail', 'personal', 'press', 'business', 'spam', 'other');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_outbound_sent_by') THEN
    CREATE TYPE "public"."inbox_outbound_sent_by" AS ENUM('jovie_routing');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_thread_priority') THEN
    CREATE TYPE "public"."inbox_thread_priority" AS ENUM('high', 'medium', 'low');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_thread_status') THEN
    CREATE TYPE "public"."inbox_thread_status" AS ENUM('pending_review', 'routed', 'routing_failed', 'in_progress', 'resolved', 'archived');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingestion_job_status') THEN
    CREATE TYPE "public"."ingestion_job_status" AS ENUM('pending', 'processing', 'succeeded', 'failed');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingestion_source_type') THEN
    CREATE TYPE "public"."ingestion_source_type" AS ENUM('manual', 'admin', 'ingested');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingestion_status') THEN
    CREATE TYPE "public"."ingestion_status" AS ENUM('idle', 'pending', 'processing', 'failed');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insight_category') THEN
    CREATE TYPE "public"."insight_category" AS ENUM('geographic', 'growth', 'content', 'revenue', 'tour', 'platform', 'engagement', 'timing');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insight_priority') THEN
    CREATE TYPE "public"."insight_priority" AS ENUM('high', 'medium', 'low');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insight_run_status') THEN
    CREATE TYPE "public"."insight_run_status" AS ENUM('pending', 'processing', 'completed', 'failed');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insight_status') THEN
    CREATE TYPE "public"."insight_status" AS ENUM('active', 'dismissed', 'acted_on', 'expired');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insight_type') THEN
    CREATE TYPE "public"."insight_type" AS ENUM('city_growth', 'new_market', 'declining_market', 'tour_gap', 'tour_timing', 'subscriber_surge', 'subscriber_churn', 'release_momentum', 'platform_preference', 'referrer_surge', 'tip_hotspot', 'engagement_quality', 'peak_activity', 'capture_rate_change', 'device_shift');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'investor_stage') THEN
    CREATE TYPE "public"."investor_stage" AS ENUM('shared', 'viewed', 'engaged', 'meeting_booked', 'committed', 'wired', 'passed', 'declined');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_discovery_source') THEN
    CREATE TYPE "public"."lead_discovery_source" AS ENUM('google_cse', 'manual');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_outreach_route') THEN
    CREATE TYPE "public"."lead_outreach_route" AS ENUM('email', 'dm', 'both', 'manual_review', 'skipped');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_outreach_status') THEN
    CREATE TYPE "public"."lead_outreach_status" AS ENUM('pending', 'queued', 'sent', 'failed', 'dm_sent', 'dismissed');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status') THEN
    CREATE TYPE "public"."lead_status" AS ENUM('discovered', 'qualified', 'disqualified', 'approved', 'ingested', 'rejected');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'link_type') THEN
    CREATE TYPE "public"."link_type" AS ENUM('listen', 'social', 'tip', 'other');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_channel') THEN
    CREATE TYPE "public"."notification_channel" AS ENUM('email', 'sms', 'push');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outreach_channel') THEN
    CREATE TYPE "public"."outreach_channel" AS ENUM('instagram', 'twitter');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outreach_status') THEN
    CREATE TYPE "public"."outreach_status" AS ENUM('pending', 'dm_generated', 'dm_sent', 'responded');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'photo_status') THEN
    CREATE TYPE "public"."photo_status" AS ENUM('uploading', 'processing', 'ready', 'failed');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pixel_event_type') THEN
    CREATE TYPE "public"."pixel_event_type" AS ENUM('page_view', 'link_click', 'form_submit', 'scroll_depth', 'tip_page_view', 'tip_intent');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pixel_forward_status') THEN
    CREATE TYPE "public"."pixel_forward_status" AS ENUM('pending', 'sent', 'failed');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_claim_role') THEN
    CREATE TYPE "public"."profile_claim_role" AS ENUM('owner', 'manager', 'viewer');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_ownership_action') THEN
    CREATE TYPE "public"."profile_ownership_action" AS ENUM('claimed', 'linked', 'unlinked', 'transferred', 'role_changed');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provider_kind') THEN
    CREATE TYPE "public"."provider_kind" AS ENUM('music_streaming', 'video', 'social', 'retail', 'other');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provider_link_owner_type') THEN
    CREATE TYPE "public"."provider_link_owner_type" AS ENUM('release', 'track', 'release_track');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_commission_status') THEN
    CREATE TYPE "public"."referral_commission_status" AS ENUM('pending', 'approved', 'paid', 'cancelled');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_status') THEN
    CREATE TYPE "public"."referral_status" AS ENUM('pending', 'active', 'churned', 'expired');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'release_notification_status') THEN
    CREATE TYPE "public"."release_notification_status" AS ENUM('pending', 'scheduled', 'sending', 'sent', 'failed', 'cancelled');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'release_notification_type') THEN
    CREATE TYPE "public"."release_notification_type" AS ENUM('preview', 'release_day');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'release_task_assignee_type') THEN
    CREATE TYPE "public"."release_task_assignee_type" AS ENUM('human', 'ai_workflow');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'release_task_priority') THEN
    CREATE TYPE "public"."release_task_priority" AS ENUM('urgent', 'high', 'medium', 'low', 'none');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'release_task_status') THEN
    CREATE TYPE "public"."release_task_status" AS ENUM('backlog', 'todo', 'in_progress', 'done', 'cancelled');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scraper_strategy') THEN
    CREATE TYPE "public"."scraper_strategy" AS ENUM('http', 'browser', 'api');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sender_status') THEN
    CREATE TYPE "public"."sender_status" AS ENUM('good', 'warning', 'probation', 'suspended', 'banned');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_account_status') THEN
    CREATE TYPE "public"."social_account_status" AS ENUM('suspected', 'confirmed', 'rejected');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_link_state') THEN
    CREATE TYPE "public"."social_link_state" AS ENUM('active', 'suggested', 'rejected');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_suggestion_status') THEN
    CREATE TYPE "public"."social_suggestion_status" AS ENUM('pending', 'accepted', 'rejected', 'email_sent', 'expired');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_plan') THEN
    CREATE TYPE "public"."subscription_plan" AS ENUM('free', 'basic', 'premium', 'pro');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE "public"."subscription_status" AS ENUM('active', 'inactive', 'cancelled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suppression_reason') THEN
    CREATE TYPE "public"."suppression_reason" AS ENUM('hard_bounce', 'soft_bounce', 'spam_complaint', 'invalid_address', 'user_request', 'abuse', 'legal');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'theme_mode') THEN
    CREATE TYPE "public"."theme_mode" AS ENUM('system', 'light', 'dark');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
    CREATE TYPE "public"."ticket_status" AS ENUM('available', 'sold_out', 'cancelled');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tip_audience_source') THEN
    CREATE TYPE "public"."tip_audience_source" AS ENUM('tip', 'link_click', 'save', 'manual');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tip_status') THEN
    CREATE TYPE "public"."tip_status" AS ENUM('pending', 'completed', 'failed', 'refunded');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tour_date_provider') THEN
    CREATE TYPE "public"."tour_date_provider" AS ENUM('bandsintown', 'songkick', 'manual');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status_lifecycle') THEN
    CREATE TYPE "public"."user_status_lifecycle" AS ENUM('waitlist_pending', 'waitlist_approved', 'profile_claimed', 'onboarding_incomplete', 'active', 'suspended', 'banned');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_invite_status') THEN
    CREATE TYPE "public"."waitlist_invite_status" AS ENUM('pending', 'sending', 'sent', 'failed');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status') THEN
    CREATE TYPE "public"."waitlist_status" AS ENUM('new', 'invited', 'claimed');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"target_user_id" uuid,
	"action" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"insight_type" "insight_type" NOT NULL,
	"category" "insight_category" NOT NULL,
	"priority" "insight_priority" DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"action_suggestion" text,
	"confidence" numeric(3, 2) NOT NULL,
	"data_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"comparison_period_start" timestamp with time zone,
	"comparison_period_end" timestamp with time zone,
	"status" "insight_status" DEFAULT 'active' NOT NULL,
	"dismissed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"generation_run_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"sort_name" text,
	"disambiguation" text,
	"artist_type" "artist_type" DEFAULT 'person',
	"spotify_id" text,
	"apple_music_id" text,
	"musicbrainz_id" text,
	"deezer_id" text,
	"image_url" text,
	"is_auto_created" boolean DEFAULT false NOT NULL,
	"match_confidence" numeric(5, 4),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"type" "audience_member_type" DEFAULT 'anonymous' NOT NULL,
	"display_name" text,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	"engagement_score" integer DEFAULT 0 NOT NULL,
	"intent_level" "audience_intent_level" DEFAULT 'low' NOT NULL,
	"geo_city" text,
	"geo_country" text,
	"device_type" "audience_device_type" DEFAULT 'unknown' NOT NULL,
	"referrer_history" jsonb DEFAULT '[]'::jsonb,
	"latest_actions" jsonb DEFAULT '[]'::jsonb,
	"email" text,
	"phone" text,
	"spotify_connected" boolean DEFAULT false NOT NULL,
	"purchase_count" integer DEFAULT 0 NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"utm_params" jsonb DEFAULT '{}'::jsonb,
	"fingerprint" text,
	"attribution_source" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"previous_state" jsonb DEFAULT '{}'::jsonb,
	"new_state" jsonb DEFAULT '{}'::jsonb,
	"stripe_event_id" text,
	"source" text DEFAULT 'webhook' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_sequence_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"recipient_hash" text NOT NULL,
	"current_step" text DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"stop_reason" text,
	"step_completed_at" jsonb DEFAULT '{}'::jsonb,
	"next_step_at" timestamp,
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" text DEFAULT 'true' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_sequences_campaign_key_unique" UNIQUE("campaign_key")
);
--> statement-breakpoint
CREATE TABLE "campaign_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"campaigns_enabled" boolean DEFAULT true NOT NULL,
	"fit_score_threshold" numeric(5, 2) DEFAULT '50' NOT NULL,
	"batch_limit" integer DEFAULT 20 NOT NULL,
	"throttling_config" jsonb DEFAULT '{"minDelayMs":30000,"maxDelayMs":120000,"maxPerHour":30}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "category_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" text NOT NULL,
	"category_key" text NOT NULL,
	"subscribed" boolean DEFAULT true NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"conversation_id" uuid,
	"message_id" uuid,
	"action" text NOT NULL,
	"field" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"title" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "chat_message_role" NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "click_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"link_id" uuid,
	"link_type" "link_type" NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"referrer" text,
	"country" text,
	"city" text,
	"device_type" text,
	"os" text,
	"browser" text,
	"is_bot" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"audience_member_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_slug_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"old_slug" text NOT NULL,
	"content_type" "content_slug_type" NOT NULL,
	"release_id" uuid,
	"track_id" uuid,
	"release_track_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "content_slug_redirects_content_match" CHECK (
        (content_type::text = 'release' AND release_id IS NOT NULL AND track_id IS NULL AND release_track_id IS NULL)
        OR (content_type::text = 'track' AND track_id IS NOT NULL AND release_id IS NULL AND release_track_id IS NULL)
        OR (content_type::text = 'release_track' AND release_track_id IS NOT NULL AND release_id IS NULL AND track_id IS NULL)
      )
);
--> statement-breakpoint
CREATE TABLE "creator_avatar_candidates" (
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
CREATE TABLE "creator_claim_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"creator_contact_id" uuid,
	"email" text NOT NULL,
	"status" "claim_invite_status" DEFAULT 'pending' NOT NULL,
	"send_at" timestamp,
	"sent_at" timestamp,
	"error" text,
	"subject" text,
	"body" text,
	"ai_variant_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"role" "contact_role" NOT NULL,
	"custom_label" text,
	"person_name" text,
	"company_name" text,
	"territories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"email" text,
	"phone" text,
	"preferred_channel" "contact_channel",
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"forward_inbox_emails" boolean DEFAULT false NOT NULL,
	"auto_mark_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_email_quotas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"daily_sent" integer DEFAULT 0 NOT NULL,
	"monthly_sent" integer DEFAULT 0 NOT NULL,
	"daily_limit" integer DEFAULT 1000 NOT NULL,
	"monthly_limit" integer DEFAULT 25000 NOT NULL,
	"daily_reset_at" timestamp NOT NULL,
	"monthly_reset_at" timestamp NOT NULL,
	"has_custom_limits" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creator_email_quotas_creator_profile_id_unique" UNIQUE("creator_profile_id")
);
--> statement-breakpoint
CREATE TABLE "creator_pixels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"facebook_pixel_id" text,
	"facebook_access_token" text,
	"google_measurement_id" text,
	"google_api_secret" text,
	"tiktok_pixel_id" text,
	"tiktok_access_token" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"facebook_enabled" boolean DEFAULT true NOT NULL,
	"google_enabled" boolean DEFAULT true NOT NULL,
	"tiktok_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_profile_attributes" (
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
CREATE TABLE "creator_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"waitlist_entry_id" uuid,
	"creator_type" "creator_type" NOT NULL,
	"username" text NOT NULL,
	"username_normalized" text NOT NULL,
	"display_name" text,
	"bio" text,
	"venmo_handle" text,
	"avatar_url" text,
	"spotify_url" text,
	"apple_music_url" text,
	"youtube_url" text,
	"spotify_id" text,
	"apple_music_id" text,
	"youtube_music_id" text,
	"deezer_id" text,
	"tidal_id" text,
	"soundcloud_id" text,
	"musicbrainz_id" text,
	"bandsintown_artist_name" text,
	"bandsintown_api_key" text,
	"is_public" boolean DEFAULT true,
	"is_verified" boolean DEFAULT false,
	"is_featured" boolean DEFAULT false,
	"marketing_opt_out" boolean DEFAULT false,
	"is_claimed" boolean DEFAULT false,
	"claim_token" text,
	"claimed_at" timestamp,
	"claim_token_expires_at" timestamp,
	"claimed_from_ip" text,
	"claimed_user_agent" text,
	"avatar_locked_by_user" boolean DEFAULT false NOT NULL,
	"display_name_locked" boolean DEFAULT false NOT NULL,
	"username_locked_at" timestamp,
	"ingestion_status" "ingestion_status" DEFAULT 'idle' NOT NULL,
	"last_ingestion_error" text,
	"profile_views" integer DEFAULT 0,
	"onboarding_completed_at" timestamp,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"theme" jsonb DEFAULT '{}'::jsonb,
	"notification_preferences" jsonb DEFAULT '{"releasePreview":true,"releaseDay":true,"dspMatchSuggested":true,"socialLinkSuggested":true,"enrichmentComplete":false,"newReleaseDetected":true}'::jsonb,
	"fit_score" integer,
	"fit_score_breakdown" jsonb,
	"fit_score_updated_at" timestamp,
	"genres" text[],
	"location" text,
	"active_since_year" integer,
	"spotify_followers" integer,
	"spotify_popularity" integer,
	"ingestion_source_platform" text,
	"outreach_status" "outreach_status" DEFAULT 'pending',
	"outreach_channel" "outreach_channel",
	"dm_sent_at" timestamp,
	"dm_copy" text,
	"stripe_account_id" text,
	"stripe_onboarding_complete" boolean DEFAULT false NOT NULL,
	"stripe_payouts_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_sending_reputation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_delivered" integer DEFAULT 0 NOT NULL,
	"total_bounced" integer DEFAULT 0 NOT NULL,
	"total_complaints" integer DEFAULT 0 NOT NULL,
	"recent_sent" integer DEFAULT 0 NOT NULL,
	"recent_bounced" integer DEFAULT 0 NOT NULL,
	"recent_complaints" integer DEFAULT 0 NOT NULL,
	"bounce_rate" real DEFAULT 0 NOT NULL,
	"complaint_rate" real DEFAULT 0 NOT NULL,
	"status" "sender_status" DEFAULT 'good' NOT NULL,
	"suspended_at" timestamp,
	"suspended_until" timestamp,
	"suspension_reason" text,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"last_warning_at" timestamp,
	"rolling_window_reset_at" timestamp NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creator_sending_reputation_creator_profile_id_unique" UNIQUE("creator_profile_id")
);
--> statement-breakpoint
CREATE TABLE "daily_profile_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"view_date" date NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discog_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"isrc" text,
	"duration_ms" integer,
	"is_explicit" boolean DEFAULT false NOT NULL,
	"preview_url" text,
	"audio_url" text,
	"audio_format" text,
	"lyrics" text,
	"source_type" "ingestion_source_type" DEFAULT 'manual' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discog_release_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"recording_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"track_number" integer NOT NULL,
	"disc_number" integer DEFAULT 1 NOT NULL,
	"is_explicit" boolean DEFAULT false NOT NULL,
	"source_type" "ingestion_source_type" DEFAULT 'manual' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discog_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"release_type" "discog_release_type" DEFAULT 'single' NOT NULL,
	"release_date" timestamp,
	"label" text,
	"upc" text,
	"total_tracks" integer DEFAULT 0 NOT NULL,
	"is_explicit" boolean DEFAULT false NOT NULL,
	"genres" text[],
	"copyright_line" text,
	"distributor" text,
	"artwork_url" text,
	"spotify_popularity" integer,
	"source_type" "ingestion_source_type" DEFAULT 'manual' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discog_releases_spotify_popularity_range" CHECK (spotify_popularity >= 0 AND spotify_popularity <= 100)
);
--> statement-breakpoint
CREATE TABLE "discog_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"duration_ms" integer,
	"track_number" integer NOT NULL,
	"disc_number" integer DEFAULT 1 NOT NULL,
	"is_explicit" boolean DEFAULT false NOT NULL,
	"isrc" text,
	"audio_url" text,
	"audio_format" text,
	"preview_url" text,
	"lyrics" text,
	"source_type" "ingestion_source_type" DEFAULT 'manual' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"results_found_total" integer DEFAULT 0 NOT NULL,
	"search_offset" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dsp_artist_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"external_artist_id" text,
	"external_artist_name" text,
	"external_artist_url" text,
	"external_artist_image_url" text,
	"confidence_score" numeric(5, 4),
	"confidence_breakdown" jsonb,
	"matching_isrc_count" integer DEFAULT 0 NOT NULL,
	"matching_upc_count" integer DEFAULT 0 NOT NULL,
	"total_tracks_checked" integer DEFAULT 0 NOT NULL,
	"status" "dsp_match_status" DEFAULT 'suggested' NOT NULL,
	"confirmed_at" timestamp,
	"confirmed_by" uuid,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dsp_bio_sync_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"method" "dsp_bio_sync_method" NOT NULL,
	"status" "dsp_bio_sync_status" DEFAULT 'pending' NOT NULL,
	"bio_text" text NOT NULL,
	"error" text,
	"sent_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_engagement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_type" text NOT NULL,
	"event_type" text NOT NULL,
	"reference_id" uuid NOT NULL,
	"recipient_hash" text NOT NULL,
	"provider_message_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_send_attribution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_message_id" text NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"recipient_hash" text NOT NULL,
	"email_type" text NOT NULL,
	"reference_id" text,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" text NOT NULL,
	"reason" "suppression_reason" NOT NULL,
	"source" text NOT NULL,
	"source_event_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"expires_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"subject" text,
	"category" "inbox_email_category",
	"suggested_category" "inbox_email_category",
	"suggested_territory" text,
	"category_confidence" real,
	"territory" text,
	"priority" "inbox_thread_priority" DEFAULT 'medium',
	"status" "inbox_thread_status" DEFAULT 'pending_review' NOT NULL,
	"routed_to_contact_id" uuid,
	"routed_at" timestamp,
	"ai_summary" text,
	"ai_extracted_data" jsonb,
	"latest_message_at" timestamp DEFAULT now() NOT NULL,
	"message_count" integer DEFAULT 1 NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fan_release_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"notification_subscription_id" uuid NOT NULL,
	"notification_type" "release_notification_type" NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"status" "release_notification_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"error" text,
	"dedup_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"message" text NOT NULL,
	"source" text DEFAULT 'dashboard' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"thread_id" uuid,
	"message_id" text,
	"in_reply_to" text,
	"references" jsonb DEFAULT '[]'::jsonb,
	"from_email" text NOT NULL,
	"from_name" text,
	"to_email" text NOT NULL,
	"cc_emails" jsonb DEFAULT '[]'::jsonb,
	"subject" text,
	"body_text" text,
	"body_html" text,
	"stripped_text" text,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"raw_headers" jsonb,
	"resend_email_id" text,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"user_id" uuid,
	"artist_id" uuid,
	"spotify_id" text,
	"handle" text,
	"action" text,
	"result" text,
	"failure_reason" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "ingestion_job_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_run_at" timestamp,
	"dedup_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insight_generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"status" "insight_run_status" DEFAULT 'pending' NOT NULL,
	"insights_generated" integer DEFAULT 0 NOT NULL,
	"data_points_analyzed" integer DEFAULT 0 NOT NULL,
	"model_used" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investor_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"label" text NOT NULL,
	"email" text,
	"investor_name" text,
	"stage" "investor_stage" DEFAULT 'shared' NOT NULL,
	"engagement_score" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"last_email_sent_at" timestamp,
	"email_sequence_step" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "investor_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "investor_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"show_progress_bar" boolean DEFAULT false NOT NULL,
	"raise_target" integer,
	"committed_amount" integer,
	"investor_count" integer,
	"book_call_url" text,
	"invest_url" text,
	"slack_webhook_url" text,
	"followup_enabled" boolean DEFAULT false NOT NULL,
	"followup_delay_hours" integer DEFAULT 48 NOT NULL,
	"engaged_threshold" integer DEFAULT 50 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investor_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_link_id" uuid NOT NULL,
	"page_path" text NOT NULL,
	"duration_hint_ms" integer,
	"user_agent" text,
	"referrer" text,
	"viewed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_pipeline_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"discovery_enabled" boolean DEFAULT true NOT NULL,
	"auto_ingest_enabled" boolean DEFAULT false NOT NULL,
	"auto_ingest_min_fit_score" integer DEFAULT 60 NOT NULL,
	"auto_ingest_daily_limit" integer DEFAULT 10 NOT NULL,
	"auto_ingested_today" integer DEFAULT 0 NOT NULL,
	"auto_ingest_resets_at" timestamp,
	"daily_query_budget" integer DEFAULT 100 NOT NULL,
	"queries_used_today" integer DEFAULT 0 NOT NULL,
	"query_budget_resets_at" timestamp,
	"last_discovery_query_index" integer DEFAULT 0 NOT NULL,
	"dm_template" text DEFAULT 'Hey {displayName}! I found your Linktree and love your music on Spotify. I built Jovie to help artists like you create a better link-in-bio. Here''s your free page: {claimLink}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"linktree_handle" text NOT NULL,
	"linktree_url" text NOT NULL,
	"discovery_source" "lead_discovery_source" NOT NULL,
	"discovery_query" text,
	"display_name" text,
	"bio" text,
	"avatar_url" text,
	"contact_email" text,
	"has_paid_tier" boolean,
	"is_linktree_verified" boolean,
	"has_spotify_link" boolean DEFAULT false NOT NULL,
	"spotify_url" text,
	"has_instagram" boolean DEFAULT false NOT NULL,
	"instagram_handle" text,
	"music_tools_detected" text[] DEFAULT '{}' NOT NULL,
	"all_links" jsonb,
	"fit_score" integer,
	"fit_score_breakdown" jsonb,
	"status" "lead_status" DEFAULT 'discovered' NOT NULL,
	"disqualification_reason" text,
	"qualified_at" timestamp,
	"disqualified_at" timestamp,
	"approved_at" timestamp,
	"ingested_at" timestamp,
	"rejected_at" timestamp,
	"creator_profile_id" uuid,
	"spotify_popularity" integer,
	"spotify_followers" integer,
	"release_count" integer,
	"latest_release_date" timestamp,
	"priority_score" real,
	"email_invalid" boolean DEFAULT false NOT NULL,
	"email_suspicious" boolean DEFAULT false NOT NULL,
	"email_invalid_reason" text,
	"has_representation" boolean DEFAULT false NOT NULL,
	"representation_signal" text,
	"outreach_route" "lead_outreach_route",
	"outreach_status" "lead_outreach_status",
	"claim_token" text,
	"claim_token_hash" text,
	"claim_token_expires_at" timestamp,
	"instantly_lead_id" text,
	"outreach_queued_at" timestamp,
	"dm_sent_at" timestamp,
	"dm_copy" text,
	"scrape_attempts" integer DEFAULT 0 NOT NULL,
	"scraped_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_delivery_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_subscription_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"recipient_hash" text NOT NULL,
	"status" "delivery_status" NOT NULL,
	"provider_message_id" text,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"email" text,
	"phone" text,
	"country_code" text,
	"city" text,
	"ip_address" text,
	"source" text,
	"name" text,
	"preferences" jsonb DEFAULT '{"releasePreview":true,"releaseDay":true,"newMusic":true,"tourDates":true,"merch":true,"general":true}'::jsonb,
	"confirmed_at" timestamp,
	"confirmation_token" text,
	"confirmation_sent_at" timestamp,
	"email_otp_hash" text,
	"email_otp_expires_at" timestamp,
	"email_otp_last_sent_at" timestamp,
	"email_otp_attempts" integer DEFAULT 0 NOT NULL,
	"unsubscribed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_subscriptions_contact_required" CHECK ("notification_subscriptions"."email" IS NOT NULL OR "notification_subscriptions"."phone" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "outbound_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"in_reply_to_message_id" text,
	"to_email" text NOT NULL,
	"cc_emails" jsonb DEFAULT '[]'::jsonb,
	"subject" text,
	"body_text" text NOT NULL,
	"body_html" text,
	"sent_by" "inbox_outbound_sent_by" NOT NULL,
	"resend_message_id" text,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pixel_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"event_type" "pixel_event_type" NOT NULL,
	"event_data" jsonb DEFAULT '{}'::jsonb,
	"consent_given" boolean DEFAULT false NOT NULL,
	"client_ip" text,
	"ip_hash" text,
	"user_agent" text,
	"forwarding_status" jsonb DEFAULT '{}'::jsonb,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"forward_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pre_save_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"release_id" uuid NOT NULL,
	"track_id" uuid,
	"release_track_id" uuid,
	"provider" text NOT NULL,
	"spotify_account_id" text,
	"encrypted_access_token" text,
	"encrypted_refresh_token" text,
	"encrypted_apple_music_user_token" text,
	"fan_email" text,
	"executed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_update_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verification_token" uuid,
	"token_expires_at" timestamp with time zone,
	"unsubscribe_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"subscribed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"source" text DEFAULT 'changelog_page' NOT NULL,
	"last_product_update_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_ownership_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"user_id" uuid,
	"action" "profile_ownership_action" NOT NULL,
	"performed_by" uuid,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creator_profile_id" uuid,
	"ingestion_owner_user_id" uuid,
	"status" "photo_status" DEFAULT 'uploading' NOT NULL,
	"source_platform" text,
	"source_type" "ingestion_source_type" DEFAULT 'manual' NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"locked_by_user" boolean DEFAULT false NOT NULL,
	"blob_url" text,
	"small_url" text,
	"medium_url" text,
	"large_url" text,
	"original_filename" text,
	"mime_type" text,
	"file_size" integer,
	"width" integer,
	"height" integer,
	"processed_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"owner_type" "provider_link_owner_type" NOT NULL,
	"release_id" uuid,
	"track_id" uuid,
	"release_track_id" uuid,
	"external_id" text,
	"url" text NOT NULL,
	"country" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source_type" "ingestion_source_type" DEFAULT 'manual' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_links_owner_match" CHECK (
        (owner_type::text = 'release' AND release_id IS NOT NULL AND track_id IS NULL AND release_track_id IS NULL)
        OR (owner_type::text = 'track' AND track_id IS NOT NULL AND release_id IS NULL AND release_track_id IS NULL)
        OR (owner_type::text = 'release_track' AND release_track_id IS NOT NULL AND release_id IS NULL AND track_id IS NULL)
      )
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"kind" "provider_kind" DEFAULT 'music_streaming' NOT NULL,
	"base_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recording_artists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recording_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"role" "artist_role" NOT NULL,
	"credit_name" text,
	"join_phrase" text,
	"position" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source_type" "ingestion_source_type" DEFAULT 'ingested',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_codes_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "referral_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "referral_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid NOT NULL,
	"referrer_user_id" uuid NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" "referral_commission_status" DEFAULT 'pending' NOT NULL,
	"period_start" timestamp,
	"period_end" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_commissions_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_user_id" uuid NOT NULL,
	"referred_user_id" uuid NOT NULL,
	"referral_code_id" uuid NOT NULL,
	"status" "referral_status" DEFAULT 'pending' NOT NULL,
	"commission_rate_bps" integer DEFAULT 5000 NOT NULL,
	"commission_duration_months" integer DEFAULT 24 NOT NULL,
	"subscribed_at" timestamp,
	"expires_at" timestamp,
	"churned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_artists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"role" "artist_role" NOT NULL,
	"credit_name" text,
	"join_phrase" text,
	"position" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source_type" "ingestion_source_type" DEFAULT 'ingested',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_task_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"explainer_text" text,
	"learn_more_url" text,
	"video_url" text,
	"category" text NOT NULL,
	"default_assignee_type" "release_task_assignee_type" DEFAULT 'human' NOT NULL,
	"default_ai_workflow_id" text,
	"default_priority" "release_task_priority" DEFAULT 'medium' NOT NULL,
	"default_due_days_offset" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"template_item_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"explainer_text" text,
	"learn_more_url" text,
	"video_url" text,
	"category" text,
	"status" "release_task_status" DEFAULT 'todo' NOT NULL,
	"priority" "release_task_priority" DEFAULT 'medium' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"assignee_type" "release_task_assignee_type" DEFAULT 'human' NOT NULL,
	"assignee_user_id" text,
	"ai_workflow_id" text,
	"due_days_offset" integer,
	"due_date" timestamp,
	"completed_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scraper_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text NOT NULL,
	"strategy" "scraper_strategy" DEFAULT 'http' NOT NULL,
	"max_concurrency" integer DEFAULT 1 NOT NULL,
	"max_jobs_per_minute" integer DEFAULT 30 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signed_link_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" text NOT NULL,
	"signed_token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"is_used" boolean DEFAULT false,
	"used_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "signed_link_access_signed_token_unique" UNIQUE("signed_token")
);
--> statement-breakpoint
CREATE TABLE "smart_link_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"smart_link_slug" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_link_id" uuid,
	"release_id" uuid,
	"track_id" uuid,
	"release_track_id" uuid,
	"url" text NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "smart_link_targets_owner_match" CHECK (
        (release_id IS NOT NULL AND track_id IS NULL AND release_track_id IS NULL)
        OR (track_id IS NOT NULL AND release_id IS NULL AND release_track_id IS NULL)
        OR (release_track_id IS NOT NULL AND release_id IS NULL AND track_id IS NULL)
      )
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"handle" text,
	"url" text,
	"status" "social_account_status" DEFAULT 'suspected' NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '0.00',
	"is_verified_flag" boolean DEFAULT false,
	"paid_flag" boolean DEFAULT false,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"source_platform" text,
	"source_type" "ingestion_source_type" DEFAULT 'ingested' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_link_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"source_provider" text NOT NULL,
	"source_artist_id" text,
	"platform" text NOT NULL,
	"url" text NOT NULL,
	"username" text,
	"confidence_score" numeric(5, 4) NOT NULL,
	"confidence_breakdown" jsonb,
	"status" "social_suggestion_status" DEFAULT 'pending' NOT NULL,
	"email_sent_at" timestamp,
	"responded_at" timestamp,
	"dedup_key" text NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"platform_type" text NOT NULL,
	"url" text NOT NULL,
	"display_text" text,
	"sort_order" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"state" "social_link_state" DEFAULT 'active' NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"source_platform" text,
	"source_type" "ingestion_source_type" DEFAULT 'manual' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb,
	"verification_token" text,
	"verification_status" text DEFAULT 'unverified',
	"verification_checked_at" timestamp,
	"verified_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"type" text NOT NULL,
	"stripe_object_id" text,
	"user_clerk_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"processed_at" timestamp,
	"stripe_created_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_webhook_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "tip_audience" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"source" "tip_audience_source" DEFAULT 'tip' NOT NULL,
	"tip_amount_total_cents" integer DEFAULT 0 NOT NULL,
	"tip_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"unsubscribed" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" "currency_code" DEFAULT 'USD' NOT NULL,
	"payment_intent_id" text NOT NULL,
	"stripe_checkout_session_id" text,
	"contact_email" text,
	"contact_phone" text,
	"tipper_name" text,
	"message" text,
	"is_anonymous" boolean DEFAULT false,
	"status" "tip_status" DEFAULT 'pending' NOT NULL,
	"platform_fee_cents" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tips_payment_intent_id_unique" UNIQUE("payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "tour_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"external_id" text,
	"provider" "tour_date_provider" DEFAULT 'manual' NOT NULL,
	"title" text,
	"start_date" timestamp with time zone NOT NULL,
	"start_time" text,
	"timezone" text,
	"venue_name" text NOT NULL,
	"city" text NOT NULL,
	"region" text,
	"country" text NOT NULL,
	"latitude" real,
	"longitude" real,
	"ticket_url" text,
	"ticket_status" "ticket_status" DEFAULT 'available' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_artists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"role" "artist_role" NOT NULL,
	"credit_name" text,
	"join_phrase" text,
	"position" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source_type" "ingestion_source_type" DEFAULT 'ingested',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unsubscribe_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"email_hash" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text,
	"used_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unsubscribe_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "user_profile_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"role" "profile_claim_role" DEFAULT 'owner' NOT NULL,
	"claimed_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"theme_mode" "theme_mode" DEFAULT 'system' NOT NULL,
	"sidebar_collapsed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"name" text,
	"email" text,
	"user_status" "user_status_lifecycle" NOT NULL,
	"waitlist_entry_id" uuid,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_pro" boolean DEFAULT false,
	"plan" text DEFAULT 'free',
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"billing_updated_at" timestamp,
	"billing_version" integer DEFAULT 1 NOT NULL,
	"last_billing_event_at" timestamp,
	"founder_welcome_sent_at" timestamp,
	"welcome_failed_at" timestamp,
	"outbound_suppressed_at" timestamp,
	"suppression_failed_at" timestamp,
	"growth_access_requested_at" timestamp,
	"growth_access_reason" text,
	"active_profile_id" uuid,
	"referred_by_code" text,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "users_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"primary_social_url" text NOT NULL,
	"primary_social_platform" text NOT NULL,
	"primary_social_url_normalized" text NOT NULL,
	"spotify_url" text,
	"spotify_url_normalized" text,
	"spotify_artist_name" text,
	"heard_about" text,
	"primary_goal" text,
	"selected_plan" text,
	"status" "waitlist_status" DEFAULT 'new' NOT NULL,
	"primary_social_follower_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"waitlist_entry_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"claim_token" text NOT NULL,
	"status" "waitlist_invite_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"gate_enabled" boolean DEFAULT true NOT NULL,
	"auto_accept_enabled" boolean DEFAULT false NOT NULL,
	"auto_accept_daily_limit" integer DEFAULT 0 NOT NULL,
	"auto_accepted_today" integer DEFAULT 0 NOT NULL,
	"auto_accept_resets_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wrapped_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"short_id" text NOT NULL,
	"encrypted_url" text NOT NULL,
	"kind" text NOT NULL,
	"domain" text NOT NULL,
	"category" text,
	"title_alias" text,
	"click_count" integer DEFAULT 0,
	"created_by" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wrapped_links_short_id_unique" UNIQUE("short_id")
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_generation_run_id_insight_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."insight_generation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artists" ADD CONSTRAINT "artists_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_members" ADD CONSTRAINT "audience_members_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_audit_log" ADD CONSTRAINT "billing_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_enrollments" ADD CONSTRAINT "campaign_enrollments_campaign_sequence_id_campaign_sequences_id_fk" FOREIGN KEY ("campaign_sequence_id") REFERENCES "public"."campaign_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_audit_log" ADD CONSTRAINT "chat_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_audit_log" ADD CONSTRAINT "chat_audit_log_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_audit_log" ADD CONSTRAINT "chat_audit_log_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_audit_log" ADD CONSTRAINT "chat_audit_log_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_link_id_social_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."social_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_audience_member_id_audience_members_id_fk" FOREIGN KEY ("audience_member_id") REFERENCES "public"."audience_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_slug_redirects" ADD CONSTRAINT "content_slug_redirects_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_slug_redirects" ADD CONSTRAINT "content_slug_redirects_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_slug_redirects" ADD CONSTRAINT "content_slug_redirects_track_id_discog_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."discog_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_slug_redirects" ADD CONSTRAINT "content_slug_redirects_release_track_id_discog_release_tracks_id_fk" FOREIGN KEY ("release_track_id") REFERENCES "public"."discog_release_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_avatar_candidates" ADD CONSTRAINT "creator_avatar_candidates_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_claim_invites" ADD CONSTRAINT "creator_claim_invites_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_claim_invites" ADD CONSTRAINT "creator_claim_invites_creator_contact_id_creator_contacts_id_fk" FOREIGN KEY ("creator_contact_id") REFERENCES "public"."creator_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_contacts" ADD CONSTRAINT "creator_contacts_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_email_quotas" ADD CONSTRAINT "creator_email_quotas_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_pixels" ADD CONSTRAINT "creator_pixels_profile_id_creator_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profile_attributes" ADD CONSTRAINT "creator_profile_attributes_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_waitlist_entry_id_waitlist_entries_id_fk" FOREIGN KEY ("waitlist_entry_id") REFERENCES "public"."waitlist_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_sending_reputation" ADD CONSTRAINT "creator_sending_reputation_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_profile_views" ADD CONSTRAINT "daily_profile_views_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discog_recordings" ADD CONSTRAINT "discog_recordings_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discog_release_tracks" ADD CONSTRAINT "discog_release_tracks_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discog_release_tracks" ADD CONSTRAINT "discog_release_tracks_recording_id_discog_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."discog_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discog_releases" ADD CONSTRAINT "discog_releases_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discog_tracks" ADD CONSTRAINT "discog_tracks_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discog_tracks" ADD CONSTRAINT "discog_tracks_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsp_artist_matches" ADD CONSTRAINT "dsp_artist_matches_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsp_bio_sync_requests" ADD CONSTRAINT "dsp_bio_sync_requests_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_attribution" ADD CONSTRAINT "email_send_attribution_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_routed_to_contact_id_creator_contacts_id_fk" FOREIGN KEY ("routed_to_contact_id") REFERENCES "public"."creator_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fan_release_notifications" ADD CONSTRAINT "fan_release_notifications_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fan_release_notifications" ADD CONSTRAINT "fan_release_notifications_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fan_release_notifications" ADD CONSTRAINT "fan_release_notifications_notification_subscription_id_notification_subscriptions_id_fk" FOREIGN KEY ("notification_subscription_id") REFERENCES "public"."notification_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_generation_runs" ADD CONSTRAINT "insight_generation_runs_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_views" ADD CONSTRAINT "investor_views_investor_link_id_investor_links_id_fk" FOREIGN KEY ("investor_link_id") REFERENCES "public"."investor_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery_log" ADD CONSTRAINT "notification_delivery_log_notification_subscription_id_notification_subscriptions_id_fk" FOREIGN KEY ("notification_subscription_id") REFERENCES "public"."notification_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_replies" ADD CONSTRAINT "outbound_replies_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_replies" ADD CONSTRAINT "outbound_replies_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixel_events" ADD CONSTRAINT "pixel_events_profile_id_creator_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_save_tokens" ADD CONSTRAINT "pre_save_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_save_tokens" ADD CONSTRAINT "pre_save_tokens_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_save_tokens" ADD CONSTRAINT "pre_save_tokens_track_id_discog_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."discog_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_save_tokens" ADD CONSTRAINT "pre_save_tokens_release_track_id_discog_release_tracks_id_fk" FOREIGN KEY ("release_track_id") REFERENCES "public"."discog_release_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_ownership_log" ADD CONSTRAINT "profile_ownership_log_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_ownership_log" ADD CONSTRAINT "profile_ownership_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_ownership_log" ADD CONSTRAINT "profile_ownership_log_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_ingestion_owner_user_id_users_id_fk" FOREIGN KEY ("ingestion_owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_links" ADD CONSTRAINT "provider_links_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_links" ADD CONSTRAINT "provider_links_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_links" ADD CONSTRAINT "provider_links_track_id_discog_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."discog_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_links" ADD CONSTRAINT "provider_links_release_track_id_discog_release_tracks_id_fk" FOREIGN KEY ("release_track_id") REFERENCES "public"."discog_release_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_artists" ADD CONSTRAINT "recording_artists_recording_id_discog_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."discog_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_artists" ADD CONSTRAINT "recording_artists_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referral_code_id_referral_codes_id_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_artists" ADD CONSTRAINT "release_artists_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_artists" ADD CONSTRAINT "release_artists_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_task_template_items" ADD CONSTRAINT "release_task_template_items_template_id_release_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."release_task_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_task_templates" ADD CONSTRAINT "release_task_templates_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_tasks" ADD CONSTRAINT "release_tasks_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_tasks" ADD CONSTRAINT "release_tasks_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_tasks" ADD CONSTRAINT "release_tasks_template_item_id_release_task_template_items_id_fk" FOREIGN KEY ("template_item_id") REFERENCES "public"."release_task_template_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_link_targets" ADD CONSTRAINT "smart_link_targets_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_link_targets" ADD CONSTRAINT "smart_link_targets_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_link_targets" ADD CONSTRAINT "smart_link_targets_provider_link_id_provider_links_id_fk" FOREIGN KEY ("provider_link_id") REFERENCES "public"."provider_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_link_targets" ADD CONSTRAINT "smart_link_targets_release_id_discog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_link_targets" ADD CONSTRAINT "smart_link_targets_track_id_discog_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."discog_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_link_targets" ADD CONSTRAINT "smart_link_targets_release_track_id_discog_release_tracks_id_fk" FOREIGN KEY ("release_track_id") REFERENCES "public"."discog_release_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_link_suggestions" ADD CONSTRAINT "social_link_suggestions_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_links" ADD CONSTRAINT "social_links_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_audience" ADD CONSTRAINT "tip_audience_profile_id_creator_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_dates" ADD CONSTRAINT "tour_dates_profile_id_creator_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_track_id_discog_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."discog_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_claims" ADD CONSTRAINT "user_profile_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_claims" ADD CONSTRAINT "user_profile_claims_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_invites" ADD CONSTRAINT "waitlist_invites_waitlist_entry_id_waitlist_entries_id_fk" FOREIGN KEY ("waitlist_entry_id") REFERENCES "public"."waitlist_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_invites" ADD CONSTRAINT "waitlist_invites_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_admin_user_id" ON "admin_audit_log" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_target_user_id" ON "admin_audit_log" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_created_at" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_action" ON "admin_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_insights_generation_run_id" ON "ai_insights" USING btree ("generation_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_insights_creator_active" ON "ai_insights" USING btree ("creator_profile_id","status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_insights_expires_at" ON "ai_insights" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_insights_creator_priority" ON "ai_insights" USING btree ("creator_profile_id","priority","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ai_insights_dedup" ON "ai_insights" USING btree ("creator_profile_id","insight_type","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "artists_spotify_id_unique" ON "artists" USING btree ("spotify_id") WHERE spotify_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "artists_apple_music_id_unique" ON "artists" USING btree ("apple_music_id") WHERE apple_music_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "artists_musicbrainz_id_unique" ON "artists" USING btree ("musicbrainz_id") WHERE musicbrainz_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "artists_deezer_id_unique" ON "artists" USING btree ("deezer_id") WHERE deezer_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artists_name_normalized_idx" ON "artists" USING btree ("name_normalized");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artists_creator_profile_id_idx" ON "artists" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audience_members_creator_profile_id_fingerprint_unique" ON "audience_members" USING btree ("creator_profile_id","fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_members_creator_profile_id_last_seen_at_idx" ON "audience_members" USING btree ("creator_profile_id","last_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_members_creator_profile_id_type_last_seen_at_idx" ON "audience_members" USING btree ("creator_profile_id","type","last_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_members_creator_profile_id_updated_at_idx" ON "audience_members" USING btree ("creator_profile_id","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_members_retention_idx" ON "audience_members" USING btree ("last_seen_at") WHERE type = 'anonymous' AND email IS NULL AND phone IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audience_members_fingerprint" ON "audience_members" USING btree ("creator_profile_id","fingerprint") WHERE fingerprint IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audience_members_email" ON "audience_members" USING btree ("creator_profile_id","email") WHERE email IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_audit_log_user_id_idx" ON "billing_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_audit_log_stripe_event_id_idx" ON "billing_audit_log" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_audit_log_created_at_idx" ON "billing_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_enrollments_next_step_idx" ON "campaign_enrollments" USING btree ("next_step_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_enrollments_campaign_idx" ON "campaign_enrollments" USING btree ("campaign_sequence_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_enrollments_subject_idx" ON "campaign_enrollments" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_enrollments_status_idx" ON "campaign_enrollments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_enrollments_unique_idx" ON "campaign_enrollments" USING btree ("campaign_sequence_id","subject_id","recipient_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_sequences_campaign_key_idx" ON "campaign_sequences" USING btree ("campaign_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "category_subscriptions_email_hash_idx" ON "category_subscriptions" USING btree ("email_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "category_subscriptions_email_hash_category_unique" ON "category_subscriptions" USING btree ("email_hash","category_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_audit_log_user_id" ON "chat_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_audit_log_creator_profile_id" ON "chat_audit_log" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_audit_log_conversation_id" ON "chat_audit_log" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_audit_log_message_id" ON "chat_audit_log" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_audit_log_action" ON "chat_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_audit_log_created_at" ON "chat_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_conversations_user_id" ON "chat_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_conversations_creator_profile_id" ON "chat_conversations" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_conversations_updated_at" ON "chat_conversations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_conversation_id" ON "chat_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_created_at" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "click_events_creator_profile_id_created_at_idx" ON "click_events" USING btree ("creator_profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "click_events_creator_profile_id_is_bot_created_at_idx" ON "click_events" USING btree ("creator_profile_id","is_bot","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "click_events_created_at_idx" ON "click_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_click_events_link_id" ON "click_events" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_click_events_audience_member_id" ON "click_events" USING btree ("audience_member_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_click_events_link_type" ON "click_events" USING btree ("creator_profile_id","link_type","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_click_events_non_bot" ON "click_events" USING btree ("creator_profile_id","created_at") WHERE is_bot = false OR is_bot IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_click_events_metadata_content" ON "click_events" USING btree ("creator_profile_id","created_at") WHERE metadata->>'contentId' IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_slug_redirects_creator_old_slug" ON "content_slug_redirects" USING btree ("creator_profile_id","old_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_slug_redirects_old_slug_idx" ON "content_slug_redirects" USING btree ("old_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_avatar_candidates_profile_id" ON "creator_avatar_candidates" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_creator_avatar_candidates_unique" ON "creator_avatar_candidates" USING btree ("creator_profile_id","avatar_url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_claim_invites_creator_profile_id" ON "creator_claim_invites" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_claim_invites_contact_id" ON "creator_claim_invites" USING btree ("creator_contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_claim_invites_status" ON "creator_claim_invites" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_claim_invites_send_at" ON "creator_claim_invites" USING btree ("send_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_creator_claim_invites_profile_email_unique" ON "creator_claim_invites" USING btree ("creator_profile_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_contacts_profile_active" ON "creator_contacts" USING btree ("creator_profile_id","is_active","sort_order","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_email_quotas_creator_profile_id_idx" ON "creator_email_quotas" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_email_quotas_daily_reset_idx" ON "creator_email_quotas" USING btree ("daily_reset_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_email_quotas_monthly_reset_idx" ON "creator_email_quotas" USING btree ("monthly_reset_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_creator_pixels_profile_id_unique" ON "creator_pixels" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_pixels_enabled" ON "creator_pixels" USING btree ("enabled","profile_id") WHERE enabled = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profile_attributes_profile_id" ON "creator_profile_attributes" USING btree ("creator_profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profiles_featured_query" ON "creator_profiles" USING btree ("is_public","is_featured","marketing_opt_out","display_name") WHERE is_public = true AND is_featured = true AND marketing_opt_out = false;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creator_profiles_username_normalized_unique" ON "creator_profiles" USING btree ("username_normalized") WHERE username_normalized IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profiles_fit_score" ON "creator_profiles" USING btree ("fit_score","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creator_profiles_outreach_status" ON "creator_profiles" USING btree ("outreach_status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_sending_reputation_creator_profile_id_idx" ON "creator_sending_reputation" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_sending_reputation_status_idx" ON "creator_sending_reputation" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_sending_reputation_bounce_rate_idx" ON "creator_sending_reputation" USING btree ("bounce_rate");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_sending_reputation_complaint_rate_idx" ON "creator_sending_reputation" USING btree ("complaint_rate");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_sending_reputation_rolling_window_reset_idx" ON "creator_sending_reputation" USING btree ("rolling_window_reset_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_profile_views_creator_profile_id_view_date_unique" ON "daily_profile_views" USING btree ("creator_profile_id","view_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_profile_views_creator_profile_id_view_date_idx" ON "daily_profile_views" USING btree ("creator_profile_id","view_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dashboard_idempotency_keys_key_user_endpoint_unique" ON "dashboard_idempotency_keys" USING btree ("key","user_id","endpoint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_idempotency_keys_expires_at_idx" ON "dashboard_idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discog_recordings_creator_slug_unique" ON "discog_recordings" USING btree ("creator_profile_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discog_recordings_creator_isrc_unique" ON "discog_recordings" USING btree ("creator_profile_id","isrc") WHERE isrc IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discog_recordings_creator_profile_id_idx" ON "discog_recordings" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discog_release_tracks_position_unique" ON "discog_release_tracks" USING btree ("release_id","disc_number","track_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discog_release_tracks_release_slug_unique" ON "discog_release_tracks" USING btree ("release_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discog_release_tracks_release_id_idx" ON "discog_release_tracks" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discog_release_tracks_recording_id_idx" ON "discog_release_tracks" USING btree ("recording_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discog_releases_creator_slug_unique" ON "discog_releases" USING btree ("creator_profile_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discog_releases_creator_upc_unique" ON "discog_releases" USING btree ("creator_profile_id","upc") WHERE upc IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discog_releases_release_date_idx" ON "discog_releases" USING btree ("release_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discog_tracks_release_track_position_unique" ON "discog_tracks" USING btree ("release_id","disc_number","track_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discog_tracks_release_slug_unique" ON "discog_tracks" USING btree ("release_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discog_tracks_release_isrc_unique" ON "discog_tracks" USING btree ("release_id","isrc") WHERE isrc IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discog_tracks_release_id_idx" ON "discog_tracks" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discog_tracks_creator_profile_id_idx" ON "discog_tracks" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_discovery_keywords_query" ON "discovery_keywords" USING btree ("query");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dsp_artist_matches_creator_provider_unique" ON "dsp_artist_matches" USING btree ("creator_profile_id","provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_artist_matches_status_idx" ON "dsp_artist_matches" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_artist_matches_confidence_idx" ON "dsp_artist_matches" USING btree ("confidence_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_bio_sync_requests_creator_provider_idx" ON "dsp_bio_sync_requests" USING btree ("creator_profile_id","provider_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_bio_sync_requests_status_idx" ON "dsp_bio_sync_requests" USING btree ("status","created_at") WHERE status IN ('pending', 'sending');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_engagement_reference_idx" ON "email_engagement" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_engagement_recipient_idx" ON "email_engagement" USING btree ("recipient_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_engagement_email_type_idx" ON "email_engagement" USING btree ("email_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_engagement_created_at_idx" ON "email_engagement" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_send_attribution_provider_message_id_idx" ON "email_send_attribution" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_send_attribution_creator_profile_id_idx" ON "email_send_attribution" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_send_attribution_expires_at_idx" ON "email_send_attribution" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_suppressions_email_hash_idx" ON "email_suppressions" USING btree ("email_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_suppressions_email_hash_reason_unique" ON "email_suppressions" USING btree ("email_hash","reason");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_suppressions_expires_at_idx" ON "email_suppressions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_threads_profile_status" ON "email_threads" USING btree ("creator_profile_id","status","latest_message_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_threads_profile_category" ON "email_threads" USING btree ("creator_profile_id","category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_threads_latest_message" ON "email_threads" USING btree ("latest_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fan_release_notifications_dedup_key_unique" ON "fan_release_notifications" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fan_release_notifications_status_scheduled_idx" ON "fan_release_notifications" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fan_release_notifications_release_idx" ON "fan_release_notifications" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fan_release_notifications_creator_idx" ON "fan_release_notifications" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_items_status_created_idx" ON "feedback_items" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_items_user_idx" ON "feedback_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inbound_emails_profile_received" ON "inbound_emails" USING btree ("creator_profile_id","received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inbound_emails_thread" ON "inbound_emails" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inbound_emails_message_id" ON "inbound_emails" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inbound_emails_from_email" ON "inbound_emails" USING btree ("from_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingest_audit_logs_type" ON "ingest_audit_logs" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingest_audit_logs_user_id" ON "ingest_audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingest_audit_logs_created_at" ON "ingest_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingest_audit_logs_result" ON "ingest_audit_logs" USING btree ("result");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ingestion_jobs_dedup_key_unique" ON "ingestion_jobs" USING btree ("dedup_key") WHERE dedup_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingestion_jobs_status_run_at" ON "ingestion_jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_insight_runs_creator" ON "insight_generation_runs" USING btree ("creator_profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_insight_runs_status" ON "insight_generation_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_investor_links_token" ON "investor_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_investor_links_stage" ON "investor_links" USING btree ("stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_investor_links_is_active" ON "investor_links" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_investor_views_link_viewed" ON "investor_views" USING btree ("investor_link_id","viewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_leads_linktree_handle" ON "leads" USING btree ("linktree_handle");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_status_fit_score" ON "leads" USING btree ("status","fit_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_creator_profile_id" ON "leads" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_outreach_route_priority" ON "leads" USING btree ("outreach_route","priority_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_outreach_status" ON "leads" USING btree ("outreach_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_delivery_log_recipient_hash_idx" ON "notification_delivery_log" USING btree ("recipient_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_delivery_log_created_at_idx" ON "notification_delivery_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_delivery_log_subscription_idx" ON "notification_delivery_log" USING btree ("notification_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_subscriptions_creator_profile_id_email_unique" ON "notification_subscriptions" USING btree ("creator_profile_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_subscriptions_creator_profile_id_phone_unique" ON "notification_subscriptions" USING btree ("creator_profile_id","phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_subscriptions_creator_profile_id_created_at_idx" ON "notification_subscriptions" USING btree ("creator_profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_subscriptions_created_at_idx" ON "notification_subscriptions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbound_replies_thread" ON "outbound_replies" USING btree ("thread_id","sent_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pixel_events_profile_id" ON "pixel_events" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pixel_events_forwarding_queue" ON "pixel_events" USING btree ("forward_at","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pixel_events_session_id" ON "pixel_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pixel_events_profile_recent" ON "pixel_events" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pixel_events_purge" ON "pixel_events" USING btree ("created_at") WHERE client_ip IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pre_save_tokens_user_id_idx" ON "pre_save_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pre_save_tokens_track_id_idx" ON "pre_save_tokens" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pre_save_tokens_release_id_idx" ON "pre_save_tokens" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pre_save_tokens_provider_idx" ON "pre_save_tokens" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pre_save_tokens_executed_at_idx" ON "pre_save_tokens" USING btree ("executed_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pre_save_tokens_spotify_unique_idx" ON "pre_save_tokens" USING btree ("release_id","provider","spotify_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_update_subscribers_email_idx" ON "product_update_subscribers" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_ownership_log_profile" ON "profile_ownership_log" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_photos_user_id" ON "profile_photos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_photos_creator_profile_id" ON "profile_photos" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_photos_ingestion_owner" ON "profile_photos" USING btree ("ingestion_owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_links_release_provider" ON "provider_links" USING btree ("provider_id","release_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_links_track_provider" ON "provider_links" USING btree ("provider_id","track_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_links_release_track_provider" ON "provider_links" USING btree ("provider_id","release_track_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_links_provider_external" ON "provider_links" USING btree ("provider_id","external_id") WHERE external_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_links_release_id_idx" ON "provider_links" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_links_track_id_idx" ON "provider_links" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_links_release_track_id_idx" ON "provider_links" USING btree ("release_track_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recording_artists_recording_artist_role" ON "recording_artists" USING btree ("recording_id","artist_id","role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recording_artists_artist_id_idx" ON "recording_artists" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recording_artists_recording_id_idx" ON "recording_artists" USING btree ("recording_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_commissions_referral_id_idx" ON "referral_commissions" USING btree ("referral_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_commissions_referrer_user_id_idx" ON "referral_commissions" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_commissions_status_idx" ON "referral_commissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referrals_referrer_user_id_idx" ON "referrals" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referrals_referred_user_id_idx" ON "referrals" USING btree ("referred_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referrals_status_idx" ON "referrals" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "release_artists_release_artist_role" ON "release_artists" USING btree ("release_id","artist_id","role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_artists_artist_id_idx" ON "release_artists" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_artists_release_id_idx" ON "release_artists" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_task_template_items_template_id_idx" ON "release_task_template_items" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "release_task_templates_creator_default_unique" ON "release_task_templates" USING btree ("creator_profile_id") WHERE is_default = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_tasks_release_status_idx" ON "release_tasks" USING btree ("release_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_tasks_release_position_idx" ON "release_tasks" USING btree ("release_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_tasks_creator_profile_idx" ON "release_tasks" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_tasks_due_date_idx" ON "release_tasks" USING btree ("due_date") WHERE due_date IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "smart_link_targets_slug_provider" ON "smart_link_targets" USING btree ("creator_profile_id","smart_link_slug","provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "smart_link_targets_provider_link_idx" ON "smart_link_targets" USING btree ("provider_link_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "smart_link_targets_release_id_idx" ON "smart_link_targets" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "smart_link_targets_track_id_idx" ON "smart_link_targets" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "smart_link_targets_release_track_id_idx" ON "smart_link_targets" USING btree ("release_track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_social_accounts_profile_platform_status" ON "social_accounts" USING btree ("creator_profile_id","platform","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "social_link_suggestions_dedup_key_unique" ON "social_link_suggestions" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_link_suggestions_status_created_idx" ON "social_link_suggestions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_link_suggestions_creator_idx" ON "social_link_suggestions" USING btree ("creator_profile_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_link_suggestions_expires_idx" ON "social_link_suggestions" USING btree ("expires_at") WHERE expires_at IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_links_creator_profile_state_idx" ON "social_links" USING btree ("creator_profile_id","state","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_social_links_active" ON "social_links" USING btree ("creator_profile_id","is_active","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_links_creator_profile_platform_idx" ON "social_links" USING btree ("creator_profile_id","platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_webhook_events_created_at_idx" ON "stripe_webhook_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tip_audience_profile_id_email_unique" ON "tip_audience" USING btree ("profile_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tip_audience_profile_id_last_seen_at_idx" ON "tip_audience" USING btree ("profile_id","last_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tip_audience_profile_id_created_at_idx" ON "tip_audience" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tip_audience_email_idx" ON "tip_audience" USING btree ("email") WHERE unsubscribed = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tips_creator_profile_id_idx" ON "tips" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tips_created_at" ON "tips" USING btree ("creator_profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tips_status_amount" ON "tips" USING btree ("creator_profile_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tips_stripe_checkout_session_id_unique" ON "tips" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tour_dates_profile_id" ON "tour_dates" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tour_dates_start_date" ON "tour_dates" USING btree ("start_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tour_dates_external_id_provider" ON "tour_dates" USING btree ("profile_id","external_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "track_artists_track_artist_role" ON "track_artists" USING btree ("track_id","artist_id","role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "track_artists_artist_id_idx" ON "track_artists" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "track_artists_track_id_idx" ON "track_artists" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unsubscribe_tokens_token_hash_idx" ON "unsubscribe_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unsubscribe_tokens_expires_at_idx" ON "unsubscribe_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_profile_claims_unique_profile" ON "user_profile_claims" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_profile_claims_user_id" ON "user_profile_claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_user_status" ON "users" USING btree ("user_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_active_profile_id" ON "users" USING btree ("active_profile_id") WHERE active_profile_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_waitlist_entries_email" ON "waitlist_entries" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_waitlist_invites_entry_id" ON "waitlist_invites" USING btree ("waitlist_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_waitlist_invites_claim_token_unique" ON "waitlist_invites" USING btree ("claim_token");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_provider_event_id_unique" ON "webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_events_unprocessed_idx" ON "webhook_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wrapped_links_created_by" ON "wrapped_links" USING btree ("created_by");