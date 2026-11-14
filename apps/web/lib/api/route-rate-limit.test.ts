import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { rateLimitBy } from './route-rate-limit';

const input = {
  request: new NextRequest('https://jov.ie/api/test'),
  auth: { userId: 'user_1' },
  responseHeaders: { 'Cache-Control': 'no-store' },
};

const result = (overrides: Record<string, unknown>) => ({
  success: false,
  limit: 10,
  remaining: 0,
  reset: new Date(Date.now() + 30_000),
  ...overrides,
});

describe('rateLimitBy', () => {
  it('continues when the limiter allows, keyed by the caller', async () => {
    const limiter = { limit: vi.fn(async () => result({ success: true })) };
    const stage = rateLimitBy<{ userId: string }>({
      limiter,
      key: ({ auth }) => auth.userId,
    });

    expect(await stage(input)).toBeNull();
    expect(limiter.limit).toHaveBeenCalledWith('user_1');
  });

  it('answers 429 with rate limit and no-store headers when exhausted', async () => {
    const stage = rateLimitBy({
      limiter: { limit: async () => result({}) },
      key: () => 'ip',
      message: 'Slow down',
    });

    const response = await stage(input);

    expect(response?.status).toBe(429);
    expect(await response?.json()).toEqual({ error: 'Slow down' });
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(response?.headers.get('retry-after')).not.toBeNull();
  });

  it('answers 503, not quota exhaustion, when the limiter backend is down', async () => {
    const stage = rateLimitBy({
      limiter: { limit: async () => result({ unavailable: true }) },
      key: () => 'ip',
      message: 'Slow down',
    });

    const response = await stage(input);

    expect(response?.status).toBe(503);
    expect((await response?.json()).error).not.toBe('Slow down');
  });
});
