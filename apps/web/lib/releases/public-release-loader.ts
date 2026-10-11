import 'server-only';

import { unstable_cache } from 'next/cache';
import { CACHE_TTL, createPublicReleasesTag } from '@/lib/cache/tags';
import { getReleasesForProfileLite } from '@/lib/discography/queries';

/**
 * Cache the public release projection by immutable profile ID. Public pages
 * and feeds both depend on this entry, so the central release mutation map can
 * invalidate every public release surface without resolving a mutable handle.
 */
export async function getCachedPublicReleasesForProfile(profileId: string) {
  return unstable_cache(
    () => getReleasesForProfileLite(profileId),
    ['public-releases', profileId],
    {
      revalidate: CACHE_TTL.LONG,
      tags: [createPublicReleasesTag(profileId)],
    }
  )();
}
