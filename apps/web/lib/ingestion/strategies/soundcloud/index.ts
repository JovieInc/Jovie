/**
 * SoundCloud Pro Badge Detection & Storage
 *
 * Detects SoundCloud Pro subscription status and stores the result
 * in the socialAccounts table for fit score calculation.
 */

import { sql as drizzleSql } from 'drizzle-orm';

import type { DbOrTransaction } from '@/lib/db';
import { socialAccounts } from '@/lib/db/schema/links';
import { calculateAndStoreFitScore } from '@/lib/fit-scoring/service';

import {
  fetchAndDetectSoundCloudPro,
  normalizeSoundCloudSlug,
} from './pro-badge';

/**
 * Detect SoundCloud Pro status and store the result.
 *
 * - Positive detection: upsert socialAccounts with paidFlag=true
 * - Negative detection: upsert with paidFlag=false
 * - Null (uncertain): do nothing
 *
 * Uses an atomic upsert on (creatorProfileId, platform) to prevent race conditions.
 * After storing, immediately rescores the profile's fit score.
 *
 * @param db - Database client (use plainDb, not tx, for non-blocking)
 * @param creatorProfileId - Creator profile ID
 * @param soundcloudSlug - SoundCloud username/slug
 * @returns Whether Pro was detected (true/false/null)
 */
export async function detectAndStoreSoundCloudProStatus(
  db: DbOrTransaction,
  creatorProfileId: string,
  soundcloudSlug: string
): Promise<boolean | null> {
  const normalizedSlug = normalizeSoundCloudSlug(soundcloudSlug);
  const result = await fetchAndDetectSoundCloudPro(normalizedSlug);

  if (result.isPro === null) {
    // Uncertain, don't overwrite existing data
    return null;
  }

  const now = new Date();

  const rawData: Record<string, unknown> = result.isPro
    ? {
        tier: result.tier,
        productId: result.productId,
        detectedAt: now.toISOString(),
      }
    : {
        tier: null,
        productId: result.productId,
        detectedAt: now.toISOString(),
        clearedReason: 'negative_detection',
      };

  // Atomic upsert: prevents race conditions from concurrent enrichment runs
  await db
    .insert(socialAccounts)
    .values({
      creatorProfileId,
      platform: 'soundcloud',
      handle: normalizedSlug,
      url: `https://soundcloud.com/${normalizedSlug}`,
      status: 'confirmed',
      confidence: '0.95',
      isVerifiedFlag: false,
      paidFlag: result.isPro,
      rawData,
      sourcePlatform: 'soundcloud',
      sourceType: 'ingested',
    })
    .onConflictDoUpdate({
      target: [socialAccounts.creatorProfileId, socialAccounts.platform],
      set: {
        paidFlag: result.isPro,
        rawData,
        status: 'confirmed',
        updatedAt: drizzleSql`now()`,
      },
    });

  // Immediately rescore the profile
  await calculateAndStoreFitScore(db, creatorProfileId);

  return result.isPro;
}
