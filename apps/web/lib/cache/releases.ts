import { revalidateTag } from 'next/cache';
import { createReleasesTag, createSmartLinkContentTag } from './tags';

/**
 * Mutation-to-invalidation map for release caches (JOV-6272).
 *
 * One canonical entry point for every release mutation that persists a write
 * (create, rename/edit, archive, restore, delete, provider overrides,
 * artwork, lyrics, canvas, audio snippet/confirm, Spotify sync). It
 * invalidates exactly the dependent server caches after successful
 * persistence:
 *
 * - `releases:<userId>:<profileId>` — the unified release matrix/entity
 *   server cache (one key family keyed by userId+profileId only; the handle
 *   never participates, so a rename does not fork the family).
 * - `smartlink-content:<profileId>` — smart-link content derived from
 *   release rows.
 *
 * Authorization is checked by each caller BEFORE persistence; this map only
 * runs after a successful write. Old-handle/new-handle public profile paths
 * are owned by `invalidateUsernameChange` in `./profile` — do not duplicate
 * them here.
 */
export function invalidateReleaseCaches(
  userId: string,
  profileId: string
): void {
  revalidateTag(createReleasesTag(userId, profileId), 'max');
  revalidateTag(createSmartLinkContentTag(profileId), 'max');
}
