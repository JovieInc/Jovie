import { and, sql as drizzleSql, eq, gte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSessionTx } from '@/lib/auth/session';
import { users } from '@/lib/db/schema/auth';
import { pixelEvents } from '@/lib/db/schema/pixels';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'inactive';

const PLATFORMS = ['facebook', 'google', 'tiktok'] as const;
type Platform = (typeof PLATFORMS)[number];

interface PlatformHealth {
  status: HealthStatus;
  totalSent: number;
  totalFailed: number;
  lastSuccessAt: string | null;
}

interface HealthResponse {
  platforms: Record<Platform, PlatformHealth>;
  aggregate: {
    totalEventsThisWeek: number;
    overallSuccessRate: number;
  };
}

/**
 * Determine health status for a platform based on its forwarding stats.
 */
function computeHealthStatus(
  totalSent: number,
  totalFailed: number,
  lastSuccessAt: Date | null
): HealthStatus {
  const total = totalSent + totalFailed;

  if (total === 0) {
    return 'inactive';
  }

  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
  const seventyTwoHoursAgo = now - 72 * 60 * 60 * 1000;

  const failureRate = total > 0 ? totalFailed / total : 0;
  const lastSuccessMs = lastSuccessAt ? lastSuccessAt.getTime() : 0;

  // Unhealthy: all failing OR no success in 7 days (which means lastSuccessAt is either null or very old)
  if (totalSent === 0 || !lastSuccessAt) {
    return 'unhealthy';
  }

  // Healthy: last success within 24h AND failure rate < 10%
  if (lastSuccessMs >= twentyFourHoursAgo && failureRate < 0.1) {
    return 'healthy';
  }

  // Degraded: some failures in last 24h OR no events in 24-72h
  if (failureRate >= 0.1 || lastSuccessMs < twentyFourHoursAgo) {
    if (lastSuccessMs >= seventyTwoHoursAgo) {
      return 'degraded';
    }
    return 'unhealthy';
  }

  return 'degraded';
}

/**
 * GET /api/dashboard/pixels/health
 *
 * Returns pixel forwarding health status per platform and aggregate stats.
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

      // Aggregate per-platform stats using SQL (avoids loading all events into memory)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Single SQL query that computes per-platform sent/failed/lastSuccess
      // by extracting status from the JSONB forwarding_status column.
      const statsRows = await tx
        .select({
          platform: drizzleSql<string>`p.platform`,
          sent: drizzleSql<number>`count(*) FILTER (WHERE p.status = 'sent')::int`,
          failed: drizzleSql<number>`count(*) FILTER (WHERE p.status IN ('failed', 'dead_letter'))::int`,
          lastSuccessAt: drizzleSql<
            string | null
          >`max(CASE WHEN p.status = 'sent' THEN COALESCE(p.sent_at, pe.created_at::text) END)`,
        })
        .from(
          drizzleSql`${pixelEvents} pe,
          LATERAL (
            SELECT key AS platform,
                   value->>'status' AS status,
                   value->>'sentAt' AS sent_at
            FROM jsonb_each(pe.forwarding_status::jsonb)
            WHERE key IN ('facebook', 'google', 'tiktok')
          ) p`
        )
        .where(
          and(
            eq(pixelEvents.profileId, userProfile.profileId),
            gte(pixelEvents.createdAt, sevenDaysAgo)
          )
        )
        .groupBy(drizzleSql`p.platform`);

      // Also get total event count for aggregate stats
      const [eventCount] = await tx
        .select({
          total: drizzleSql<number>`count(*)::int`,
        })
        .from(pixelEvents)
        .where(
          and(
            eq(pixelEvents.profileId, userProfile.profileId),
            gte(pixelEvents.createdAt, sevenDaysAgo)
          )
        );

      // Build health response from SQL results
      const platforms = {} as Record<Platform, PlatformHealth>;
      let totalSentAll = 0;
      let totalFailedAll = 0;

      // Initialize all platforms as inactive
      for (const platform of PLATFORMS) {
        platforms[platform] = {
          status: 'inactive',
          totalSent: 0,
          totalFailed: 0,
          lastSuccessAt: null,
        };
      }

      // Fill in from SQL results
      for (const row of statsRows) {
        const platform = row.platform as Platform;
        if (!PLATFORMS.includes(platform)) continue;

        const lastSuccessDate = row.lastSuccessAt
          ? new Date(row.lastSuccessAt)
          : null;

        totalSentAll += row.sent;
        totalFailedAll += row.failed;

        platforms[platform] = {
          status: computeHealthStatus(row.sent, row.failed, lastSuccessDate),
          totalSent: row.sent,
          totalFailed: row.failed,
          lastSuccessAt: lastSuccessDate ? lastSuccessDate.toISOString() : null,
        };
      }

      const totalAll = totalSentAll + totalFailedAll;
      const overallSuccessRate =
        totalAll > 0 ? Math.round((totalSentAll / totalAll) * 100) : 0;

      const response: HealthResponse = {
        platforms,
        aggregate: {
          totalEventsThisWeek: eventCount?.total ?? 0,
          overallSuccessRate,
        },
      };

      return NextResponse.json(response, { headers: NO_STORE_HEADERS });
    });
  } catch (error) {
    logger.error('[Pixels Health] Error fetching pixel health:', error);
    if (!(error instanceof Error && error.message === 'Unauthorized')) {
      await captureError('Pixel health check failed', error, {
        route: '/api/dashboard/pixels/health',
        method: 'GET',
      });
    }
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch pixel health' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
