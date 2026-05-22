import { describe, expect, it } from 'vitest';
import { getChatUsageCopy } from '@/lib/chat-usage/copy';
import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';

const baseUsage: ChatUsageData = {
  plan: 'free',
  dailyLimit: 10,
  used: 4,
  remaining: 6,
  isExhausted: false,
  warningThreshold: 2,
  isNearLimit: false,
};

describe('getChatUsageCopy', () => {
  it('returns healthy copy', () => {
    const copy = getChatUsageCopy(baseUsage);

    expect(copy.state).toBe('healthy');
    expect(copy.headerLabel).toBe('6 messages left');
    expect(copy.statusLabel).toBe('Within Daily Limit');
  });

  it('returns near-limit copy', () => {
    const copy = getChatUsageCopy({
      ...baseUsage,
      used: 9,
      remaining: 1,
      isNearLimit: true,
    });

    expect(copy.state).toBe('near_limit');
    expect(copy.headerLabel).toBe('1 message left');
    expect(copy.summaryTitle).toBe("You're almost out of messages");
    expect(copy.summaryDescription).toContain('1 remaining today');
  });

  it('returns exhausted copy for free plans', () => {
    const copy = getChatUsageCopy({
      ...baseUsage,
      used: 10,
      remaining: 0,
      isNearLimit: false,
      isExhausted: true,
    });

    expect(copy.state).toBe('exhausted');
    expect(copy.headerLabel).toBe('Daily chat limit reached');
    expect(copy.ctaLabel).toBe('Upgrade to Pro');
  });
});
