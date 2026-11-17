import 'server-only';

import { findRedirectByOldSlug } from '@/lib/discography/slug';
import { legacyTrackSlugFallback } from '@/lib/discography/slug-migration-plan';
import { logger } from '@/lib/utils/logger';
import { getTrackBySlugInRelease } from './data';
import { trackSlugExistsInRelease } from './track-slug-exists';

/**
 * Where an old track URL moved to, or null. Covers the two renames made by
 * the legacy slug migration (lib/discography/slug-migration.ts):
 *  - the parent release slug changed: its redirect row names the new slug;
 *  - the track slug lost its numeric suffix (`sober-2` -> `sober`) within
 *    the same release. A track that still exists under the requested slug
 *    (for example one with no provider links yet) never redirects: that URL
 *    is its own, not a moved one.
 */
export async function resolveMovedTrackPath(input: {
  readonly creatorId: string;
  readonly handle: string;
  readonly releaseSlug: string;
  readonly trackSlug: string;
  /** The release resolved from `releaseSlug`, or null when it did not resolve. */
  readonly releaseId: string | null;
}): Promise<string | null> {
  const { creatorId, handle, releaseSlug, trackSlug, releaseId } = input;

  if (releaseId === null) {
    const moved = await findRedirectByOldSlug(creatorId, releaseSlug);
    return moved?.type === 'release' && moved.currentSlug !== releaseSlug
      ? `/${handle}/${moved.currentSlug}/${trackSlug}`
      : null;
  }

  const base = legacyTrackSlugFallback(trackSlug);
  if (!base) return null;
  try {
    if (await trackSlugExistsInRelease(releaseId, trackSlug)) return null;
  } catch (error) {
    // A 308 is cached for good, so a failed check never redirects: the
    // page falls through to its normal lookup and 404 handling.
    logger.warn('[moved-track-path] slug check failed; not redirecting', {
      releaseId,
      trackSlug,
      error,
    });
    return null;
  }
  const track = await getTrackBySlugInRelease(releaseId, base);
  return track ? `/${handle}/${releaseSlug}/${base}` : null;
}
