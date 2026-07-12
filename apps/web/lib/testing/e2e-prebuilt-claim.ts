/**
 * Stable identifiers for the GTM prebuilt-profile claim smoke fixture.
 *
 * Seed writes the SHA-256 of {@link E2E_PREBUILT_CLAIM_TOKEN} into
 * `creator_profiles.claim_token` for the unclaimed public profile
 * {@link E2E_PREBUILT_CLAIM_USERNAME}. Keep these values in lockstep with
 * `apps/web/tests/seed-test-data.ts` and `claim-prebuilt.smoke.spec.ts`.
 */
export const E2E_PREBUILT_CLAIM_USERNAME = 'testartist';
export const E2E_PREBUILT_CLAIM_TOKEN = 'e2e-prebuilt-claim-token';
export const E2E_PREBUILT_CLAIM_SPOTIFY_ID = '3WrFJ7ztbogyGnTHbHJFl2';
