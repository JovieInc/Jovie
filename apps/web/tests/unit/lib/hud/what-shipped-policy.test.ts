import { describe, expect, it } from 'vitest';
import {
  WHAT_SHIPPED_FEED_CACHE_TTL_SECONDS,
  WHAT_SHIPPED_MAX_ITEMS,
  WHAT_SHIPPED_POLL_MS,
} from '@/lib/hud/what-shipped-policy';

describe('What shipped Redis budget', () => {
  it('keeps one continuously open HUD below half the monthly free tier', () => {
    const monthSeconds = 30 * 24 * 60 * 60;
    const pollSeconds = WHAT_SHIPPED_POLL_MS / 1_000;
    const polls = Math.ceil(monthSeconds / pollSeconds);
    const cacheMisses = Math.ceil(
      monthSeconds / WHAT_SHIPPED_FEED_CACHE_TTL_SECONDS
    );

    // Every poll reads the feed. A miss also reads one immutable title per
    // item and writes the rebuilt feed. This deliberately leaves at least half
    // of Upstash's 500k free-tier budget for product traffic and other jobs.
    const projectedRequests =
      polls + cacheMisses * (WHAT_SHIPPED_MAX_ITEMS + 1);

    expect(WHAT_SHIPPED_FEED_CACHE_TTL_SECONDS).toBeGreaterThan(pollSeconds);
    expect(projectedRequests).toBeLessThanOrEqual(250_000);
  });
});
