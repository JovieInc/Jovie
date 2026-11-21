import { describe, expect, it } from 'vitest';
import { trackingLimiterResponse } from './tracking-outage';
import type { RateLimitResult } from './types';

const denied = (overrides: Partial<RateLimitResult> = {}): RateLimitResult => ({
  success: false,
  limit: 60,
  remaining: 0,
  reset: new Date(Date.now() + 60_000),
  ...overrides,
});

describe('trackingLimiterResponse', () => {
  it('returns null when the limiter allows the request', () => {
    expect(
      trackingLimiterResponse(
        {
          success: true,
          limit: 60,
          remaining: 59,
          reset: new Date(),
        },
        {
          dropBody: { dropped: true },
          throttleBody: { error: 'throttled' },
        }
      )
    ).toBeNull();
  });

  it('acks and drops when the durable backend is unavailable', async () => {
    const response = trackingLimiterResponse(denied({ unavailable: true }), {
      dropBody: { success: true, dropped: true },
      throttleBody: { error: 'throttled' },
    });
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ success: true, dropped: true });
  });

  it('returns 429 for healthy quota exhaustion', async () => {
    const response = trackingLimiterResponse(denied(), {
      dropBody: { dropped: true },
      throttleBody: { error: 'throttled' },
    });
    expect(response?.status).toBe(429);
    expect(await response?.json()).toEqual({ error: 'throttled' });
  });
});
