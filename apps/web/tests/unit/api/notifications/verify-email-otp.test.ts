import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGeneralLimiterLimit = vi.hoisted(() => vi.fn());
const mockEmailOtpLimiterLimit = vi.hoisted(() => vi.fn());
const mockVerifyEmailOtpDomain = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: vi.fn().mockReturnValue({
    limit: mockEmailOtpLimiterLimit,
  }),
  generalLimiter: {
    limit: mockGeneralLimiterLimit,
  },
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/notifications/domain', () => ({
  buildInvalidRequestResponse: vi.fn().mockReturnValue({
    body: { success: false, error: 'Invalid request', code: 'invalid_request' },
    status: 400,
  }),
  verifyEmailOtpDomain: mockVerifyEmailOtpDomain,
}));

describe('POST /api/notifications/verify-email-otp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeneralLimiterLimit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(Date.now() + 60000),
    });
    mockEmailOtpLimiterLimit.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: new Date(Date.now() + 60000),
    });
  });

  it('returns 429 when IP limiter is hit', async () => {
    mockGeneralLimiterLimit.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset: new Date(Date.now() + 60000),
    });

    const { POST } = await import(
      '@/app/api/notifications/verify-email-otp/route'
    );
    const request = new NextRequest(
      'http://localhost/api/notifications/verify-email-otp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist_id: 'a',
          email: 'fan@example.com',
          otp_code: '123456',
        }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(429);
  });

  it('verifies code successfully with valid payload', async () => {
    mockVerifyEmailOtpDomain.mockResolvedValue({
      status: 200,
      body: { success: true, message: 'Email verified successfully' },
    });

    const { POST } = await import(
      '@/app/api/notifications/verify-email-otp/route'
    );
    const request = new NextRequest(
      'http://localhost/api/notifications/verify-email-otp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist_id: '2f8f6cf2-6a7f-41e4-b8cf-3e5b9ddf3bda',
          email: 'fan@example.com',
          otp_code: '123456',
        }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
