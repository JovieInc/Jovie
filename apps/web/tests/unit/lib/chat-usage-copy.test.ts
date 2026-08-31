import { describe, expect, it } from 'vitest';
import { getChatUsageCopy } from '@/lib/chat-usage/copy';
import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';

const baseUsage: ChatUsageData = {
  plan: 'free',
  weeklyLimit: 15,
  used: 4,
  remaining: 6,
  isExhausted: false,
  warningThreshold: 3,
  isNearLimit: false,
};

describe('getChatUsageCopy', () => {
  it('returns healthy copy', () => {
    const copy = getChatUsageCopy(baseUsage);

    expect(copy.state).toBe('healthy');
    expect(copy.headerLabel).toBe('6 messages left');
    expect(copy.statusLabel).toBe('Within Weekly Limit');
  });

  it('returns near-limit copy', () => {
    const copy = getChatUsageCopy({
      ...baseUsage,
      used: 9,
      remaining: 1,
      isNearLimit: false,
    });

    expect(copy.state).toBe('near_limit');
    expect(copy.headerLabel).toBe('1 message left');
    expect(copy.summaryTitle).toBe("You're almost out of messages");
    expect(copy.summaryDescription).toContain('1 remaining this week');
  });

  it('uses the shared usage meter warning state', () => {
    const copy = getChatUsageCopy({
      ...baseUsage,
      used: 12,
      remaining: 3,
      warningThreshold: 0,
      isNearLimit: false,
    });

    expect(copy.state).toBe('near_limit');
    expect(copy.statusLabel).toBe('Near Weekly Limit');
  });

  it('derives state from exact counters instead of stale boolean flags', () => {
    const copy = getChatUsageCopy({
      ...baseUsage,
      isNearLimit: true,
      isExhausted: true,
    });

    expect(copy.state).toBe('healthy');
  });

  it('returns exhausted copy for free plans', () => {
    const copy = getChatUsageCopy({
      ...baseUsage,
      used: 15,
      remaining: 0,
      isNearLimit: false,
      isExhausted: true,
    });

    expect(copy.state).toBe('exhausted');
    expect(copy.headerLabel).toBe('Weekly chat limit reached');
    expect(copy.ctaLabel).toBe('Upgrade to Pro');
  });
});
