/**
 * Artist Identity Links — Publishing layer.
 *
 * Reads raw identity links and promotes qualifying ones into social_links
 * via the existing normalizeAndMergeExtraction() pipeline.
 *
 * Publishing rules:
 * - streaming DSPs → auto-publish (high confidence, active state)
 * - video/metadata/social → stored raw only, not published
 */

import 'server-only';

import { eq } from 'drizzle-orm';

import { type DbOrTransaction } from '@/lib/db';
import { artistIdentityLinks } from '@/lib/db/schema/identity';
import {
  getRegistryEntry,
  MUSICFETCH_SERVICE_TO_DSP,
} from '@/lib/dsp-registry';
import { normalizeAndMergeExtraction } from '@/lib/ingestion/merge';
import type { ExtractedLink, ExtractionResult } from '@/lib/ingestion/types';
import { logger } from '@/lib/utils/logger';

/** Profile shape required by normalizeAndMergeExtraction */
interface ProfileForPublish {
  id: string;
  usernameNormalized: string | null;
  avatarUrl: string | null;
  displayName: string | null;
  avatarLockedByUser: boolean | null;
  displayNameLocked: boolean | null;
}

/** Categories that auto-publish from the identity layer */
const AUTO_PUBLISH_CATEGORIES = new Set(['streaming']);

/** Confidence signal for auto-published identity links */
const PUBLISH_SIGNAL = 'musicfetch_artist_lookup';

/**
 * Check if an error is a missing-table error (pre-migration graceful degradation).
 * Shared logic between store and publish layers.
 */
function isMissingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return (
    /relation\s+"?artist_identity_links"?\s+does not exist/i.test(message) ||
    (message.includes('does not exist') &&
      message.includes('artist_identity_links'))
  );
}

/**
 * Read raw identity links for a profile. Returns empty array if table
 * doesn't exist yet (pre-migration graceful degradation).
 */
async function readIdentityLinks(
  tx: DbOrTransaction,
  profileId: string
): Promise<(typeof artistIdentityLinks.$inferSelect)[]> {
  try {
    const result = await tx
      .select()
      .from(artistIdentityLinks)
      .where(eq(artistIdentityLinks.creatorProfileId, profileId));
    return Array.isArray(result) ? result : [];
  } catch (error) {
    if (isMissingTableError(error)) return [];
    logger.error('Identity layer: failed to read identity links', {
      creatorProfileId: profileId,
      error: error instanceof Error ? error.message : '',
    });
    throw error;
  }
}

/**
 * Project raw identity links into publishable ExtractedLink objects.
 * Filters by source and category (streaming only).
 */
function projectPublishableLinks(
  rawLinks: (typeof artistIdentityLinks.$inferSelect)[],
  sourceFilter?: string
): ExtractedLink[] {
  const publishable: ExtractedLink[] = [];

  for (const link of rawLinks) {
    if (sourceFilter && link.source !== sourceFilter) continue;

    const dspEntry = findDspEntry(link.platform);
    if (!dspEntry) continue;
    if (!AUTO_PUBLISH_CATEGORIES.has(dspEntry.category)) continue;

    publishable.push({
      url: link.url,
      platformId: dspEntry.key,
      sourcePlatform: link.source,
      evidence: {
        sources: [link.source],
        signals: [PUBLISH_SIGNAL],
      },
    });
  }

  return publishable;
}

/**
 * Publish qualifying identity links to social_links.
 *
 * Reads all raw identity links for a profile, filters to publishable
 * categories (streaming), and delegates to the existing merge pipeline.
 */
export async function publishIdentityLinks(
  tx: DbOrTransaction,
  profile: ProfileForPublish,
  options?: { sourceFilter?: string }
): Promise<{ inserted: number; updated: number }> {
  const rawLinks = await readIdentityLinks(tx, profile.id);
  if (rawLinks.length === 0) return { inserted: 0, updated: 0 };

  const publishable = projectPublishableLinks(rawLinks, options?.sourceFilter);
  if (publishable.length === 0) return { inserted: 0, updated: 0 };

  const extraction: ExtractionResult = {
    links: publishable,
    sourcePlatform: options?.sourceFilter ?? 'identity_layer',
    sourceUrl: null,
  };

  const result = await normalizeAndMergeExtraction(tx, profile, extraction);

  logger.info('Identity layer: published links to social_links', {
    creatorProfileId: profile.id,
    totalRaw: rawLinks.length,
    publishable: publishable.length,
    inserted: result.inserted,
    updated: result.updated,
  });

  return result;
}

/**
 * Find DSP registry entry by platform key.
 *
 * Identity links store DSP registry keys (snake_case: apple_music, soundcloud).
 * First tries direct key lookup, then falls back to MusicFetch service name
 * mapping (for example: appleMusic, soundcloud) for compatibility.
 */
function findDspEntry(
  platform: string
): { key: string; category: string } | null {
  const byKey = getRegistryEntry(platform);
  if (byKey) return { key: byKey.key, category: byKey.category };

  const byService = MUSICFETCH_SERVICE_TO_DSP.get(platform);
  if (byService) return { key: byService.key, category: byService.category };

  return null;
}
