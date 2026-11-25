import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  creatorEntitlements: vi.fn(),
  requestOtp: vi.fn(),
  sendNotification: vi.fn(),
  generalLimit: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('@/lib/entitlements/creator-plan', () => ({
  getCreatorEntitlements: mocks.creatorEntitlements,
}));
vi.mock('@/lib/notifications/otp-service', () => ({
  requestEmailOtp: mocks.requestOtp,
}));
vi.mock('@/lib/notifications/service', () => ({
  sendNotification: mocks.sendNotification,
}));
vi.mock('@/lib/notifications/email-otp-limiters', () => ({
  emailOtpResendCooldownLimiter: {
    limit: vi.fn().mockResolvedValue({ success: true }),
  },
  emailOtpSendLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
}));
vi.mock('@/lib/rate-limit', () => ({
  generalLimiter: { limit: mocks.generalLimit },
  getClientIP: () => '127.0.0.1',
  createRateLimitHeaders: () => ({}),
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.capture,
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => mocks.select(),
          }),
        }),
      }),
    }),
  },
}));

describe('POST /api/promo-downloads/[id]/request-otp entitlements gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generalLimit.mockResolvedValue({ success: true });
    mocks.select.mockResolvedValue([
      {
        id: 'download_1',
        creatorProfileId: 'profile_1',
        releaseId: 'release_1',
        title: 'Track',
        artworkUrl: null,
        isActive: true,
        artistName: 'Artist',
      },
    ]);
    mocks.creatorEntitlements.mockResolvedValue({ plan: 'pro' });
    mocks.requestOtp.mockResolvedValue({
      success: true,
      otpCode: '123456',
      normalizedEmail: 'fan@example.com',
    });
    mocks.sendNotification.mockResolvedValue(undefined);
  });

  it('hides downloads when creator plan is not pro-tier', async () => {
    mocks.creatorEntitlements.mockResolvedValue({ plan: 'free' });

    const { POST } = await import('./route');
    const response = await POST(
      new Request(
        'http://localhost/api/promo-downloads/download_1/request-otp',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'fan@example.com' }),
        }
      ) as never,
      { params: Promise.resolve({ id: 'download_1' }) }
    );

    expect(response.status).toBe(404);
    expect(mocks.creatorEntitlements).toHaveBeenCalledWith('profile_1');
    expect(mocks.requestOtp).not.toHaveBeenCalled();
  });

  it('continues when creator entitlements resolve to a pro plan', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request(
        'http://localhost/api/promo-downloads/download_1/request-otp',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'fan@example.com' }),
        }
      ) as never,
      { params: Promise.resolve({ id: 'download_1' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.creatorEntitlements).toHaveBeenCalledWith('profile_1');
  });
});
