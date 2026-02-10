import { and, sql as drizzleSql, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dashboardQuery } from '@/lib/db/query-timeout';
import {
  audienceMembers,
  clickEvents,
  notificationSubscriptions,
  tips,
} from '@/lib/db/schema/analytics';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { tourDates } from '@/lib/db/schema/tour';
import { sqlTimestamp } from '@/lib/db/sql-helpers';
import type { MetricSnapshot } from '@/types/insights';
import { DEFAULT_PERIOD_DAYS } from './thresholds';

type AggregateValue = string | number | null;
type JsonArray<T> = T[] | string | null;

function parseJsonArray<T>(value: JsonArray<T>): T[] {
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T[];
    } catch {
      return [];
    }
  }
  return value;
}

function toNumber(value: AggregateValue): number {
  return Number(value ?? 0);
}

/**
 * Computes the period boundaries for insight generation.
 */
export function computePeriods(periodDays: number = DEFAULT_PERIOD_DAYS) {
  const now = new Date();
  const periodEnd = now;
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - periodDays);

  const comparisonPeriodEnd = new Date(periodStart);
  const comparisonPeriodStart = new Date(comparisonPeriodEnd);
  comparisonPeriodStart.setDate(comparisonPeriodStart.getDate() - periodDays);

  return {
    period: { start: periodStart, end: periodEnd },
    comparisonPeriod: {
      start: comparisonPeriodStart,
      end: comparisonPeriodEnd,
    },
  };
}

/**
 * Aggregates all analytics data for a creator profile into a MetricSnapshot.
 *
 * Uses consolidated SQL queries with CTEs (following the existing pattern in
 * getUserDashboardAnalytics) for efficient data retrieval.
 */
export async function aggregateMetrics(
  creatorProfileId: string,
  periodDays: number = DEFAULT_PERIOD_DAYS
): Promise<MetricSnapshot> {
  const { period, comparisonPeriod } = computePeriods(periodDays);

  // Run all independent queries in parallel
  const [
    clickAggregates,
    audienceAggregates,
    subscriberAggregates,
    revenueAggregates,
    tourData,
    profileData,
    releaseData,
    temporalData,
  ] = await Promise.all([
    aggregateClicks(creatorProfileId, period, comparisonPeriod),
    aggregateAudience(creatorProfileId, period, comparisonPeriod),
    aggregateSubscribers(creatorProfileId, period, comparisonPeriod),
    aggregateRevenue(creatorProfileId, period, comparisonPeriod),
    aggregateTourData(creatorProfileId, period),
    fetchProfileContext(creatorProfileId),
    aggregateReleases(creatorProfileId, period),
    aggregateTemporalPatterns(creatorProfileId, period),
  ]);

  // Compute geographic growth rates from current vs previous top cities
  const cityGrowthRates = computeCityGrowthRates(
    clickAggregates.currentTopCities,
    clickAggregates.previousTopCities
  );

  // Identify new cities (present in current but not in previous)
  const previousCitySet = new Set(
    clickAggregates.previousTopCities.map(c => c.city)
  );
  const newCities = clickAggregates.currentTopCities.filter(
    c => !previousCitySet.has(c.city) && c.count >= 5
  );

  // Identify declining cities
  const decliningCities = cityGrowthRates
    .filter(c => c.growthPct < -20 && c.previousCount >= 10)
    .map(c => ({
      city: c.city,
      country: c.country,
      declinePct: Math.abs(c.growthPct),
    }));

  // Compute referrer growth rates
  const referrerGrowthRates = computeReferrerGrowthRates(
    clickAggregates.topReferrersCurrent,
    clickAggregates.topReferrersPrevious
  );

  // Identify tour gaps: audience cities without upcoming shows
  const showCities = new Set(
    tourData.upcomingShows.map(s => s.city.toLowerCase())
  );
  const audienceCitiesWithoutShows = audienceAggregates.topCities
    .filter(c => !showCities.has(c.city.toLowerCase()) && c.count >= 10)
    .map(c => ({ city: c.city, country: c.country, audienceCount: c.count }));

  // Compute capture rates
  const captureRateCurrent =
    clickAggregates.uniqueVisitorsCurrent > 0
      ? (subscriberAggregates.newSubscribersCurrent /
          clickAggregates.uniqueVisitorsCurrent) *
        100
      : 0;
  const captureRatePrevious =
    clickAggregates.uniqueVisitorsPrevious > 0
      ? (subscriberAggregates.newSubscribersPrevious /
          clickAggregates.uniqueVisitorsPrevious) *
        100
      : 0;

  return {
    period,
    comparisonPeriod,
    geographic: {
      currentTopCities: clickAggregates.currentTopCities,
      previousTopCities: clickAggregates.previousTopCities,
      cityGrowthRates,
      newCities,
      decliningCities,
    },
    traffic: {
      totalClicksCurrent: clickAggregates.totalClicksCurrent,
      totalClicksPrevious: clickAggregates.totalClicksPrevious,
      uniqueVisitorsCurrent: clickAggregates.uniqueVisitorsCurrent,
      uniqueVisitorsPrevious: clickAggregates.uniqueVisitorsPrevious,
      profileViewsCurrent: profileData.profileViews,
      profileViewsPrevious: 0, // Profile views are cumulative, not per-period
    },
    subscribers: {
      newSubscribersCurrent: subscriberAggregates.newSubscribersCurrent,
      newSubscribersPrevious: subscriberAggregates.newSubscribersPrevious,
      unsubscribesCurrent: subscriberAggregates.unsubscribesCurrent,
      unsubscribesPrevious: subscriberAggregates.unsubscribesPrevious,
      totalActive: subscriberAggregates.totalActive,
      subscriberCities: subscriberAggregates.subscriberCities,
    },
    revenue: revenueAggregates,
    content: {
      clicksByLinkType: clickAggregates.clicksByLinkType,
      recentReleases: releaseData,
    },
    tour: {
      upcomingShows: tourData.upcomingShows,
      audienceCitiesWithoutShows,
    },
    engagement: {
      intentDistributionCurrent: audienceAggregates.intentDistributionCurrent,
      intentDistributionPrevious: audienceAggregates.intentDistributionPrevious,
      deviceDistribution: audienceAggregates.deviceDistribution,
      captureRateCurrent: Math.round(captureRateCurrent * 10) / 10,
      captureRatePrevious: Math.round(captureRatePrevious * 10) / 10,
    },
    referrers: {
      topReferrersCurrent: clickAggregates.topReferrersCurrent,
      topReferrersPrevious: clickAggregates.topReferrersPrevious,
      referrerGrowthRates,
    },
    temporal: temporalData,
    profile: {
      displayName: profileData.displayName,
      genres: profileData.genres,
      spotifyFollowers: profileData.spotifyFollowers,
      spotifyPopularity: profileData.spotifyPopularity,
      creatorType: profileData.creatorType,
      totalAudienceMembers: audienceAggregates.totalMembers,
      totalSubscribers: subscriberAggregates.totalActive,
    },
  };
}

// ---------------------------------------------------------------------------
// Click event aggregation
// ---------------------------------------------------------------------------

interface ClickAggregateResult {
  currentTopCities: { city: string; country: string; count: number }[];
  previousTopCities: { city: string; country: string; count: number }[];
  topReferrersCurrent: { referrer: string; count: number }[];
  topReferrersPrevious: { referrer: string; count: number }[];
  clicksByLinkType: { linkType: string; current: number; previous: number }[];
  totalClicksCurrent: number;
  totalClicksPrevious: number;
  uniqueVisitorsCurrent: number;
  uniqueVisitorsPrevious: number;
}

async function aggregateClicks(
  profileId: string,
  period: { start: Date; end: Date },
  comparisonPeriod: { start: Date; end: Date }
): Promise<ClickAggregateResult> {
  const result = await dashboardQuery(
    () =>
      db
        .execute<{
          current_top_cities: JsonArray<{
            city: string;
            country: string;
            count: number;
          }>;
          previous_top_cities: JsonArray<{
            city: string;
            country: string;
            count: number;
          }>;
          top_referrers_current: JsonArray<{ referrer: string; count: number }>;
          top_referrers_previous: JsonArray<{
            referrer: string;
            count: number;
          }>;
          clicks_by_link_type: JsonArray<{
            link_type: string;
            current: number;
            previous: number;
          }>;
          total_clicks_current: AggregateValue;
          total_clicks_previous: AggregateValue;
          unique_visitors_current: AggregateValue;
          unique_visitors_previous: AggregateValue;
        }>(
          drizzleSql`
            with base as (
              select * from ${clickEvents}
              where ${clickEvents.creatorProfileId} = ${profileId}
                and (${clickEvents.isBot} = false or ${clickEvents.isBot} is null)
            ),
            current_events as (
              select * from base
              where created_at >= ${sqlTimestamp(period.start)}
                and created_at < ${sqlTimestamp(period.end)}
            ),
            previous_events as (
              select * from base
              where created_at >= ${sqlTimestamp(comparisonPeriod.start)}
                and created_at < ${sqlTimestamp(comparisonPeriod.end)}
            ),
            current_cities as (
              select city, country, count(*)::int as count
              from current_events
              where city is not null and country is not null
              group by city, country
              order by count desc
              limit 15
            ),
            previous_cities as (
              select city, country, count(*)::int as count
              from previous_events
              where city is not null and country is not null
              group by city, country
              order by count desc
              limit 15
            ),
            ref_current as (
              select referrer, count(*)::int as count
              from current_events
              where referrer is not null
              group by referrer
              order by count desc
              limit 10
            ),
            ref_previous as (
              select referrer, count(*)::int as count
              from previous_events
              where referrer is not null
              group by referrer
              order by count desc
              limit 10
            ),
            link_types as (
              select
                link_type,
                count(*) filter (where created_at >= ${sqlTimestamp(period.start)})::int as current,
                count(*) filter (where created_at >= ${sqlTimestamp(comparisonPeriod.start)} and created_at < ${sqlTimestamp(comparisonPeriod.end)})::int as previous
              from base
              where created_at >= ${sqlTimestamp(comparisonPeriod.start)}
              group by link_type
            )
            select
              (select count(*) from current_events) as total_clicks_current,
              (select count(*) from previous_events) as total_clicks_previous,
              (select count(distinct audience_member_id) from current_events where audience_member_id is not null) as unique_visitors_current,
              (select count(distinct audience_member_id) from previous_events where audience_member_id is not null) as unique_visitors_previous,
              coalesce((select json_agg(row_to_json(c)) from current_cities c), '[]'::json) as current_top_cities,
              coalesce((select json_agg(row_to_json(c)) from previous_cities c), '[]'::json) as previous_top_cities,
              coalesce((select json_agg(row_to_json(r)) from ref_current r), '[]'::json) as top_referrers_current,
              coalesce((select json_agg(row_to_json(r)) from ref_previous r), '[]'::json) as top_referrers_previous,
              coalesce((select json_agg(row_to_json(l)) from link_types l), '[]'::json) as clicks_by_link_type
            ;
          `
        )
        .then(res => res.rows?.[0]),
    'aggregateClicks'
  );

  return {
    currentTopCities: parseJsonArray(result?.current_top_cities ?? []).filter(
      c => Boolean(c.city)
    ),
    previousTopCities: parseJsonArray(result?.previous_top_cities ?? []).filter(
      c => Boolean(c.city)
    ),
    topReferrersCurrent: parseJsonArray(result?.top_referrers_current ?? []),
    topReferrersPrevious: parseJsonArray(result?.top_referrers_previous ?? []),
    clicksByLinkType: parseJsonArray(result?.clicks_by_link_type ?? []).map(
      row => ({
        linkType: row.link_type,
        current: Number(row.current),
        previous: Number(row.previous),
      })
    ),
    totalClicksCurrent: toNumber(result?.total_clicks_current),
    totalClicksPrevious: toNumber(result?.total_clicks_previous),
    uniqueVisitorsCurrent: toNumber(result?.unique_visitors_current),
    uniqueVisitorsPrevious: toNumber(result?.unique_visitors_previous),
  };
}

// ---------------------------------------------------------------------------
// Audience aggregation
// ---------------------------------------------------------------------------

interface AudienceAggregateResult {
  totalMembers: number;
  topCities: { city: string; country: string; count: number }[];
  intentDistributionCurrent: { level: string; count: number }[];
  intentDistributionPrevious: { level: string; count: number }[];
  deviceDistribution: { deviceType: string; count: number }[];
}

async function aggregateAudience(
  profileId: string,
  period: { start: Date; end: Date },
  comparisonPeriod: { start: Date; end: Date }
): Promise<AudienceAggregateResult> {
  const result = await dashboardQuery(
    () =>
      db
        .execute<{
          total_members: AggregateValue;
          top_cities: JsonArray<{
            city: string;
            country: string;
            count: number;
          }>;
          intent_current: JsonArray<{ level: string; count: number }>;
          intent_previous: JsonArray<{ level: string; count: number }>;
          device_distribution: JsonArray<{
            device_type: string;
            count: number;
          }>;
        }>(
          drizzleSql`
            with all_members as (
              select * from ${audienceMembers}
              where ${audienceMembers.creatorProfileId} = ${profileId}
            ),
            top_cities as (
              select geo_city as city, geo_country as country, count(*)::int as count
              from all_members
              where geo_city is not null and geo_country is not null
              group by geo_city, geo_country
              order by count desc
              limit 15
            ),
            intent_current as (
              select intent_level as level, count(*)::int as count
              from all_members
              where last_seen_at >= ${sqlTimestamp(period.start)}
              group by intent_level
            ),
            intent_previous as (
              select intent_level as level, count(*)::int as count
              from all_members
              where last_seen_at >= ${sqlTimestamp(comparisonPeriod.start)}
                and last_seen_at < ${sqlTimestamp(comparisonPeriod.end)}
              group by intent_level
            ),
            devices as (
              select device_type, count(*)::int as count
              from all_members
              where device_type is not null and device_type != 'unknown'
              group by device_type
              order by count desc
            )
            select
              (select count(*) from all_members) as total_members,
              coalesce((select json_agg(row_to_json(c)) from top_cities c), '[]'::json) as top_cities,
              coalesce((select json_agg(row_to_json(i)) from intent_current i), '[]'::json) as intent_current,
              coalesce((select json_agg(row_to_json(i)) from intent_previous i), '[]'::json) as intent_previous,
              coalesce((select json_agg(row_to_json(d)) from devices d), '[]'::json) as device_distribution
            ;
          `
        )
        .then(res => res.rows?.[0]),
    'aggregateAudience'
  );

  return {
    totalMembers: toNumber(result?.total_members),
    topCities: parseJsonArray(result?.top_cities ?? []),
    intentDistributionCurrent: parseJsonArray(result?.intent_current ?? []),
    intentDistributionPrevious: parseJsonArray(result?.intent_previous ?? []),
    deviceDistribution: parseJsonArray(result?.device_distribution ?? []).map(
      d => ({ deviceType: d.device_type, count: Number(d.count) })
    ),
  };
}

// ---------------------------------------------------------------------------
// Subscriber aggregation
// ---------------------------------------------------------------------------

interface SubscriberAggregateResult {
  newSubscribersCurrent: number;
  newSubscribersPrevious: number;
  unsubscribesCurrent: number;
  unsubscribesPrevious: number;
  totalActive: number;
  subscriberCities: { city: string; count: number }[];
}

async function aggregateSubscribers(
  profileId: string,
  period: { start: Date; end: Date },
  comparisonPeriod: { start: Date; end: Date }
): Promise<SubscriberAggregateResult> {
  const result = await dashboardQuery(
    () =>
      db
        .execute<{
          new_current: AggregateValue;
          new_previous: AggregateValue;
          unsub_current: AggregateValue;
          unsub_previous: AggregateValue;
          total_active: AggregateValue;
          subscriber_cities: JsonArray<{ city: string; count: number }>;
        }>(
          drizzleSql`
            with subs as (
              select * from ${notificationSubscriptions}
              where ${notificationSubscriptions.creatorProfileId} = ${profileId}
            )
            select
              (select count(*) from subs where created_at >= ${sqlTimestamp(period.start)} and created_at < ${sqlTimestamp(period.end)}) as new_current,
              (select count(*) from subs where created_at >= ${sqlTimestamp(comparisonPeriod.start)} and created_at < ${sqlTimestamp(comparisonPeriod.end)}) as new_previous,
              (select count(*) from subs where unsubscribed_at >= ${sqlTimestamp(period.start)} and unsubscribed_at < ${sqlTimestamp(period.end)}) as unsub_current,
              (select count(*) from subs where unsubscribed_at >= ${sqlTimestamp(comparisonPeriod.start)} and unsubscribed_at < ${sqlTimestamp(comparisonPeriod.end)}) as unsub_previous,
              (select count(*) from subs where unsubscribed_at is null) as total_active,
              coalesce(
                (select json_agg(row_to_json(c)) from (
                  select city, count(*)::int as count
                  from subs
                  where city is not null and unsubscribed_at is null
                  group by city
                  order by count desc
                  limit 10
                ) c),
                '[]'::json
              ) as subscriber_cities
            ;
          `
        )
        .then(res => res.rows?.[0]),
    'aggregateSubscribers'
  );

  return {
    newSubscribersCurrent: toNumber(result?.new_current),
    newSubscribersPrevious: toNumber(result?.new_previous),
    unsubscribesCurrent: toNumber(result?.unsub_current),
    unsubscribesPrevious: toNumber(result?.unsub_previous),
    totalActive: toNumber(result?.total_active),
    subscriberCities: parseJsonArray(result?.subscriber_cities ?? []),
  };
}

// ---------------------------------------------------------------------------
// Revenue aggregation
// ---------------------------------------------------------------------------

async function aggregateRevenue(
  profileId: string,
  period: { start: Date; end: Date },
  comparisonPeriod: { start: Date; end: Date }
): Promise<MetricSnapshot['revenue']> {
  const result = await dashboardQuery(
    () =>
      db
        .execute<{
          total_current: AggregateValue;
          total_previous: AggregateValue;
          count_current: AggregateValue;
          count_previous: AggregateValue;
          tips_by_city: JsonArray<{
            city: string;
            total_cents: number;
            count: number;
          }>;
        }>(
          drizzleSql`
            with all_tips as (
              select * from ${tips}
              where ${tips.creatorProfileId} = ${profileId}
            )
            select
              coalesce((select sum(amount_cents) from all_tips where created_at >= ${sqlTimestamp(period.start)} and created_at < ${sqlTimestamp(period.end)}), 0) as total_current,
              coalesce((select sum(amount_cents) from all_tips where created_at >= ${sqlTimestamp(comparisonPeriod.start)} and created_at < ${sqlTimestamp(comparisonPeriod.end)}), 0) as total_previous,
              (select count(*) from all_tips where created_at >= ${sqlTimestamp(period.start)} and created_at < ${sqlTimestamp(period.end)}) as count_current,
              (select count(*) from all_tips where created_at >= ${sqlTimestamp(comparisonPeriod.start)} and created_at < ${sqlTimestamp(comparisonPeriod.end)}) as count_previous,
              coalesce(
                (select json_agg(row_to_json(c)) from (
                  select
                    ce.city,
                    sum(t.amount_cents)::int as total_cents,
                    count(*)::int as count
                  from all_tips t
                  inner join ${clickEvents} ce on ce.audience_member_id = (
                    select id from ${audienceMembers}
                    where ${audienceMembers.creatorProfileId} = ${profileId}
                      and email = t.contact_email
                    limit 1
                  )
                  where ce.city is not null
                  group by ce.city
                  order by total_cents desc
                  limit 10
                ) c),
                '[]'::json
              ) as tips_by_city
            ;
          `
        )
        .then(res => res.rows?.[0]),
    'aggregateRevenue'
  );

  const totalCurrent = toNumber(result?.total_current);
  const totalPrevious = toNumber(result?.total_previous);
  const countCurrent = toNumber(result?.count_current);
  const countPrevious = toNumber(result?.count_previous);

  return {
    totalTipsCurrent: totalCurrent,
    totalTipsPrevious: totalPrevious,
    tipCountCurrent: countCurrent,
    tipCountPrevious: countPrevious,
    tipsByCity: parseJsonArray(result?.tips_by_city ?? []).map(c => ({
      city: c.city,
      totalCents: Number(c.total_cents),
      count: Number(c.count),
    })),
    averageTipCurrent:
      countCurrent > 0 ? Math.round(totalCurrent / countCurrent) : 0,
    averageTipPrevious:
      countPrevious > 0 ? Math.round(totalPrevious / countPrevious) : 0,
  };
}

// ---------------------------------------------------------------------------
// Tour data aggregation
// ---------------------------------------------------------------------------

interface TourAggregateResult {
  upcomingShows: {
    city: string;
    country: string;
    date: string;
    venueName: string;
  }[];
}

async function aggregateTourData(
  profileId: string,
  period: { start: Date; end: Date }
): Promise<TourAggregateResult> {
  const now = new Date();
  const upcoming = await db
    .select({
      city: tourDates.city,
      country: tourDates.country,
      startDate: tourDates.startDate,
      venueName: tourDates.venueName,
    })
    .from(tourDates)
    .where(
      and(eq(tourDates.profileId, profileId), gte(tourDates.startDate, now))
    )
    .orderBy(tourDates.startDate)
    .limit(20);

  return {
    upcomingShows: upcoming.map(s => ({
      city: s.city,
      country: s.country,
      date: s.startDate.toISOString(),
      venueName: s.venueName,
    })),
  };
}

// ---------------------------------------------------------------------------
// Profile context
// ---------------------------------------------------------------------------

interface ProfileContext {
  displayName: string;
  genres: string[];
  spotifyFollowers: number | null;
  spotifyPopularity: number | null;
  creatorType: string;
  profileViews: number;
}

async function fetchProfileContext(profileId: string): Promise<ProfileContext> {
  const [profile] = await db
    .select({
      displayName: creatorProfiles.displayName,
      genres: creatorProfiles.genres,
      spotifyFollowers: creatorProfiles.spotifyFollowers,
      spotifyPopularity: creatorProfiles.spotifyPopularity,
      creatorType: creatorProfiles.creatorType,
      profileViews: creatorProfiles.profileViews,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  return {
    displayName: profile?.displayName ?? 'Unknown Artist',
    genres: profile?.genres ?? [],
    spotifyFollowers: profile?.spotifyFollowers ?? null,
    spotifyPopularity: profile?.spotifyPopularity ?? null,
    creatorType: profile?.creatorType ?? 'artist',
    profileViews: profile?.profileViews ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Release aggregation
// ---------------------------------------------------------------------------

async function aggregateReleases(
  profileId: string,
  period: { start: Date; end: Date }
): Promise<MetricSnapshot['content']['recentReleases']> {
  const releases = await db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      releaseDate: discogReleases.releaseDate,
    })
    .from(discogReleases)
    .where(eq(discogReleases.creatorProfileId, profileId))
    .orderBy(discogReleases.releaseDate)
    .limit(10);

  // For each release, count clicks on associated links in the current period
  // This is a simplified version; in production you'd do a JOIN in one query
  return releases.map(r => ({
    id: r.id,
    title: r.title,
    releaseDate: r.releaseDate?.toISOString() ?? '',
    clickCount: 0, // Populated by a separate query if needed
  }));
}

// ---------------------------------------------------------------------------
// Temporal pattern aggregation
// ---------------------------------------------------------------------------

async function aggregateTemporalPatterns(
  profileId: string,
  period: { start: Date; end: Date }
): Promise<MetricSnapshot['temporal']> {
  const result = await dashboardQuery(
    () =>
      db
        .execute<{
          clicks_by_hour: JsonArray<{ hour: number; count: number }>;
          clicks_by_dow: JsonArray<{ day: number; count: number }>;
        }>(
          drizzleSql`
            with events as (
              select created_at from ${clickEvents}
              where ${clickEvents.creatorProfileId} = ${profileId}
                and (${clickEvents.isBot} = false or ${clickEvents.isBot} is null)
                and created_at >= ${sqlTimestamp(period.start)}
                and created_at < ${sqlTimestamp(period.end)}
            )
            select
              coalesce(
                (select json_agg(row_to_json(h)) from (
                  select extract(hour from created_at)::int as hour, count(*)::int as count
                  from events
                  group by extract(hour from created_at)
                  order by hour
                ) h),
                '[]'::json
              ) as clicks_by_hour,
              coalesce(
                (select json_agg(row_to_json(d)) from (
                  select extract(dow from created_at)::int as day, count(*)::int as count
                  from events
                  group by extract(dow from created_at)
                  order by day
                ) d),
                '[]'::json
              ) as clicks_by_dow
            ;
          `
        )
        .then(res => res.rows?.[0]),
    'aggregateTemporalPatterns'
  );

  return {
    clicksByHour: parseJsonArray(result?.clicks_by_hour ?? []).map(h => ({
      hour: Number(h.hour),
      count: Number(h.count),
    })),
    clicksByDayOfWeek: parseJsonArray(result?.clicks_by_dow ?? []).map(d => ({
      day: Number(d.day),
      count: Number(d.count),
    })),
  };
}

// ---------------------------------------------------------------------------
// Helper: compute growth rates
// ---------------------------------------------------------------------------

function computeGrowthPct(current: number, previous: number): number {
  if (previous > 0) {
    return Math.round(((current - previous) / previous) * 100);
  }
  return current > 0 ? 100 : 0;
}

function computeCityGrowthRates(
  current: { city: string; country: string; count: number }[],
  previous: { city: string; country: string; count: number }[]
) {
  const previousMap = new Map(previous.map(c => [c.city, c]));

  return current
    .map(c => {
      const prev = previousMap.get(c.city);
      const previousCount = prev?.count ?? 0;
      const growthPct = computeGrowthPct(c.count, previousCount);
      return {
        city: c.city,
        country: c.country,
        currentCount: c.count,
        previousCount,
        growthPct,
      };
    })
    .sort((a, b) => b.growthPct - a.growthPct);
}

function computeReferrerGrowthRates(
  current: { referrer: string; count: number }[],
  previous: { referrer: string; count: number }[]
) {
  const previousMap = new Map(previous.map(r => [r.referrer, r.count]));

  return current
    .map(r => {
      const prevCount = previousMap.get(r.referrer) ?? 0;
      const growthPct = computeGrowthPct(r.count, prevCount);
      return {
        referrer: r.referrer,
        currentCount: r.count,
        previousCount: prevCount,
        growthPct,
      };
    })
    .sort((a, b) => b.growthPct - a.growthPct);
}
