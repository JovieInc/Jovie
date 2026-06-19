/**
 * Server-side queries for artist entity identity.
 * Reads from artist_identity_links — the raw cross-platform identity store.
 */

import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { artistIdentityLinks } from '@/lib/db/schema/identity';
import { logger } from '@/lib/utils/logger';
import type { EntityIdentityLink } from './sameAs';

/** Platforms we care about for sameAs / structured data */
const ENTITY_PLATFORMS = [
  'musicbrainz',
  'wikidata',
  'isni',
  'spotify',
  'apple_music',
  'youtube',
  'soundcloud',
  'deezer',
  'tidal',
  'amazon_music',
  'bandcamp',
] as const;

/**
 * Fetch stored entity identity links for a profile.
 * Returns an empty array gracefully when the table does not yet exist.
 */
export async function getEntityIdentityLinks(
  profileId: string
): Promise<EntityIdentityLink[]> {
  try {
    const rows = await db
      .select({
        platform: artistIdentityLinks.platform,
        url: artistIdentityLinks.url,
        externalId: artistIdentityLinks.externalId,
      })
      .from(artistIdentityLinks)
      .where(
        and(
          eq(artistIdentityLinks.creatorProfileId, profileId),
          inArray(
            artistIdentityLinks.platform,
            ENTITY_PLATFORMS as unknown as string[]
          )
        )
      );
    return rows;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      /relation\s+"?artist_identity_links"?\s+does not exist/i.test(msg) ||
      (msg.includes('does not exist') && msg.includes('artist_identity_links'))
    ) {
      return [];
    }
    logger.warn('getEntityIdentityLinks: query failed', {
      profileId,
      error: msg,
    });
    return [];
  }
}
