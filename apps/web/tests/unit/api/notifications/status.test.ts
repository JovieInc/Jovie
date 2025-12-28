import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockGetNotificationStatus = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
  getRateLimitStatus: vi.fn().mockReturnValue({
    limit: 100,
    remaining: 99,
    resetTime: Date.now() + 60000,
  }),
}));

vi.mock('@/lib/notifications/domain', () => ({
  getNotificationStatusDomain: mockGetNotificationStatus,
  buildInvalidRequestResponse: vi.fn().mockReturnValue({
    body: { success: false, error: 'Invalid request' },
    status: 400,
  }),
}));

describe('POST /api/notifications/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCheckRateLimit.mockReturnValue(false);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue(true);

    const { POST } = await import('@/app/api/notifications/status/route');
    const request = new NextRequest(
      'http://localhost/api/notifications/status',
      {
        method: 'POST',
        body: JSON.stringify({
          creatorProfileId: '123',
          email: 'test@example.com',
        }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toBeDefined();
  });

  it('returns notification status for valid request', async () => {
    mockGetNotificationStatus.mockResolvedValue({
      body: { subscribed: true, preferences: {} },
      status: 200,
    });

    const { POST } = await import('@/app/api/notifications/status/route');
    const request = new NextRequest(
      'http://localhost/api/notifications/status',
      {
        method: 'POST',
        body: JSON.stringify({
          creatorProfileId: '123',
          email: 'test@example.com',
        }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.subscribed).toBe(true);
  });
});
