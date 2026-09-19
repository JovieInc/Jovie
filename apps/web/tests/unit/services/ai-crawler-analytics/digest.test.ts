import { describe, expect, it } from 'vitest';
import {
  buildAiVisibilityMeasurement,
  requireMeasuredAiVisibilityMetric,
} from '@/lib/aeo/visibility-measurement';
import { formatAiCrawlerWeeklyDigestLine } from '@/lib/services/ai-crawler-analytics/digest';

describe('formatAiCrawlerWeeklyDigestLine', () => {
  it('returns null when there were no weekly reads', () => {
    expect(formatAiCrawlerWeeklyDigestLine({ weeklyRequests: 0 })).toBeNull();
  });

  it('formats singular and plural weekly digest copy', () => {
    expect(formatAiCrawlerWeeklyDigestLine({ weeklyRequests: 1 })).toBe(
      'AI services read your page 1 time this week.'
    );
    expect(formatAiCrawlerWeeklyDigestLine({ weeklyRequests: 42 })).toBe(
      'AI services read your page 42 times this week.'
    );
  });

  it('formats from the observed-visibility weekly-read metric', () => {
    const weekly = requireMeasuredAiVisibilityMetric(
      buildAiVisibilityMeasurement({
        observed: { weeklyCrawlerReads: 7 },
      }),
      'weekly_crawler_reads',
      'observed_visibility'
    );
    expect(weekly.layer).toBe('observed_visibility');
    expect(formatAiCrawlerWeeklyDigestLine({ weeklyRequests: 7 })).toBe(
      'AI services read your page 7 times this week.'
    );
  });
});
