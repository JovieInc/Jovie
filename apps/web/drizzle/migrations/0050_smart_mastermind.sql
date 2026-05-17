ALTER TABLE "chat_turns" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD COLUMN IF NOT EXISTS "creator_profile_id" uuid;--> statement-breakpoint
UPDATE "chat_turns"
SET
	"user_id" = "chat_conversations"."user_id",
	"creator_profile_id" = "chat_conversations"."creator_profile_id"
FROM "chat_conversations"
WHERE
	"chat_turns"."conversation_id" = "chat_conversations"."id"
	AND "chat_turns"."user_id" IS NULL
	AND "chat_turns"."creator_profile_id" IS NULL;--> statement-breakpoint
ALTER TABLE "chat_turns" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_turns" ALTER COLUMN "creator_profile_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_chat_turns_profile_client_turn_unique" ON "chat_turns" USING btree ("creator_profile_id","user_id","client_turn_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_turns_user_id" ON "chat_turns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_turns_creator_profile_id" ON "chat_turns" USING btree ("creator_profile_id");
