-- Remove the retired DESIGN_V1 row and overrides that now match permanent
-- code defaults. Audit events remain as the immutable change history.
DELETE FROM "feature_flag_overrides"
WHERE "flag_key" IN (
	'code:DESIGN_V1',
	'code:INBOX_HOME',
	'code:PROFILES_WORKSPACE',
	'code:PROFILE_SEARCH_MONITORING',
	'code:BILLING_UPGRADE_DIRECT',
	'code:PLAYLIST_ENGINE',
	'code:MERCH_MVP',
	'code:APPLE_WALLET_PROFILE_PASS',
	'code:TELEPROMPTER_RECORDING',
	'code:RELEASE_TO_REVENUE_AUTOPILOT',
	'code:AI_CONNECTORS_BETA'
);
