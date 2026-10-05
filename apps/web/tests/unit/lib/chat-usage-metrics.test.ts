import { describe, expect, it } from 'vitest';
import {
  formatUsageResetLabel,
  formatUsageResetTime,
  getWeeklyUsageModel,
} from '@/lib/chat-usage/metrics';
import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';

const baseUsage: ChatUsageData = {
  plan: 'free',
  weeklyLimit: 15,
  used: 4,
  remaining: 11,
  resetAt: '2026-05-23T19:27:00.000Z',
  isExhausted: false,
  warningThreshold: 3,
  isNearLimit: false,
};

describe('chat usage metrics', () => {
  it('normalizes weekly chat usage through the shared meter model', () => {
    expect(getWeeklyUsageModel(baseUsage)).toMatchObject({
      used: 4,
      limit: 15,
      remaining: 11,
      remainingPercent: 73,
      state: 'healthy',
    });
  });

  it('does not overstate remaining capacity when weekly fields disagree', () => {
    expect(
      getWeeklyUsageModel({
        ...baseUsage,
        used: 2,
        remaining: 1,
      })
    ).toMatchObject({ used: 14, remaining: 1, remainingPercent: 7 });
  });

  it('formats compact reset labels for the inline menu', () => {
    expect(formatUsageResetTime('2026-05-23T19:27:00.000Z')).toMatch(/PM|AM/);
    expect(formatUsageResetTime(null)).toBe('—');
  });
  it('only prefixes a real reset and includes the display timezone', () => {
    expect(formatUsageResetLabel(null)).toBe('Reset timing unavailable');
    expect(formatUsageResetLabel('invalid')).toBe('Reset timing unavailable');
    const value = '2026-10-08T07:00:00.000Z';
    const zone = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
      .formatToParts(new Date(value))
      .find(part => part.type === 'timeZoneName')?.value;
    expect(formatUsageResetLabel(value)).toContain(zone);
    expect(formatUsageResetLabel(value)).toMatch(/^Resets /);
  });
});
