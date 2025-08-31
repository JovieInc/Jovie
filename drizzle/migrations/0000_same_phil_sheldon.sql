CREATE TYPE "public"."creator_type" AS ENUM('artist', 'podcaster', 'influencer', 'creator');--> statement-breakpoint
CREATE TYPE "public"."currency_code" AS ENUM('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK');--> statement-breakpoint
CREATE TYPE "public"."link_type" AS ENUM('listen', 'social', 'tip', 'other');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('free', 'basic', 'premium', 'pro');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'inactive', 'cancelled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."theme_mode" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
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
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"creator_type" "creator_type" NOT NULL,
	"username" text NOT NULL,
	"username_normalized" text NOT NULL,
	"display_name" text,
	"bio" text,
	"avatar_url" text,
	"spotify_url" text,
	"apple_music_url" text,
	"youtube_url" text,
	"spotify_id" text,
	"is_public" boolean DEFAULT true,
	"is_verified" boolean DEFAULT false,
	"is_featured" boolean DEFAULT false,
	"marketing_opt_out" boolean DEFAULT false,
	"is_claimed" boolean DEFAULT false,
	"claim_token" text,
	"claimed_at" timestamp,
	"last_login_at" timestamp,
	"profile_views" integer DEFAULT 0,
	"onboarding_completed_at" timestamp,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"theme" jsonb DEFAULT '{}'::jsonb,
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
	"contact_email" text,
	"contact_phone" text,
	"message" text,
	"is_anonymous" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
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
	"email" text,
	"is_pro" boolean DEFAULT false,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"billing_updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "users_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
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
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_link_id_social_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."social_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_links" ADD CONSTRAINT "social_links_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;