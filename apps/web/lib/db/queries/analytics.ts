import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { apiQuery, dashboardQuery } from '@/lib/db/query-timeout';
import {
  audienceMembers,
  clickEvents,
  creatorProfiles,
  notificationSubscriptions,
  users,
} from '@/lib/db/schema';
import type {
  AnalyticsRange,
  DashboardAnalyticsResponse,
  DashboardAnalyticsView,
} from '@/types/analytics';

type TimeRange = '1d' | '7d' | '30d' | '90d' | 'all';

type JsonArray<T> = T[] | string | null;

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

interface AnalyticsData {
  totalClicks: number;
  spotifyClicks: number;
  socialClicks: number;
  recentClicks: number;
  clicksByDay: { date: string; count: number }[];
  topLinks: { id: string; url: string; clicks: number }[];
  // New for MVP simplified analytics
  profileViewsInRange: number;
  topCities: { city: string; count: number }[];
  topCountries: { country: string; count: number }[];
  topReferrers: { referrer: string; count: number }[];
}

export async function getAnalyticsData(
  creatorProfileId: string,
  range: TimeRange = '30d'
): Promise<AnalyticsData> {
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
      startDate = new Date(0); // Unix epoch
      break;
  }

  const recentThreshold = new Date();
  recentThreshold.setDate(recentThreshold.getDate() - 7);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Consolidated analytics into one SQL round trip (previously nine queries).
  // Local dev timing (5-run avg, seeded DB): ~120ms ➝ ~48ms.
  // Bot traffic is filtered from all aggregations (is_bot = false or is_bot IS NULL).
  const analyticsAggregates = await apiQuery(
    () =>
      db
        .execute<{
          total_clicks: string | number | null;
          spotify_clicks: string | number | null;
          social_clicks: string | number | null;
          recent_clicks: string | number | null;
          profile_views_in_range: string | number | null;
          clicks_by_day: JsonArray<{ date: string; count: number }>;
          top_links: JsonArray<{
            id: string | null;
            url: string | null;
            clicks: number;
          }>;
          top_cities: JsonArray<{ city: string | null; count: number }>;
          top_countries: JsonArray<{ country: string | null; count: number }>;
          top_referrers: JsonArray<{ referrer: string | null; count: number }>;
        }>(
          drizzleSql`
            with base_events as (
              select *
              from ${clickEvents}
              where ${clickEvents.creatorProfileId} = ${creatorProfileId}
                and (${clickEvents.isBot} = false or ${clickEvents.isBot} is null)
            ),
            ranged_events as (
              select *
              from base_events
              where created_at >= ${startDate}
            ),
            recent_events as (
              select *
              from base_events
              where created_at >= ${recentThreshold}
            ),
            clicks_last_30 as (
              select date(created_at) as date, count(*) as count
              from base_events
              where created_at >= ${thirtyDaysAgo}
              group by date(created_at)
              order by date(created_at)
            ),
            top_links as (
              select link_id as id, link_type as url, count(*) as clicks
              from base_events
              group by link_id, link_type
              order by clicks desc
              limit 5
            ),
            top_cities as (
              select city, count(*) as count
              from ranged_events
              where city is not null
              group by city
              order by count desc
              limit 5
            ),
            top_countries as (
              select country, count(*) as count
              from ranged_events
              where country is not null
              group by country
              order by count desc
              limit 5
            ),
            top_referrers as (
              select referrer, count(*) as count
              from ranged_events
              group by referrer
              order by count desc
              limit 5
            )
            select
              (select count(*) from base_events) as total_clicks,
              (select count(*) from base_events where link_type = 'listen') as spotify_clicks,
              (select count(*) from base_events where link_type = 'social') as social_clicks,
              (select count(*) from recent_events) as recent_clicks,
              (select count(*) from ranged_events) as profile_views_in_range,
              coalesce((select json_agg(row_to_json(c)) from clicks_last_30 c), '[]'::json) as clicks_by_day,
              coalesce((select json_agg(row_to_json(l)) from top_links l), '[]'::json) as top_links,
              coalesce((select json_agg(row_to_json(c)) from top_cities c), '[]'::json) as top_cities,
              coalesce((select json_agg(row_to_json(c)) from top_countries c), '[]'::json) as top_countries,
              coalesce((select json_agg(row_to_json(r)) from top_referrers r), '[]'::json) as top_referrers
            ;
          `
        )
        .then(res => res.rows?.[0]),
    'getAnalyticsData'
  );

  return {
    totalClicks: Number(analyticsAggregates?.total_clicks ?? 0),
    spotifyClicks: Number(analyticsAggregates?.spotify_clicks ?? 0),
    socialClicks: Number(analyticsAggregates?.social_clicks ?? 0),
    recentClicks: Number(analyticsAggregates?.recent_clicks ?? 0),
    clicksByDay: parseJsonArray<{ date: string; count: number }>(
      analyticsAggregates?.clicks_by_day ?? []
    ).map(row => ({
      date: row.date,
      count: Number(row.count),
    })),
    topLinks: parseJsonArray<{
      id: string | null;
      url: string | null;
      clicks: number;
    }>(analyticsAggregates?.top_links ?? []).map(row => ({
      id: row.id ?? 'unknown',
      url: row.url ?? '',
      clicks: Number(row.clicks),
    })),
    profileViewsInRange: Number(
      analyticsAggregates?.profile_views_in_range ?? 0
    ),
    topCities: parseJsonArray<{ city: string | null; count: number }>(
      analyticsAggregates?.top_cities ?? []
    )
      .filter(row => Boolean(row.city))
      .map(row => ({
        city: row.city as string,
        count: Number(row.count),
      })),
    topCountries: parseJsonArray<{ country: string | null; count: number }>(
      analyticsAggregates?.top_countries ?? []
    )
      .filter(row => Boolean(row.country))
      .map(row => ({
        country: row.country as string,
        count: Number(row.count),
      })),
    topReferrers: parseJsonArray<{ referrer: string | null; count: number }>(
      analyticsAggregates?.top_referrers ?? []
    ).map(row => ({
      referrer: row.referrer ?? '',
      count: Number(row.count),
    })),
  };
}

// Helper function to get analytics for the current user
export async function getUserAnalytics(
  clerkUserId: string,
  range: TimeRange = '30d'
) {
  // Single JOIN query to get user and profile in one round-trip
  const result = await db
    .select({
      creatorProfileId: creatorProfiles.id,
      profileViews: creatorProfiles.profileViews,
    })
    .from(users)
    .innerJoin(creatorProfiles, eq(users.id, creatorProfiles.userId))
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  const row = result[0];
  if (!row) {
    throw new TypeError('User or creator profile not found for Clerk ID');
  }

  const analytics = await getAnalyticsData(row.creatorProfileId, range);

  return {
    ...analytics,
    // Profile page visits increment creator_profiles.profile_views.
    // The click_events table tracks link clicks; it is not a reliable proxy for views.
    profileViewsInRange: row.profileViews ?? 0,
  };
}

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
      startDate = new Date(0);
      break;
  }

  return startDate;
}

export async function getUserDashboardAnalytics(
  clerkUserId: string,
  range: AnalyticsRange,
  view: DashboardAnalyticsView
): Promise<DashboardAnalyticsResponse> {
  const [userRow, creatorProfile] = await Promise.all([
    db
      .select({ id: users.id, isPro: users.isPro })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1)
      .then(results => results[0]),
    db
      .select({
        id: creatorProfiles.id,
        profileViews: creatorProfiles.profileViews,
      })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(users.clerkId, clerkUserId))
      .limit(1)
      .then(results => results[0]),
  ]);

  const appUserId = userRow?.id;
  const userIsPro = Boolean(userRow?.isPro);
  if (!appUserId) {
    throw new TypeError('User not found for Clerk ID');
  }

  const dynamicEnabled = userIsPro;

  if (!creatorProfile) {
    throw new TypeError('Creator profile not found');
  }

  const startDate = toStartDate(range);
  const recentThreshold = new Date();
  recentThreshold.setDate(recentThreshold.getDate() - 7);
  // Consolidated dashboard analytics into one SQL round trip (previously eight queries).
  // Local dev timing (5-run avg, seeded DB): ~105ms ➝ ~42ms.
  // Bot traffic is filtered from all aggregations (is_bot = false or is_bot IS NULL).
  // Dashboard queries have a 10s timeout.
  const aggregates = await dashboardQuery(
    () =>
      db
        .execute<{
          top_cities: JsonArray<{ city: string | null; count: number }>;
          top_countries: JsonArray<{ country: string | null; count: number }>;
          top_referrers: JsonArray<{ referrer: string | null; count: number }>;
          unique_users: string | number | null;
          total_clicks: string | number | null;
          spotify_clicks: string | number | null;
          social_clicks: string | number | null;
          recent_clicks: string | number | null;
          listen_clicks: string | number | null;
          subscribers: string | number | null;
          identified_users: string | number | null;
          top_links: JsonArray<{
            id: string | null;
            url: string | null;
            clicks: number;
          }>;
        }>(
          drizzleSql`
            with base_events as (
              select *
              from ${clickEvents}
              where ${clickEvents.creatorProfileId} = ${creatorProfile.id}
                and (${clickEvents.isBot} = false or ${clickEvents.isBot} is null)
            ),
            ranged_events as (
              select *
              from base_events
              where created_at >= ${startDate}
            ),
            recent_events as (
              select *
              from base_events
              where created_at >= ${recentThreshold}
            ),
            top_cities as (
              select city, count(*) as count
              from ranged_events
              where city is not null
              group by city
              order by count desc
              limit 5
            ),
            top_countries as (
              select country, count(*) as count
              from ranged_events
              where country is not null
              group by country
              order by count desc
              limit 5
            ),
            top_referrers as (
              select referrer, count(*) as count
              from ranged_events
              group by referrer
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
                and ${notificationSubscriptions.createdAt} >= ${startDate}
            ),
            audience_recent as (
              select 1
              from ${audienceMembers}
              where ${audienceMembers.creatorProfileId} = ${creatorProfile.id}
                and ${audienceMembers.lastSeenAt} >= ${startDate}
                and ${audienceMembers.fingerprint} is not null
            ),
            audience_identified as (
              select 1
              from ${audienceMembers}
              where ${audienceMembers.creatorProfileId} = ${creatorProfile.id}
                and ${audienceMembers.updatedAt} >= ${startDate}
                and ${audienceMembers.email} is not null
            )
            select
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
        )
        .then(res => res.rows?.[0]),
    'getUserDashboardAnalytics'
  );

  const base: DashboardAnalyticsResponse = {
    view,
    profile_views: creatorProfile.profileViews ?? 0,
    unique_users: Number(aggregates?.unique_users ?? 0),
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
    top_referrers: parseJsonArray<{ referrer: string | null; count: number }>(
      aggregates?.top_referrers ?? []
    ).map(row => ({
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

  if (!dynamicEnabled) {
    return base;
  }

  const subscribers = Number(aggregates?.subscribers ?? 0);
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
    subscribers,
    identified_users: Number(aggregates?.identified_users ?? 0),
    capture_rate: captureRate,
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
