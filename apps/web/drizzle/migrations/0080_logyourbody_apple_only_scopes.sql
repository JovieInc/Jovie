UPDATE "ba_oauth_clients"
SET
	"scopes" = '["openid","profile","email","offline_access"]'::jsonb,
	"updated_at" = now()
WHERE "client_id" IN ('logyourbody-ios', 'logyourbody-web');
