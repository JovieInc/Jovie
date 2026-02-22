CREATE TABLE IF NOT EXISTS "waitlist_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "gate_enabled" boolean DEFAULT true NOT NULL,
  "auto_accept_enabled" boolean DEFAULT false NOT NULL,
  "auto_accept_daily_limit" integer DEFAULT 0 NOT NULL,
  "auto_accepted_today" integer DEFAULT 0 NOT NULL,
  "auto_accept_resets_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

INSERT INTO "waitlist_settings" (
  "id",
  "gate_enabled",
  "auto_accept_enabled",
  "auto_accept_daily_limit",
  "auto_accepted_today",
  "auto_accept_resets_at"
)
VALUES (
  1,
  true,
  false,
  0,
  0,
  date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day'
)
ON CONFLICT ("id") DO NOTHING;
