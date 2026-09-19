import {
  buildAiVisibilityMeasurement,
  requireMeasuredAiVisibilityMetric,
} from '@/lib/aeo/visibility-measurement';
import type { AiCrawlerAnalyticsResponse } from '@/types/ai-crawler-analytics';

/** Weekly digest copy surfaced in insights and notifications. */
export function formatAiCrawlerWeeklyDigestLine(
  analytics: Pick<AiCrawlerAnalyticsResponse, 'weeklyRequests'>
): string | null {
  const weekly = requireMeasuredAiVisibilityMetric(
    buildAiVisibilityMeasurement({
      observed: { weeklyCrawlerReads: analytics.weeklyRequests },
    }),
    'weekly_crawler_reads',
    'observed_visibility'
  );
  const count = typeof weekly.value === 'number' ? weekly.value : 0;
  if (count <= 0) {
    return null;
  }

  const noun = count === 1 ? 'time' : 'times';
  return `AI services read your page ${count.toLocaleString()} ${noun} this week.`;
}
