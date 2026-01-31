-- Optimize provider_links query performance for release filtering
-- This index supports the query pattern: WHERE owner_type = 'release' AND release_id IN (...)

CREATE INDEX IF NOT EXISTS "idx_provider_links_owner_type_release_id"
ON "provider_links" USING btree ("owner_type", "release_id")
WHERE "release_id" IS NOT NULL;