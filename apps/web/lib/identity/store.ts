/**
 * Artist Identity Links — Raw storage layer.
 *
 * Stores all enrichment data from any source (MusicFetch, MusicBrainz, SERP)
 * into artist_identity_links. Upserts on (profile, source, platform).
 */

import 'server-only';

import { type DbOrTransaction } from '@/lib/db';
import { artistIdentityLinks } from '@/lib/db/schema/identity';
import { logger } from '@/lib/utils/logger';

export interface RawIdentityLink {
  platform: string;
  url: string;
  externalId?: string | null;
  rawPayload?: Record<string, unknown>;
}

/**
 * Store raw identity links from an enrichment source.
 * Upserts on (creatorProfileId, source, platform) — re-enrichment overwrites old data.
 */
export async function storeRawIdentityLinks(
  tx: DbOrTransaction,
  creatorProfileId: string,
  source: string,
  sourceRequestUrl: string,
  links: RawIdentityLink[]
): Promise<number> {
  if (links.length === 0) return 0;

  let stored = 0;
  const now = new Date();

  for (const link of links) {
    try {
      await tx
        .insert(artistIdentityLinks)
        .values({
          creatorProfileId,
          platform: link.platform,
          url: link.url,
          externalId: link.externalId ?? null,
          source,
          sourceRequestUrl,
          rawPayload: link.rawPayload ?? {},
          fetchedAt: now,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [
            artistIdentityLinks.creatorProfileId,
            artistIdentityLinks.source,
            artistIdentityLinks.platform,
          ],
          set: {
            url: link.url,
            externalId: link.externalId ?? null,
            sourceRequestUrl,
            rawPayload: link.rawPayload ?? {},
            fetchedAt: now,
          },
        });
      stored++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const isMissingTable =
        /relation\s+"?artist_identity_links"?\s+does not exist/i.test(
          message
        ) ||
        (message.includes('does not exist') &&
          message.includes('artist_identity_links'));

      if (isMissingTable) {
        return 0; // pre-migration graceful degradation
      }

      logger.error('Failed to store identity link', {
        creatorProfileId,
        source,
        platform: link.platform,
        error: message,
      });
      throw error;
    }
  }

  return stored;
}
