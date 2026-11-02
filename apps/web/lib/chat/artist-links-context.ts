import 'server-only';

import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { socialLinks } from '@/lib/db/schema/links';
import { logger } from '@/lib/utils/logger';
import {
  type ArtistLinksContext,
  EMPTY_ARTIST_LINKS_CONTEXT,
  normalizeProfileLinks,
} from './artist-links';

/**
 * The artist's own active profile links and OAuth-connected accounts, so chat
 * can answer "you should already have my YouTube" from data instead of asking
 * (2026-11-01 transcript: chat saw only `hasSocialLinks: true`).
 *
 * Fail-soft: a read error returns the empty context and is logged; chat must
 * never fail because the links read did.
 */
export async function fetchArtistLinksContext(input: {
  readonly profileId: string;
  readonly userId: string;
}): Promise<ArtistLinksContext> {
  try {
    const [links, connected] = await Promise.all([
      db
        .select({ platform: socialLinks.platform, url: socialLinks.url })
        .from(socialLinks)
        .where(
          and(
            eq(socialLinks.creatorProfileId, input.profileId),
            eq(socialLinks.state, 'active')
          )
        )
        .orderBy(asc(socialLinks.sortOrder))
        .limit(60),
      db
        .select({ provider: connectorAccounts.provider })
        .from(connectorAccounts)
        .where(
          and(
            eq(connectorAccounts.userId, input.userId),
            eq(connectorAccounts.creatorProfileId, input.profileId),
            eq(connectorAccounts.status, 'connected')
          )
        ),
    ]);
    return {
      links: normalizeProfileLinks(links),
      connectedAccounts: [...new Set(connected.map(row => row.provider))],
    };
  } catch (error) {
    logger.warn('Artist links unavailable for chat context', {
      profileId: input.profileId,
      error,
    });
    return EMPTY_ARTIST_LINKS_CONTEXT;
  }
}
