import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { cacheQuery } from '@/lib/db/cache';
import { getAiCrawlerAnalyticsForUser } from '@/lib/db/queries/ai-crawler-analytics';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET() {
  try {
    const userId = await requireAuth();
    const entitlements = await getCurrentUserEntitlements();
    const isPro = entitlements.canAccessAdvancedAnalytics;

    const payload = await cacheQuery(
      `dashboard-ai-crawlers:${userId}:${isPro ? 'pro' : 'free'}`,
      () => getAiCrawlerAnalyticsForUser(userId, { isPro }),
      { ttlSeconds: 60 * 60 }
    );

    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    logger.error('[api/dashboard/ai-crawlers] Failed to load analytics', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    await captureError('AI crawler analytics API failed', error, {
      route: '/api/dashboard/ai-crawlers',
      method: 'GET',
    });

    return NextResponse.json(
      { error: 'Failed to fetch AI crawler analytics' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}