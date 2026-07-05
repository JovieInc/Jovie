import type { AiCrawlerAnalyticsResponse } from '@/types/ai-crawler-analytics';

/** Weekly digest copy surfaced in insights and notifications. */
export function formatAiCrawlerWeeklyDigestLine(
  analytics: Pick<AiCrawlerAnalyticsResponse, 'weeklyRequests'>
): string | null {
  const count = analytics.weeklyRequests;
  if (count <= 0) {
    return null;
  }

  const noun = count === 1 ? 'time' : 'times';
  return `AI services read your page ${count.toLocaleString()} ${noun} this week.`;
}
