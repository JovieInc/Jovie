import { describe, expect, it } from 'vitest';
import {
  formatAnalyticsStageRate,
  MIN_SAMPLE_FOR_PERCENT_DELTA,
} from '@/lib/utils/analytics-growth';

describe('formatAnalyticsStageRate', () => {
  it('returns null when the base is below the sample floor', () => {
    expect(formatAnalyticsStageRate(12, 1)).toBeNull();
    expect(formatAnalyticsStageRate(3, 1)).toBeNull();
    expect(
      formatAnalyticsStageRate(20, MIN_SAMPLE_FOR_PERCENT_DELTA - 1)
    ).toBeNull();
  });

  it('returns null when the base is zero', () => {
    expect(formatAnalyticsStageRate(12, 0)).toBeNull();
  });

  it('shows percent conversion once the base meets the sample floor', () => {
    expect(formatAnalyticsStageRate(60, 30)).toBe('200%');
    expect(formatAnalyticsStageRate(45, 30)).toBe('150%');
  });
});
