import * as Sentry from '@sentry/nextjs';
import { sql as drizzleSql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCurrentUserProfile } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { clickEvents } from '@/lib/db/schema/analytics';
import { sqlTimestamp } from '@/lib/db/sql-helpers';
import { getReleaseById } from '@/lib/discography/queries';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

type JsonArray<T> = T[] | string | null;
type AggregateValue = string | number | null;

const parseJsonArray = <T>(value: JsonArray<T>): T[] => {
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T[];
    } catch {
      return [];
    }
  }
  return value;
};

/**
 * GET /api/dashboard/releases/[releaseId]/analytics
 *
 * Lightweight smartlink analytics for a release sidebar panel.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const { releaseId } = await params;

    const release = await getReleaseById(releaseId);
    if (!release || release.creatorProfileId !== profile.id) {
      return NextResponse.json(
        { error: 'Release not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const aggregates = await db
      .execute<{
        total_clicks: AggregateValue;
        clicks_last_7: AggregateValue;
        provider_clicks: JsonArray<{
          provider: string | null;
          clicks: number;
        }>;
      }>(
        drizzleSql`
          with release_clicks as (
            select *
            from ${clickEvents}
            where ${clickEvents.creatorProfileId} = ${profile.id}
              and (${clickEvents.isBot} = false or ${clickEvents.isBot} is null)
              and ${clickEvents.metadata} ->> 'contentId' = ${releaseId}
              and ${clickEvents.metadata} ->> 'contentType' = 'release'
          ),
          recent_clicks as (
            select *
            from release_clicks
            where created_at >= ${sqlTimestamp(sevenDaysAgo)}
          ),
          provider_clicks as (
            select release_clicks.metadata ->> 'provider' as provider, count(*) as clicks
            from release_clicks
            where release_clicks.metadata ->> 'provider' is not null
            group by provider
            order by clicks desc
            limit 5
          )
          select
            (select count(*) from release_clicks) as total_clicks,
            (select count(*) from recent_clicks) as clicks_last_7,
            coalesce((select json_agg(row_to_json(p)) from provider_clicks p), '[]'::json) as provider_clicks
          ;
        `
      )
      .then(res => res.rows?.[0]);

    return NextResponse.json(
      {
        totalClicks: Number(aggregates?.total_clicks ?? 0),
        last7DaysClicks: Number(aggregates?.clicks_last_7 ?? 0),
        providerClicks: parseJsonArray<{
          provider: string | null;
          clicks: number;
        }>(aggregates?.provider_clicks ?? []).map(row => ({
          provider: row.provider ?? 'unknown',
          clicks: Number(row.clicks),
        })),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: 'Failed to load release analytics' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
