import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGeneralLimiterLimit = vi.hoisted(() => vi.fn());
const mockUnsubscribeDomain = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rate-limit', () => ({
  generalLimiter: {
    limit: mockGeneralLimiterLimit,
  },
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/notifications/domain', () => ({
  unsubscribeFromNotificationsDomain: mockUnsubscribeDomain,
  buildInvalidRequestResponse: vi.fn().mockReturnValue({
    body: { success: false, error: 'Invalid request' },
    status: 400,
  }),
}));

describe('POST /api/notifications/unsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGeneralLimiterLimit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(Date.now() + 60000),
    });
  });

  it('returns 429 when rate limited', async () => {
    mockGeneralLimiterLimit.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset: new Date(Date.now() + 60000),
    });

    const { POST } = await import('@/app/api/notifications/unsubscribe/route');
    const request = new NextRequest(
      'http://localhost/api/notifications/unsubscribe',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'unsubscribe_token' }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toBeDefined();
  });

  it('unsubscribes successfully with valid token', async () => {
    mockUnsubscribeDomain.mockResolvedValue({
      body: { success: true },
      status: 200,
    });

    const { POST } = await import('@/app/api/notifications/unsubscribe/route');
    const request = new NextRequest(
      'http://localhost/api/notifications/unsubscribe',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'unsubscribe_token' }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
