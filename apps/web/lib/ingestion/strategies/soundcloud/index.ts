/**
 * SoundCloud Pro Badge Detection & Storage
 *
 * Detects SoundCloud Pro subscription status and stores the result
 * in the socialAccounts table for fit score calculation.
 */

import { and, eq } from 'drizzle-orm';

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
 * - Positive detection: insert or update socialAccounts with paidFlag=true
 * - Negative detection: clear paidFlag if stale positive exists
 * - Null (uncertain): do nothing
 *
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

  // Check for existing soundcloud social account row
  const [existing] = await db
    .select({
      id: socialAccounts.id,
      paidFlag: socialAccounts.paidFlag,
    })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.creatorProfileId, creatorProfileId),
        eq(socialAccounts.platform, 'soundcloud')
      )
    )
    .limit(1);

  const now = new Date();

  if (result.isPro) {
    // Positive detection: insert or update
    const rawData: Record<string, unknown> = {
      tier: result.tier,
      productId: result.productId,
      detectedAt: now.toISOString(),
    };

    if (existing) {
      await db
        .update(socialAccounts)
        .set({
          paidFlag: true,
          rawData,
          status: 'confirmed',
          updatedAt: now,
        })
        .where(eq(socialAccounts.id, existing.id));
    } else {
      await db.insert(socialAccounts).values({
        creatorProfileId,
        platform: 'soundcloud',
        handle: normalizedSlug,
        url: `https://soundcloud.com/${normalizedSlug}`,
        status: 'confirmed',
        confidence: '0.95',
        isVerifiedFlag: false, // Pro is a subscription, not verification
        paidFlag: true,
        rawData,
        sourcePlatform: 'soundcloud',
        sourceType: 'ingested',
      });
    }
  } else {
    // Negative detection: clear stale paidFlag if exists
    if (existing?.paidFlag) {
      await db
        .update(socialAccounts)
        .set({
          paidFlag: false,
          rawData: {
            tier: null,
            productId: result.productId,
            detectedAt: now.toISOString(),
            clearedReason: 'negative_detection',
          },
          updatedAt: now,
        })
        .where(eq(socialAccounts.id, existing.id));
    }
  }

  // Immediately rescore the profile
  await calculateAndStoreFitScore(db, creatorProfileId);

  return result.isPro;
}
