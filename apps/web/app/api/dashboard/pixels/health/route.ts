import { and, sql as drizzleSql, eq, gte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { pixelEvents } from '@/lib/db/schema/pixels';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  computeHealthStatus,
  type HealthStatus,
} from '@/lib/tracking/track-helpers';
import { withPixelSession } from '@/lib/tracking/with-pixel-session';

export const runtime = 'nodejs';

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
 * GET /api/dashboard/pixels/health
 *
 * Returns pixel forwarding health status per platform and aggregate stats.
 */
export async function GET() {
  return withPixelSession('Pixels Health', async (tx, { profileId }) => {
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
        >`max(CASE WHEN p.status = 'sent' THEN COALESCE((p.sent_at)::timestamptz, pe.created_at) END)::text`,
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
        drizzleSql`pe.profile_id = ${profileId} AND pe.created_at >= ${sevenDaysAgo}`
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
          eq(pixelEvents.profileId, profileId),
          gte(pixelEvents.createdAt, sevenDaysAgo)
        )
      );

    // Build health response from SQL results
    const platforms = {} as Record<Platform, PlatformHealth>;
    let totalSentAll = 0;
    let totalFailedAll = 0;

    for (const platform of PLATFORMS) {
      platforms[platform] = {
        status: 'inactive',
        totalSent: 0,
        totalFailed: 0,
        lastSuccessAt: null,
      };
    }

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
}
