import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockGetRateLimitStatus = vi.hoisted(() => vi.fn());
const mockSubscribeToNotificationsDomain = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
  getRateLimitStatus: mockGetRateLimitStatus,
}));

vi.mock('@/lib/notifications/domain', () => ({
  AUDIENCE_COOKIE_NAME: 'jovie_audience',
  buildInvalidRequestResponse: vi.fn().mockReturnValue({
    body: { success: false, error: 'Invalid request', code: 'invalid_request' },
    status: 400,
  }),
  subscribeToNotificationsDomain: mockSubscribeToNotificationsDomain,
}));

describe('POST /api/notifications/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCheckRateLimit.mockReturnValue(false);
    mockGetRateLimitStatus.mockReturnValue({
      limit: 100,
      remaining: 99,
      resetTime: Date.now() + 60000,
    });
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue(true);

    const { POST } = await import('@/app/api/notifications/subscribe/route');
    const request = new NextRequest(
      'http://localhost/api/notifications/subscribe',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.success).toBe(false);
    expect(data.code).toBe('rate_limited');
  });

  it('returns 400 for invalid JSON', async () => {
    const { POST } = await import('@/app/api/notifications/subscribe/route');
    const request = new NextRequest(
      'http://localhost/api/notifications/subscribe',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('subscribes successfully with valid request', async () => {
    mockSubscribeToNotificationsDomain.mockResolvedValue({
      body: { success: true },
      status: 200,
      audienceIdentified: true,
    });

    const { POST } = await import('@/app/api/notifications/subscribe/route');
    const request = new NextRequest(
      'http://localhost/api/notifications/subscribe',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          creatorProfileId: '123',
        }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('returns 500 on server error', async () => {
    mockSubscribeToNotificationsDomain.mockRejectedValue(
      new Error('Database error')
    );

    const { POST } = await import('@/app/api/notifications/subscribe/route');
    const request = new NextRequest(
      'http://localhost/api/notifications/subscribe',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.code).toBe('server_error');
  });
});
