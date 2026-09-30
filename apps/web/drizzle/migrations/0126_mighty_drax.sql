CREATE TABLE "music_resolver_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"input_key" text NOT NULL,
	"receipt" jsonb NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "music_resolver_receipts_input_key_unique" UNIQUE("input_key")
);
