/**
 * Shared session wrapper for pixel dashboard API routes.
 *
 * Deduplicates the entitlements check → profile lookup → error handling
 * pattern used by /api/dashboard/pixels/health, /test-event, and /retargeting/attribution.
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSessionTx } from '@/lib/auth/session';
import type { DbOrTransaction } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { logger } from '@/lib/utils/logger';

interface PixelSessionContext {
  profileId: string;
  username: string;
}

/**
 * Wraps a pixel dashboard handler with entitlements check, profile lookup,
 * and standardized error handling. Eliminates boilerplate across pixel API routes.
 */
export async function withPixelSession(
  routeLabel: string,
  handler: (
    tx: DbOrTransaction,
    ctx: PixelSessionContext
  ) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const entitlements = await getCurrentUserEntitlements();
    if (!entitlements.canAccessAdPixels) {
      return NextResponse.json(
        {
          error:
            'Ad pixels require a Pro plan. Upgrade to unlock this feature.',
        },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    return await withDbSessionTx(async (tx, clerkUserId) => {
      const [userProfile] = await tx
        .select({
          profileId: creatorProfiles.id,
          username: creatorProfiles.username,
        })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.userId))
        .where(eq(users.clerkId, clerkUserId))
        .limit(1);

      if (!userProfile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      return handler(tx, {
        profileId: userProfile.profileId,
        username: userProfile.username,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    logger.error(`[${routeLabel}] Error:`, error);
    await captureError(`${routeLabel} failed`, error, {
      route: routeLabel,
    });
    return NextResponse.json(
      { error: `Failed: ${routeLabel}` },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
