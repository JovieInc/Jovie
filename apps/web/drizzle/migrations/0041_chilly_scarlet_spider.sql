ALTER TABLE "notification_contacts" ADD CONSTRAINT "notification_contacts_sms_status_valid" CHECK ("notification_contacts"."sms_status" IN ('active', 'stopped', 'blocked'));--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_sms_consent_complete" CHECK ((
        "notification_subscriptions"."sms_consent_at" IS NULL
        AND "notification_subscriptions"."sms_consent_text_hash" IS NULL
        AND "notification_subscriptions"."sms_consent_version" IS NULL
      ) OR (
        "notification_subscriptions"."sms_consent_at" IS NOT NULL
        AND "notification_subscriptions"."sms_consent_text_hash" IS NOT NULL
        AND "notification_subscriptions"."sms_consent_version" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "sms_subscribe_intents" ADD CONSTRAINT "sms_subscribe_intents_status_valid" CHECK ("sms_subscribe_intents"."status" IN ('created', 'sms_received', 'confirmed', 'expired', 'consumed', 'blocked'));