import { and, sql as drizzleSql, gte, isNotNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { audienceMembers } from '@/lib/db/schema/analytics';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { withPixelSession } from '@/lib/tracking/with-pixel-session';

export const runtime = 'nodejs';

/**
 * GET /api/dashboard/retargeting/attribution
 *
 * Returns conversion attribution stats: how many subscribers came from
 * retargeting ads, broken down by platform, for the last 30 days.
 */
export async function GET() {
  return withPixelSession('Attribution', async (tx, { profileId }) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const rows = await tx
      .select({
        attributionSource: audienceMembers.attributionSource,
        count: drizzleSql<number>`count(*)::int`,
      })
      .from(audienceMembers)
      .where(
        and(
          drizzleSql`${audienceMembers.creatorProfileId} = ${profileId}`,
          isNotNull(audienceMembers.attributionSource),
          gte(audienceMembers.createdAt, thirtyDaysAgo)
        )
      )
      .groupBy(audienceMembers.attributionSource);

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
}
