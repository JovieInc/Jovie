-- JOV-3114: Connector enrichment pipelines — extend context_fact_kind for graph facts
ALTER TYPE "public"."context_fact_kind" ADD VALUE IF NOT EXISTS 'event_signal';--> statement-breakpoint
ALTER TYPE "public"."context_fact_kind" ADD VALUE IF NOT EXISTS 'tour_date_known';--> statement-breakpoint
ALTER TYPE "public"."context_fact_kind" ADD VALUE IF NOT EXISTS 'person_mentioned';--> statement-breakpoint
ALTER TYPE "public"."context_fact_kind" ADD VALUE IF NOT EXISTS 'song_mentioned';--> statement-breakpoint
ALTER TYPE "public"."context_fact_kind" ADD VALUE IF NOT EXISTS 'location_mentioned';--> statement-breakpoint
ALTER TYPE "public"."context_fact_kind" ADD VALUE IF NOT EXISTS 'studio_location';