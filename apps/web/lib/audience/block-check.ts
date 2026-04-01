import { and, eq, isNull, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { audienceBlocks } from '@/lib/db/schema/analytics';
import { captureError } from '@/lib/error-tracking';

/**
 * Check if a visitor is blocked from viewing a creator's profile.
 *
 * Checks fingerprint first (fast, hits partial unique index), then falls
 * back to email if provided. Fails open on DB errors — a blocked visitor
 * slipping through briefly is better than locking out all visitors.
 */
export async function isVisitorBlocked(
  profileId: string,
  fingerprint: string,
  email?: string | null
): Promise<boolean> {
  try {
    // Build conditions: always check fingerprint, optionally check email
    const conditions = [
      and(
        eq(audienceBlocks.creatorProfileId, profileId),
        eq(audienceBlocks.fingerprint, fingerprint),
        isNull(audienceBlocks.unblockedAt)
      ),
    ];

    if (email) {
      conditions.push(
        and(
          eq(audienceBlocks.creatorProfileId, profileId),
          eq(audienceBlocks.email, email.toLowerCase()),
          isNull(audienceBlocks.unblockedAt)
        )
      );
    }

    const blocked = await db
      .select({ id: audienceBlocks.id })
      .from(audienceBlocks)
      .where(or(...conditions))
      .limit(1);

    return blocked.length > 0;
  } catch (error) {
    // Fail open: don't lock out visitors on DB errors.
    // Matches ban-check.ts fail-open pattern.
    captureError('Audience block check failed', error, {
      profileId,
      fingerprint: fingerprint.slice(0, 8),
    });
    return false;
  }
}
