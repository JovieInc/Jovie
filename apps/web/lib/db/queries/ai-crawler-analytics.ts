import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { getSessionContext } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { aiCrawlerAnalyticsSnapshots } from '@/lib/db/schema/ai-crawler-analytics';
import type { AiCrawlerAnalyticsResponse } from '@/types/ai-crawler-analytics';

const DEFAULT_PERIOD_DAYS = 30;

const EMPTY_RESPONSE: AiCrawlerAnalyticsResponse = {
  totalRequests: 0,
  weeklyRequests: 0,
  crawlers: [],
  dailyTrend: [],
  syncedAt: null,
  isPro: false,
  isTeaser: true,
};

function buildTeaserResponse(
  snapshot: {
    totalRequests: number;
    weeklyRequests: number;
    syncedAt: Date | null;
  } | null
): AiCrawlerAnalyticsResponse {
  return {
    totalRequests: snapshot?.totalRequests ?? 0,
    weeklyRequests: snapshot?.weeklyRequests ?? 0,
    crawlers: [
      {
        id: 'teaser-1',
        name: 'AI Crawler',
        requests: 0,
        previousPeriodRequests: 0,
      },
      {
        id: 'teaser-2',
        name: 'AI Search Bot',
        requests: 0,
        previousPeriodRequests: 0,
      },
      {
        id: 'teaser-3',
        name: 'AI Assistant',
        requests: 0,
        previousPeriodRequests: 0,
      },
    ],
    dailyTrend: [],
    syncedAt: snapshot?.syncedAt?.toISOString() ?? null,
    isPro: false,
    isTeaser: true,
  };
}

export async function getAiCrawlerAnalyticsForUser(
  clerkUserId: string,
  options: { readonly isPro: boolean }
): Promise<AiCrawlerAnalyticsResponse> {
  const { profile } = await getSessionContext({
    clerkUserId,
    requireUser: true,
    requireProfile: true,
  });

  if (!profile) {
    return EMPTY_RESPONSE;
  }

  const [snapshot] = await db
    .select({
      totalRequests: aiCrawlerAnalyticsSnapshots.totalRequests,
      weeklyRequests: aiCrawlerAnalyticsSnapshots.weeklyRequests,
      crawlers: aiCrawlerAnalyticsSnapshots.crawlers,
      dailyTrend: aiCrawlerAnalyticsSnapshots.dailyTrend,
      syncedAt: aiCrawlerAnalyticsSnapshots.syncedAt,
    })
    .from(aiCrawlerAnalyticsSnapshots)
    .where(
      and(
        eq(aiCrawlerAnalyticsSnapshots.creatorProfileId, profile.id),
        eq(aiCrawlerAnalyticsSnapshots.periodDays, DEFAULT_PERIOD_DAYS)
      )
    )
    .orderBy(desc(aiCrawlerAnalyticsSnapshots.syncedAt))
    .limit(1);

  if (!snapshot) {
    return options.isPro
      ? {
          ...EMPTY_RESPONSE,
          isPro: true,
          isTeaser: false,
        }
      : EMPTY_RESPONSE;
  }

  if (!options.isPro) {
    return buildTeaserResponse(snapshot);
  }

  return {
    totalRequests: snapshot.totalRequests,
    weeklyRequests: snapshot.weeklyRequests,
    crawlers: snapshot.crawlers,
    dailyTrend: snapshot.dailyTrend,
    syncedAt: snapshot.syncedAt?.toISOString() ?? null,
    isPro: true,
    isTeaser: false,
  };
}
