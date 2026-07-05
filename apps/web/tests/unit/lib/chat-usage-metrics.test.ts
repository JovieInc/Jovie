import { describe, expect, it } from 'vitest';
import {
  formatUsageResetDate,
  formatUsageResetTime,
  getMonthlyUsage,
  getOverallRemainingPercent,
  getRemainingPercent,
} from '@/lib/chat-usage/metrics';
import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';

const baseUsage: ChatUsageData = {
  plan: 'free',
  dailyLimit: 10,
  used: 4,
  remaining: 6,
  resetAt: '2026-05-23T19:27:00.000Z',
  monthlyLimit: 310,
  monthlyUsed: 24,
  monthlyRemaining: 286,
  monthlyResetAt: '2026-06-01T00:00:00.000Z',
  isExhausted: false,
  warningThreshold: 2,
  isNearLimit: false,
};

describe('chat usage metrics', () => {
  it('derives monthly usage from the same fields as the settings page', () => {
    expect(getMonthlyUsage(baseUsage)).toEqual({
      limit: 310,
      used: 24,
      remaining: 286,
      resetAt: '2026-06-01T00:00:00.000Z',
    });
  });

  it('computes remaining percent from quota left', () => {
    expect(getRemainingPercent(6, 10)).toBe(60);
    expect(getRemainingPercent(286, 310)).toBe(92);
  });

  it('uses the tighter window for the collapsed menu percent', () => {
    expect(getOverallRemainingPercent(baseUsage)).toBe(60);

    expect(
      getOverallRemainingPercent({
        ...baseUsage,
        remaining: 9,
        monthlyRemaining: 50,
      })
    ).toBe(16);
  });

  it('formats compact reset labels for the inline menu', () => {
    expect(formatUsageResetTime('2026-05-23T19:27:00.000Z')).toMatch(/PM|AM/);
    expect(formatUsageResetTime(null)).toBe('—');
    expect(formatUsageResetDate('2026-06-01T00:00:00.000Z')).toMatch(
      /May 31|Jun 1/
    );
  });
});
