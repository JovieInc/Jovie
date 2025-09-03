import { and, count, sql as drizzleSql, eq, gte, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clickEvents, users } from '@/lib/db/schema';

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

  // New: top referrers within selected range
  const referrers = await db
    .select({ referrer: clickEvents.referrer, count: count() })
    .from(clickEvents)
    .where(
      and(
        eq(clickEvents.creatorProfileId, creatorProfileId),
        gte(clickEvents.createdAt, startDate),
        isNotNull(clickEvents.referrer)
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
    topCountries: countries
      .filter(row => Boolean(row.country))
      .map(row => ({
        country: row.country as string,
        count: Number(row.count),
      })),
    topReferrers: referrers
      .filter(row => Boolean(row.referrer))
      .map(row => ({
        referrer: row.referrer as string,
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

  return getAnalyticsData(creatorProfile.id, range);
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
