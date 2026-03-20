import { and, sql as drizzleSql, eq, gte, isNotNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSessionTx } from '@/lib/auth/session';
import { audienceMembers } from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

/**
 * GET /api/dashboard/retargeting/attribution
 *
 * Returns conversion attribution stats: how many subscribers came from
 * retargeting ads, broken down by platform, for the last 30 days.
 */
export async function GET() {
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
      // Get user's profile
      const [userProfile] = await tx
        .select({
          profileId: creatorProfiles.id,
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

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Query audience members with retargeting attribution in the last 30 days
      const rows = await tx
        .select({
          attributionSource: audienceMembers.attributionSource,
          count: drizzleSql<number>`count(*)::int`,
        })
        .from(audienceMembers)
        .where(
          and(
            eq(audienceMembers.creatorProfileId, userProfile.profileId),
            isNotNull(audienceMembers.attributionSource),
            gte(audienceMembers.createdAt, thirtyDaysAgo)
          )
        )
        .groupBy(audienceMembers.attributionSource);

      // Build the response
      const byPlatform: Record<string, number> = {
        retargeting_meta: 0,
        retargeting_google: 0,
        retargeting_tiktok: 0,
      };

      let total = 0;
      for (const row of rows) {
        const source = row.attributionSource;
        if (source && source in byPlatform) {
          byPlatform[source] = row.count;
          total += row.count;
        }
      }

      return NextResponse.json(
        { total, byPlatform },
        { headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    logger.error('[Attribution GET] Error fetching attribution stats:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    await captureError('Attribution stats failed', error, {
      route: '/api/dashboard/retargeting/attribution',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to fetch attribution stats' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
