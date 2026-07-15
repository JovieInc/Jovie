ALTER TABLE "ba_users" ADD COLUMN "phone_number" text;
--> statement-breakpoint
ALTER TABLE "ba_users" ADD COLUMN "phone_number_verified" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "ba_users" ADD CONSTRAINT "ba_users_phone_number_unique" UNIQUE("phone_number");
--> statement-breakpoint
CREATE TABLE "ba_jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ba_oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL UNIQUE,
	"client_secret" text,
	"disabled" boolean DEFAULT false NOT NULL,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"subject_type" text,
	"scopes" jsonb,
	"user_id" text REFERENCES "ba_users"("id") ON DELETE cascade,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" jsonb,
	"tos" text,
	"policy" text,
	"software_id" text,
	"software_version" text,
	"software_statement" text,
	"redirect_uris" jsonb NOT NULL,
	"post_logout_redirect_uris" jsonb,
	"token_endpoint_auth_method" text,
	"grant_types" jsonb,
	"response_types" jsonb,
	"public" boolean,
	"type" text,
	"require_pkce" boolean,
	"reference_id" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "ba_oauth_refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL UNIQUE,
	"client_id" text NOT NULL REFERENCES "ba_oauth_clients"("client_id") ON DELETE cascade,
	"session_id" text REFERENCES "ba_sessions"("id") ON DELETE set null,
	"user_id" text NOT NULL REFERENCES "ba_users"("id") ON DELETE cascade,
	"reference_id" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked" timestamp,
	"auth_time" timestamp,
	"scopes" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ba_oauth_access_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL UNIQUE,
	"client_id" text NOT NULL REFERENCES "ba_oauth_clients"("client_id") ON DELETE cascade,
	"session_id" text REFERENCES "ba_sessions"("id") ON DELETE set null,
	"user_id" text REFERENCES "ba_users"("id") ON DELETE cascade,
	"reference_id" text,
	"refresh_id" text REFERENCES "ba_oauth_refresh_tokens"("id") ON DELETE set null,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"scopes" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ba_oauth_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL REFERENCES "ba_oauth_clients"("client_id") ON DELETE cascade,
	"user_id" text REFERENCES "ba_users"("id") ON DELETE cascade,
	"reference_id" text,
	"scopes" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_oauth_clients_user_id" ON "ba_oauth_clients" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_oauth_refresh_tokens_client_id" ON "ba_oauth_refresh_tokens" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_oauth_refresh_tokens_session_id" ON "ba_oauth_refresh_tokens" ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_oauth_refresh_tokens_user_id" ON "ba_oauth_refresh_tokens" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_oauth_access_tokens_client_id" ON "ba_oauth_access_tokens" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_oauth_access_tokens_session_id" ON "ba_oauth_access_tokens" ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_oauth_access_tokens_user_id" ON "ba_oauth_access_tokens" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_oauth_access_tokens_refresh_id" ON "ba_oauth_access_tokens" ("refresh_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_oauth_consents_client_id" ON "ba_oauth_consents" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ba_oauth_consents_user_id" ON "ba_oauth_consents" ("user_id");
--> statement-breakpoint
INSERT INTO "ba_oauth_clients" (
	"id", "client_id", "disabled", "skip_consent", "enable_end_session",
	"scopes", "name", "redirect_uris", "token_endpoint_auth_method",
	"grant_types", "response_types", "public", "type", "require_pkce"
) VALUES (
	'logyourbody-ios', 'logyourbody-ios', false, true, true,
	'["openid","profile","email","offline_access"]'::jsonb,
	'LogYourBody iOS', '["logyourbody://oauth"]'::jsonb, 'none',
	'["authorization_code","refresh_token"]'::jsonb, '["code"]'::jsonb,
	true, 'native', true
) ON CONFLICT ("client_id") DO NOTHING;
