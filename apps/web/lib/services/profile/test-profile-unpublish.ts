import { sql as drizzleSql } from 'drizzle-orm';

/**
 * Domain write: unpublish test-account profiles and release their Spotify pool
 * binding. The only direct creator_profiles write used by test-profile cleanup
 * (lib/profile/test-profile-cleanup.ts). Returns a query; the caller runs it
 * inside its own system-actor transaction.
 */
export function buildUnpublishTestProfilesQuery(ids: readonly string[]) {
  return drizzleSql`
    UPDATE creator_profiles
    SET is_public = false, spotify_id = NULL, spotify_url = NULL,
        updated_at = now()
    WHERE id::text IN (${drizzleSql.join(
      ids.map(id => drizzleSql`${id}`),
      drizzleSql`, `
    )})
    RETURNING id
  `;
}
