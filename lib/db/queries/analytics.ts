import { and, count, sql as drizzleSql, eq, gte, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  audienceMembers,
  clickEvents,
  notificationSubscriptions,
  users,
} from '@/lib/db/schema';
import type {
  AnalyticsRange,
  DashboardAnalyticsResponse,
  DashboardAnalyticsView,
} from '@/types/analytics';

type TimeRange = '1d' | '7d' | '30d' | '90d' | 'all';

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

  // Get total counts for this creator
  const [totalClicks, spotifyClicks, socialClicks] = await Promise.all([
    db
      .select({ count: count() })
      .from(clickEvents)
      .where(eq(clickEvents.creatorProfileId, creatorProfileId)),
    db
      .select({ count: count() })
      .from(clickEvents)
      .where(
        and(
          eq(clickEvents.creatorProfileId, creatorProfileId),
          eq(clickEvents.linkType, 'listen')
        )
      ),
    db
      .select({ count: count() })
      .from(clickEvents)
      .where(
        and(
          eq(clickEvents.creatorProfileId, creatorProfileId),
          eq(clickEvents.linkType, 'social')
        )
      ),
  ]);

  // Get recent clicks (last 7 days)
  const recentThreshold = new Date();
  recentThreshold.setDate(recentThreshold.getDate() - 7);
  const recentClicks = await db
    .select({ count: count() })
    .from(clickEvents)
    .where(
      and(
        eq(clickEvents.creatorProfileId, creatorProfileId),
        gte(clickEvents.createdAt, recentThreshold)
      )
    )
    .then(res => res[0]?.count ?? 0);

  // Get clicks by day for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const clicksByDay = await db
    .select({
      date: drizzleSql<string>`DATE(${clickEvents.createdAt})`,
      count: count(),
    })
    .from(clickEvents)
    .where(
      and(
        eq(clickEvents.creatorProfileId, creatorProfileId),
        gte(clickEvents.createdAt, thirtyDaysAgo)
      )
    )
    .groupBy(drizzleSql`DATE(${clickEvents.createdAt})`)
    .orderBy(drizzleSql`DATE(${clickEvents.createdAt})`);

  // Get top links
  const topLinks = await db
    .select({
      id: clickEvents.linkId,
      url: clickEvents.linkType,
      count: count(),
    })
    .from(clickEvents)
    .where(eq(clickEvents.creatorProfileId, creatorProfileId))
    .groupBy(clickEvents.linkId, clickEvents.linkType)
    .orderBy(drizzleSql`count DESC`)
    .limit(5);

  // New: profile views in selected range (proxy via total clicks in range)
  const profileViewsInRange = await db
    .select({ count: count() })
    .from(clickEvents)
    .where(
      and(
        eq(clickEvents.creatorProfileId, creatorProfileId),
        gte(clickEvents.createdAt, startDate)
      )
    )
    .then(res => res[0]?.count ?? 0);

  // New: top countries within selected range
  const countries = await db
    .select({ country: clickEvents.country, count: count() })
    .from(clickEvents)
    .where(
      and(
        eq(clickEvents.creatorProfileId, creatorProfileId),
        gte(clickEvents.createdAt, startDate),
        isNotNull(clickEvents.country)
      )
    )
    .groupBy(clickEvents.country)
    .orderBy(drizzleSql`count DESC`)
    .limit(5);

  // New: top cities within selected range
  const cities = await db
    .select({ city: clickEvents.city, count: count() })
    .from(clickEvents)
    .where(
      and(
        eq(clickEvents.creatorProfileId, creatorProfileId),
        gte(clickEvents.createdAt, startDate),
        isNotNull(clickEvents.city)
      )
    )
    .groupBy(clickEvents.city)
    .orderBy(drizzleSql`count DESC`)
    .limit(5);

  // New: top referrers within selected range
  const referrers = await db
    .select({ referrer: clickEvents.referrer, count: count() })
    .from(clickEvents)
    .where(
      and(
        eq(clickEvents.creatorProfileId, creatorProfileId),
        gte(clickEvents.createdAt, startDate)
      )
    )
    .groupBy(clickEvents.referrer)
    .orderBy(drizzleSql`count DESC`)
    .limit(5);

  return {
    totalClicks: totalClicks[0]?.count ?? 0,
    spotifyClicks: spotifyClicks[0]?.count ?? 0,
    socialClicks: socialClicks[0]?.count ?? 0,
    recentClicks,
    clicksByDay: clicksByDay.map(row => ({
      date: row.date,
      count: Number(row.count),
    })),
    topLinks: topLinks.map(row => ({
      id: row.id ?? 'unknown',
      url: row.url,
      clicks: Number(row.count),
    })),
    profileViewsInRange,
    topCities: cities
      .filter(row => Boolean(row.city))
      .map(row => ({
        city: row.city as string,
        count: Number(row.count),
      })),
    topCountries: countries
      .filter(row => Boolean(row.country))
      .map(row => ({
        country: row.country as string,
        count: Number(row.count),
      })),
    topReferrers: referrers.map(row => ({
      referrer: (row.referrer ?? '') as string,
      count: Number(row.count),
    })),
  };
}

// Helper function to get analytics for the current user
export async function getUserAnalytics(
  clerkUserId: string,
  range: TimeRange = '30d'
) {
  // Map Clerk user ID to internal users.id (UUID)
  const found = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  const appUserId = found?.[0]?.id;
  if (!appUserId) {
    throw new Error('User not found for Clerk ID');
  }

  // First get the creator profile for this internal user id
  const creatorProfile = await db.query.creatorProfiles.findFirst({
    where: (profiles, { eq }) => eq(profiles.userId, appUserId),
  });

  if (!creatorProfile) {
    throw new Error('Creator profile not found');
  }

  const analytics = await getAnalyticsData(creatorProfile.id, range);

  return {
    ...analytics,
    // Profile page visits increment creator_profiles.profile_views.
    // The click_events table tracks link clicks; it is not a reliable proxy for views.
    profileViewsInRange: creatorProfile.profileViews ?? 0,
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
  const found = await db
    .select({ id: users.id, isPro: users.isPro })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  const appUserId = found?.[0]?.id;
  const userIsPro = Boolean(found?.[0]?.isPro);
  if (!appUserId) {
    throw new Error('User not found for Clerk ID');
  }

  const creatorProfile = await db.query.creatorProfiles.findFirst({
    columns: {
      id: true,
      profileViews: true,
    },
    where: (profiles, { eq }) => eq(profiles.userId, appUserId),
  });

  if (!creatorProfile) {
    throw new Error('Creator profile not found');
  }

  const startDate = toStartDate(range);
  const recentThreshold = new Date();
  recentThreshold.setDate(recentThreshold.getDate() - 7);

  const [cities, countries, referrers, uniqueUsers] = await Promise.all([
    db
      .select({ city: clickEvents.city, count: count() })
      .from(clickEvents)
      .where(
        and(
          eq(clickEvents.creatorProfileId, creatorProfile.id),
          gte(clickEvents.createdAt, startDate),
          isNotNull(clickEvents.city)
        )
      )
      .groupBy(clickEvents.city)
      .orderBy(drizzleSql`count DESC`)
      .limit(5),
    db
      .select({ country: clickEvents.country, count: count() })
      .from(clickEvents)
      .where(
        and(
          eq(clickEvents.creatorProfileId, creatorProfile.id),
          gte(clickEvents.createdAt, startDate),
          isNotNull(clickEvents.country)
        )
      )
      .groupBy(clickEvents.country)
      .orderBy(drizzleSql`count DESC`)
      .limit(5),
    db
      .select({ referrer: clickEvents.referrer, count: count() })
      .from(clickEvents)
      .where(
        and(
          eq(clickEvents.creatorProfileId, creatorProfile.id),
          gte(clickEvents.createdAt, startDate)
        )
      )
      .groupBy(clickEvents.referrer)
      .orderBy(drizzleSql`count DESC`)
      .limit(5),

    db
      .select({ count: count() })
      .from(audienceMembers)
      .where(
        and(
          eq(audienceMembers.creatorProfileId, creatorProfile.id),
          gte(audienceMembers.lastSeenAt, startDate),
          isNotNull(audienceMembers.fingerprint)
        )
      )
      .limit(1),
  ]);

  const uniqueUsersCount = Number(uniqueUsers?.[0]?.count ?? 0);

  const base: DashboardAnalyticsResponse = {
    view,
    profile_views: creatorProfile.profileViews ?? 0,
    unique_users: uniqueUsersCount,
    top_cities: cities
      .filter(row => Boolean(row.city))
      .map(row => ({ city: row.city as string, count: Number(row.count) })),
    top_countries: countries
      .filter(row => Boolean(row.country))
      .map(row => ({
        country: row.country as string,
        count: Number(row.count),
      })),
    top_referrers: referrers.map(row => ({
      referrer: (row.referrer ?? '') as string,
      count: Number(row.count),
    })),
  };

  if (view === 'traffic') {
    return base;
  }

  if (!userIsPro) {
    return base;
  }

  const [counts] = await db
    .select({
      total: count(),
      spotify: drizzleSql<number>`count(*) filter (where ${clickEvents.linkType} = 'listen')`,
      social: drizzleSql<number>`count(*) filter (where ${clickEvents.linkType} = 'social')`,
      recent: drizzleSql<number>`count(*) filter (where ${clickEvents.createdAt} >= ${recentThreshold})`,
    })
    .from(clickEvents)
    .where(
      and(
        eq(clickEvents.creatorProfileId, creatorProfile.id),
        gte(clickEvents.createdAt, startDate)
      )
    );

  const [listenClicks, subscribers, identifiedUsers] = await Promise.all([
    db
      .select({ count: count() })
      .from(clickEvents)
      .where(
        and(
          eq(clickEvents.creatorProfileId, creatorProfile.id),
          gte(clickEvents.createdAt, startDate),
          eq(clickEvents.linkType, 'listen')
        )
      )
      .limit(1),
    db
      .select({ count: count() })
      .from(notificationSubscriptions)
      .where(
        and(
          eq(notificationSubscriptions.creatorProfileId, creatorProfile.id),
          gte(notificationSubscriptions.createdAt, startDate)
        )
      )
      .limit(1),
    db
      .select({ count: count() })
      .from(audienceMembers)
      .where(
        and(
          eq(audienceMembers.creatorProfileId, creatorProfile.id),
          gte(audienceMembers.updatedAt, startDate),
          isNotNull(audienceMembers.email)
        )
      )
      .limit(1),
  ]);

  return {
    ...base,
    total_clicks: Number(counts?.total ?? 0),
    spotify_clicks: Number(counts?.spotify ?? 0),
    social_clicks: Number(counts?.social ?? 0),
    recent_clicks: Number(counts?.recent ?? 0),
    listen_clicks: Number(listenClicks?.[0]?.count ?? 0),
    subscribers: Number(subscribers?.[0]?.count ?? 0),
    identified_users: Number(identifiedUsers?.[0]?.count ?? 0),
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
