/**
 * Artist Identity Links — Raw storage layer.
 *
 * Stores all enrichment data from any source (MusicFetch, MusicBrainz, SERP)
 * into artist_identity_links. Upserts on (profile, source, platform).
 */

import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';

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
 * Single batch INSERT ... ON CONFLICT DO UPDATE for all links.
 */
export async function storeRawIdentityLinks(
  tx: DbOrTransaction,
  creatorProfileId: string,
  source: string,
  sourceRequestUrl: string,
  links: RawIdentityLink[]
): Promise<number> {
  if (links.length === 0) return 0;

  const now = new Date();

  const rows = links.map(link => ({
    creatorProfileId,
    platform: link.platform,
    url: link.url,
    externalId: link.externalId ?? null,
    source,
    sourceRequestUrl,
    rawPayload: link.rawPayload ?? {},
    fetchedAt: now,
    createdAt: now,
  }));

  try {
    await tx
      .insert(artistIdentityLinks)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          artistIdentityLinks.creatorProfileId,
          artistIdentityLinks.source,
          artistIdentityLinks.platform,
        ],
        set: {
          url: drizzleSql`excluded.url`,
          externalId: drizzleSql`excluded.external_id`,
          sourceRequestUrl: drizzleSql`excluded.source_request_url`,
          rawPayload: drizzleSql`excluded.raw_payload`,
          fetchedAt: drizzleSql`excluded.fetched_at`,
        },
      });
    return rows.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isMissingTable =
      /relation\s+"?artist_identity_links"?\s+does not exist/i.test(message) ||
      (message.includes('does not exist') &&
        message.includes('artist_identity_links'));

    if (isMissingTable) {
      return 0; // pre-migration graceful degradation
    }

    logger.error('Failed to store identity links', {
      creatorProfileId,
      source,
      count: links.length,
      error: message,
    });
    throw error;
  }
}
