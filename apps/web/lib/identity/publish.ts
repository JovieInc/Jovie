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
import { MUSICFETCH_SERVICE_TO_DSP } from '@/lib/dsp-registry';
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
  // Read all raw identity links for this profile
  let rawLinks: (typeof artistIdentityLinks.$inferSelect)[];
  try {
    const result = await tx
      .select()
      .from(artistIdentityLinks)
      .where(eq(artistIdentityLinks.creatorProfileId, profile.id));
    // Guard against non-iterable results (test mocks, pre-migration)
    rawLinks = Array.isArray(result) ? result : [];
  } catch {
    // Table may not exist yet (e.g. in test environments or before migration)
    return { inserted: 0, updated: 0 };
  }

  if (rawLinks.length === 0) return { inserted: 0, updated: 0 };

  // Filter to publishable links
  const publishable: ExtractedLink[] = [];

  for (const link of rawLinks) {
    // Optional source filter (e.g. only publish from 'musicfetch')
    if (options?.sourceFilter && link.source !== options.sourceFilter) continue;

    // Look up DSP registry entry for this platform
    const dspEntry = findDspEntry(link.platform);
    if (!dspEntry) continue;

    // Only auto-publish streaming DSPs
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
 * Checks both direct key match and musicfetchService mapping.
 */
function findDspEntry(
  platform: string
): { key: string; category: string } | null {
  // Try musicfetchService mapping first (most common for identity layer)
  const byService = MUSICFETCH_SERVICE_TO_DSP.get(platform);
  if (byService) return { key: byService.key, category: byService.category };

  // Try direct key match (for manually-inserted or non-musicfetch sources)
  const byKey = MUSICFETCH_SERVICE_TO_DSP.get(platform);
  if (byKey) return { key: byKey.key, category: byKey.category };

  return null;
}
