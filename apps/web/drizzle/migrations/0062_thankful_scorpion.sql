ALTER TABLE "lead_pipeline_settings" ADD COLUMN "dm_opener_template" text DEFAULT 'Hey {displayName}! Came across your music on Spotify — really dig your sound. I actually built a link-in-bio tool made specifically for musicians. Would love to show you if you''re interested!';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "dm_opener" text;
