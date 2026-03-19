-- Product Update Subscribers table for changelog email subscriptions
CREATE TABLE IF NOT EXISTS "product_update_subscribers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL,
  "verified" boolean NOT NULL DEFAULT false,
  "verification_token" uuid,
  "token_expires_at" timestamp with time zone,
  "unsubscribe_token" uuid NOT NULL DEFAULT gen_random_uuid(),
  "subscribed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "unsubscribed_at" timestamp with time zone,
  "source" text NOT NULL DEFAULT 'changelog_page',
  "last_product_update_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_update_subscribers_email_idx" ON "product_update_subscribers" USING btree ("email");
