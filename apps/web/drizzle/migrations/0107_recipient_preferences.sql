CREATE TABLE "recipient_preferences" (
	"better_auth_user_id" text PRIMARY KEY NOT NULL,
	"preference_version" integer NOT NULL,
	"recipient_kind" text NOT NULL,
	"timezone" text NOT NULL,
	"quiet_hours_start" text NOT NULL,
	"quiet_hours_end" text NOT NULL,
	"weekend_behavior" text NOT NULL,
	"briefing_behavior" text NOT NULL,
	"channel_email" boolean DEFAULT false NOT NULL,
	"channel_sms" boolean DEFAULT false NOT NULL,
	"channel_push" boolean DEFAULT false NOT NULL,
	"channel_in_app" boolean DEFAULT false NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"marketing_consent_version" text,
	"marketing_consent_recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipient_preferences_version_valid" CHECK ("recipient_preferences"."preference_version" = 1),
	CONSTRAINT "recipient_preferences_recipient_kind_valid" CHECK ("recipient_preferences"."recipient_kind" in ('tim', 'customer')),
	CONSTRAINT "recipient_preferences_weekend_behavior_valid" CHECK ("recipient_preferences"."weekend_behavior" in ('observe_quiet_hours', 'weekend_briefing_eligible', 'suppress_weekends')),
	CONSTRAINT "recipient_preferences_briefing_behavior_valid" CHECK ("recipient_preferences"."briefing_behavior" in ('off', 'weekend_summer', 'daily')),
	CONSTRAINT "recipient_preferences_quiet_hours_valid" CHECK ("recipient_preferences"."quiet_hours_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "recipient_preferences"."quiet_hours_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "recipient_preferences"."quiet_hours_start" <> "recipient_preferences"."quiet_hours_end"),
	CONSTRAINT "recipient_preferences_marketing_consent_valid" CHECK (("recipient_preferences"."marketing_opt_in" = false and "recipient_preferences"."marketing_consent_version" is null and "recipient_preferences"."marketing_consent_recorded_at" is null) or ("recipient_preferences"."marketing_opt_in" = true and "recipient_preferences"."marketing_consent_version" = 'recipient-marketing-v1' and "recipient_preferences"."marketing_consent_recorded_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "recipient_preferences" ADD CONSTRAINT "recipient_preferences_better_auth_user_id_ba_users_id_fk" FOREIGN KEY ("better_auth_user_id") REFERENCES "public"."ba_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipient_preferences_briefing_idx" ON "recipient_preferences" USING btree ("briefing_behavior");