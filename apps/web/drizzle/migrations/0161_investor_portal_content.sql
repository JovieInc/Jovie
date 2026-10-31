CREATE TABLE IF NOT EXISTS "investor_portal_content" (
	"path" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"body_base64" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
