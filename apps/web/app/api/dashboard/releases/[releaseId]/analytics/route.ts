import * as Sentry from '@sentry/nextjs';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCurrentUserProfile } from '@/lib/auth/session';
import {
  isTestAuthBypassEnabled,
  isTrustedTestBypassRequest,
  resolveTestBypassUserId,
} from '@/lib/auth/test-mode';
import { db } from '@/lib/db';
import { clickEvents } from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { sqlTimestamp } from '@/lib/db/sql-helpers';
import { getReleaseById } from '@/lib/discography/queries';
import { env } from '@/lib/env-server';

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
async function getProfileIdForClerkUserId(clerkUserId: string) {
  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(users)
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, users.activeProfileId))
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  return profile?.id ?? null;
}

async function resolveAnalyticsProfile(request: Request) {
  const sessionProfile = await getCurrentUserProfile();
  if (sessionProfile) {
    return { id: sessionProfile.id };
  }

  const bypassUserId = resolveTestBypassUserId(request.headers);
  if (bypassUserId) {
    const bypassProfileId = await getProfileIdForClerkUserId(bypassUserId);
    if (bypassProfileId) {
      return { id: bypassProfileId };
    }
  }

  if (
    env.DEMO_RECORDING === '1' &&
    isTestAuthBypassEnabled() &&
    isTrustedTestBypassRequest(request.headers)
  ) {
    const demoClerkUserId = env.DEMO_CLERK_USER_ID?.trim();
    if (demoClerkUserId) {
      const demoProfileId = await getProfileIdForClerkUserId(demoClerkUserId);
      if (demoProfileId) {
        return { id: demoProfileId };
      }
    }
  }

  return null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  try {
    const profile = await resolveAnalyticsProfile(req);
    if (!profile) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const { releaseId } = await params;

    const release = await getReleaseById(releaseId);
    if (release?.creatorProfileId !== profile.id) {
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
        last_click_at: string | Date | null;
        provider_clicks: JsonArray<{
          provider: string | null;
          clicks: number;
        }>;
      }>(
        drizzleSql`
          with release_clicks as (
            select created_at, metadata
            from ${clickEvents}
            where ${clickEvents.creatorProfileId} = ${profile.id}
              and ${clickEvents.isBot} = false
              and ${clickEvents.metadata} ->> 'contentId' = ${releaseId}
              and ${clickEvents.metadata} ->> 'contentType' = 'release'
          ),
          recent_clicks as (
            select 1
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
            (select max(created_at) from release_clicks) as last_click_at,
            coalesce((select json_agg(row_to_json(p)) from provider_clicks p), '[]'::json) as provider_clicks
          ;
        `
      )
      .then(res => res.rows?.[0]);

    const lastClickAtRaw = aggregates?.last_click_at ?? null;
    const lastClickAt = lastClickAtRaw
      ? new Date(lastClickAtRaw).toISOString()
      : null;

    return NextResponse.json(
      {
        totalClicks: Number(aggregates?.total_clicks ?? 0),
        last7DaysClicks: Number(aggregates?.clicks_last_7 ?? 0),
        lastClickAt,
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
