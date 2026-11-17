import 'server-only';

import { resolveAuthorizedAnalyticsProfile } from '@/lib/analytics/authorized-profile';
import { cacheQuery } from '@/lib/db/cache';
import { getAiCrawlerAnalyticsForProfile } from '@/lib/db/queries/ai-crawler-analytics';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export async function readAuthorizedAiCrawlerAnalytics(userId: string) {
  const scope = await resolveAuthorizedAnalyticsProfile(userId);
  const entitlements = await getCurrentUserEntitlements();
  const isPro = entitlements.canAccessAdvancedAnalytics;

  return cacheQuery(
    `dashboard-ai-crawlers:v2:${scope.userId}:${scope.profileId}:${isPro ? 'pro' : 'free'}`,
    () => getAiCrawlerAnalyticsForProfile(scope, { isPro }),
    { ttlSeconds: 60 * 60 }
  );
}
