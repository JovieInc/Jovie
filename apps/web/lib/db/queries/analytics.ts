import { sql as drizzleSql } from 'drizzle-orm';
import { getSessionContext, setupDbSession } from '@/lib/auth/session';
import { db, doesTableExist, TABLE_NAMES } from '@/lib/db';
import { cacheQuery } from '@/lib/db/cache';
import { apiQuery, dashboardQuery } from '@/lib/db/query-timeout';
import {
  audienceMembers,
  clickEvents,
  dailyProfileViews,
  notificationSubscriptions,
} from '@/lib/db/schema/analytics';
import { sqlTimestamp } from '@/lib/db/sql-helpers';
import type {
  AnalyticsRange,
  DashboardAnalyticsResponse,
  DashboardAnalyticsView,
  TourDateAnalyticsData,
} from '@/types/analytics';

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

function toStartDate(range: AnalyticsRange): Date {
  const now = new Date();
  let startDate = new Date();

  switch (range) {
    case '1d':
      startDate.setDate(now.getDate() - 1);
      break;
    case '7d':
      startDate.setDate(now.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(now.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(now.getDate() - 90);
      break;
    case 'all':
      startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
  }

  return startDate;
}

export async function getUserDashboardAnalytics(
  clerkUserId: string,
  range: AnalyticsRange,
  view: DashboardAnalyticsView
): Promise<DashboardAnalyticsResponse> {
  const { profile } = await getSessionContext({
    clerkUserId,
    requireUser: true,
    requireProfile: true,
  });

  // Defense-in-depth: set RLS session variable on the db connection
  // so the analytics CTE can query RLS-protected tables
  // (audience_members, notification_subscriptions) correctly.
  await setupDbSession(clerkUserId);

  const creatorProfile = { id: profile!.id };

  {
    const startDate = toStartDate(range);
    const recentThreshold = new Date();
    recentThreshold.setDate(recentThreshold.getDate() - 7);
    const hasDailyProfileViews = await doesTableExist(
      TABLE_NAMES.dailyProfileViews
    );
    const totalViewsSelect = hasDailyProfileViews
      ? drizzleSql`(
          select coalesce(sum(${dailyProfileViews.viewCount}), 0)
          from ${dailyProfileViews}
          where ${dailyProfileViews.creatorProfileId} = ${creatorProfile.id}
            and ${dailyProfileViews.viewDate} >= ${startDate.toISOString().slice(0, 10)}
        )`
      : drizzleSql`0`;
    // Consolidated dashboard analytics into one SQL round trip.
    // Bot traffic is filtered from click aggregations (is_bot = false or is_bot IS NULL).
    // Cities, countries, and referrers are sourced from audience_members (visit data)
    // rather than click_events, so geo data appears even when visitors don't click links.
    // Top-list aggregates are cached for 5 minutes (JOV-1270).
    const aggregates = await cacheQuery(
      `analytics:dashboard:${creatorProfile.id}:${range}`,
      () =>
        dashboardQuery(async () => {
          type AggRow = {
            top_cities: JsonArray<{ city: string | null; count: number }>;
            top_countries: JsonArray<{
              country: string | null;
              count: number;
            }>;
            top_referrers: JsonArray<{
              referrer: string | null;
              count: number;
            }>;
            total_views: AggregateValue;
            unique_users: AggregateValue;
            total_clicks: AggregateValue;
            spotify_clicks: AggregateValue;
            social_clicks: AggregateValue;
            recent_clicks: AggregateValue;
            listen_clicks: AggregateValue;
            subscribers: AggregateValue;
            identified_users: AggregateValue;
            top_links: JsonArray<{
              id: string | null;
              url: string | null;
              clicks: number;
            }>;
          };
          const result = await db.execute<AggRow>(
            drizzleSql`
            with base_events as (
              select created_at, link_id, link_type, city, country, referrer
              from ${clickEvents}
              where ${clickEvents.creatorProfileId} = ${creatorProfile.id}
                and (${clickEvents.isBot} = false or ${clickEvents.isBot} is null)
            ),
            ranged_events as (
              select link_id, link_type, city, country, referrer
              from base_events
              where created_at >= ${sqlTimestamp(startDate)}
            ),
            recent_events as (
              select 1
              from base_events
              where created_at >= ${sqlTimestamp(recentThreshold)}
            ),
            top_cities as (
              select ${audienceMembers.geoCity} as city, count(*) as count
              from ${audienceMembers}
              where ${audienceMembers.creatorProfileId} = ${creatorProfile.id}
                and ${audienceMembers.lastSeenAt} >= ${sqlTimestamp(startDate)}
                and ${audienceMembers.geoCity} is not null
              group by ${audienceMembers.geoCity}
              order by count desc
              limit 5
            ),
            top_countries as (
              select ${audienceMembers.geoCountry} as country, count(*) as count
              from ${audienceMembers}
              where ${audienceMembers.creatorProfileId} = ${creatorProfile.id}
                and ${audienceMembers.lastSeenAt} >= ${sqlTimestamp(startDate)}
                and ${audienceMembers.geoCountry} is not null
              group by ${audienceMembers.geoCountry}
              order by count desc
              limit 5
            ),
            top_referrers as (
              select r->>'url' as referrer, count(*) as count
              from ${audienceMembers},
                jsonb_array_elements(
                  case when jsonb_typeof(${audienceMembers.referrerHistory}) = 'array'
                    then ${audienceMembers.referrerHistory}
                    else '[]'::jsonb
                  end
                ) as r
              where ${audienceMembers.creatorProfileId} = ${creatorProfile.id}
                and ${audienceMembers.lastSeenAt} >= ${sqlTimestamp(startDate)}
                and r->>'url' is not null
              group by r->>'url'
              order by count desc
              limit 5
            ),
            top_links as (
              select link_id as id, link_type as url, count(*) as clicks
              from ranged_events
              where link_id is not null
              group by link_id, link_type
              order by clicks desc
              limit 5
            ),
            notification_recent as (
              select 1
              from ${notificationSubscriptions}
              where ${notificationSubscriptions.creatorProfileId} = ${creatorProfile.id}
                and ${notificationSubscriptions.createdAt} >= ${sqlTimestamp(startDate)}
            ),
            audience_recent as (
              select 1
              from ${audienceMembers}
              where ${audienceMembers.creatorProfileId} = ${creatorProfile.id}
                and ${audienceMembers.lastSeenAt} >= ${sqlTimestamp(startDate)}
            ),
            audience_identified as (
              select 1
              from ${audienceMembers}
              where ${audienceMembers.creatorProfileId} = ${creatorProfile.id}
                and ${audienceMembers.updatedAt} >= ${sqlTimestamp(startDate)}
                and ${audienceMembers.email} is not null
            )
            select
              ${totalViewsSelect} as total_views,
              (select count(*) from audience_recent) as unique_users,
              (select count(*) from ranged_events) as total_clicks,
              (select count(*) from ranged_events where link_type = 'listen') as spotify_clicks,
              (select count(*) from ranged_events where link_type = 'social') as social_clicks,
              (select count(*) from recent_events) as recent_clicks,
              (select count(*) from ranged_events where link_type = 'listen') as listen_clicks,
              (select count(*) from notification_recent) as subscribers,
              (select count(*) from audience_identified) as identified_users,
              coalesce((select json_agg(row_to_json(c)) from top_cities c), '[]'::json) as top_cities,
              coalesce((select json_agg(row_to_json(c)) from top_countries c), '[]'::json) as top_countries,
              coalesce((select json_agg(row_to_json(r)) from top_referrers r), '[]'::json) as top_referrers,
              coalesce((select json_agg(row_to_json(l)) from top_links l), '[]'::json) as top_links
            ;
          `
          );
          return result.rows?.[0];
        }),
      { ttlSeconds: 300 }
    );

    const totalViews = Number(aggregates?.total_views ?? 0);
    const subscribers = Number(aggregates?.subscribers ?? 0);

    const base: DashboardAnalyticsResponse = {
      view,
      profile_views: totalViews,
      unique_users: Number(aggregates?.unique_users ?? 0),
      subscribers,
      top_cities: parseJsonArray<{ city: string | null; count: number }>(
        aggregates?.top_cities ?? []
      )
        .filter(row => Boolean(row.city))
        .map(row => ({ city: row.city as string, count: Number(row.count) })),
      top_countries: parseJsonArray<{ country: string | null; count: number }>(
        aggregates?.top_countries ?? []
      )
        .filter(row => Boolean(row.country))
        .map(row => ({
          country: row.country as string,
          count: Number(row.count),
        })),
      top_referrers: parseJsonArray<{
        referrer: string | null;
        count: number;
      }>(aggregates?.top_referrers ?? []).map(row => ({
        referrer: row.referrer ?? '',
        count: Number(row.count),
      })),
      top_links: parseJsonArray<{
        id: string | null;
        url: string | null;
        clicks: number;
      }>(aggregates?.top_links ?? []).map(row => ({
        id: row.id ?? 'unknown',
        url: row.url ?? '',
        clicks: Number(row.clicks),
      })),
    };

    if (view === 'traffic') {
      return base;
    }

    const uniqueUsers = Number(aggregates?.unique_users ?? 0);

    // Calculate capture rate: (subscribers / unique_users) * 100
    // Only calculate if we have unique users to avoid division by zero
    const captureRate =
      uniqueUsers > 0 ? Math.round((subscribers / uniqueUsers) * 1000) / 10 : 0;

    return {
      ...base,
      total_clicks: Number(aggregates?.total_clicks ?? 0),
      spotify_clicks: Number(aggregates?.spotify_clicks ?? 0),
      social_clicks: Number(aggregates?.social_clicks ?? 0),
      recent_clicks: Number(aggregates?.recent_clicks ?? 0),
      listen_clicks: Number(aggregates?.listen_clicks ?? 0),
      identified_users: Number(aggregates?.identified_users ?? 0),
      capture_rate: captureRate,
    };
  }
}

// ─── Tour Date Analytics ─────────────────────────────────────────────

/**
 * Get analytics for a specific tour date.
 * Queries click events where metadata->>'contentType' = 'tour_date'
 * and metadata->>'contentId' matches the tour date ID.
 */
export async function getTourDateAnalytics(
  tourDateId: string,
  creatorProfileId: string
): Promise<TourDateAnalyticsData> {
  const result = await apiQuery(
    () =>
      db
        .execute<{
          ticket_clicks: AggregateValue;
          top_cities: JsonArray<{ city: string | null; count: number }>;
          top_referrers: JsonArray<{ referrer: string | null; count: number }>;
        }>(
          drizzleSql`
            with tour_clicks as (
              select city, referrer
              from ${clickEvents}
              where ${clickEvents.creatorProfileId} = ${creatorProfileId}
                and (${clickEvents.isBot} = false or ${clickEvents.isBot} is null)
                and ${clickEvents.metadata}->>'contentType' = 'tour_date'
                and ${clickEvents.metadata}->>'contentId' = ${tourDateId}
            ),
            top_cities as (
              select city, count(*) as count
              from tour_clicks
              where city is not null
              group by city
              order by count desc
              limit 5
            ),
            top_referrers as (
              select referrer, count(*) as count
              from tour_clicks
              where referrer is not null
              group by referrer
              order by count desc
              limit 3
            )
            select
              (select count(*) from tour_clicks) as ticket_clicks,
              coalesce((select json_agg(row_to_json(c)) from top_cities c), '[]'::json) as top_cities,
              coalesce((select json_agg(row_to_json(r)) from top_referrers r), '[]'::json) as top_referrers
            ;
          `
        )
        .then(res => res.rows?.[0]),
    'getTourDateAnalytics'
  );

  return {
    ticketClicks: Number(result?.ticket_clicks ?? 0),
    topCities: parseJsonArray<{ city: string | null; count: number }>(
      result?.top_cities ?? []
    )
      .filter(row => Boolean(row.city))
      .map(row => ({ city: row.city as string, count: Number(row.count) })),
    topReferrers: parseJsonArray<{ referrer: string | null; count: number }>(
      result?.top_referrers ?? []
    ).map(row => ({
      referrer: row.referrer ?? '',
      count: Number(row.count),
    })),
  };
}

// Function to record a click event
export async function recordClickEvent(
  creatorProfileId: string,
  linkType: 'listen' | 'social' | 'other',
  linkId?: string,
  metadata: Record<string, unknown> = {}
) {
  const request = {
    creatorProfileId,
    linkType,
    ...(linkId && { linkId }),
    ...metadata,
  };

  const [event] = await db.insert(clickEvents).values(request).returning();

  return event;
}
