-- JOV-4664: enforce one merch card per selected design option.
-- Preflight: where a race already produced duplicate cards, the earliest-created
-- card per selected_design_option_id is canonical. Duplicates keep their row
-- (and any order/payout history) but lose the option link — the same end state
-- as merch_design_options deletion via ON DELETE SET NULL.

-- Repoint batches that reference a losing duplicate to the canonical card.
UPDATE "merch_generation_batches" AS "batch"
SET "selected_merch_card_id" = (
	SELECT "canonical"."id"
	FROM "merch_cards" AS "canonical"
	WHERE "canonical"."selected_design_option_id" = "loser"."selected_design_option_id"
	ORDER BY "canonical"."created_at" ASC, "canonical"."id" ASC
	LIMIT 1
)
FROM "merch_cards" AS "loser"
WHERE "batch"."selected_merch_card_id" = "loser"."id"
	AND "loser"."selected_design_option_id" IS NOT NULL
	AND EXISTS (
		SELECT 1
		FROM "merch_cards" AS "earlier"
		WHERE "earlier"."selected_design_option_id" = "loser"."selected_design_option_id"
			AND ("earlier"."created_at", "earlier"."id") < ("loser"."created_at", "loser"."id")
	);
--> statement-breakpoint
-- Detach losing duplicates so the unique index can build.
UPDATE "merch_cards" AS "loser"
SET "selected_design_option_id" = NULL,
	"updated_at" = now()
WHERE "loser"."selected_design_option_id" IS NOT NULL
	AND EXISTS (
		SELECT 1
		FROM "merch_cards" AS "earlier"
		WHERE "earlier"."selected_design_option_id" = "loser"."selected_design_option_id"
			AND ("earlier"."created_at", "earlier"."id") < ("loser"."created_at", "loser"."id")
	);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "merch_cards_selected_design_option_unique" ON "merch_cards" USING btree ("selected_design_option_id") WHERE selected_design_option_id IS NOT NULL;
