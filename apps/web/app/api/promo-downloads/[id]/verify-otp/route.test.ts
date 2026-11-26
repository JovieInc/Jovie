import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  creatorEntitlements: vi.fn(),
  verifyOtp: vi.fn(),
  generalLimit: vi.fn(),
  verifyLimit: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('@/lib/entitlements/creator-plan', () => ({
  getCreatorEntitlements: mocks.creatorEntitlements,
}));
vi.mock('@/lib/notifications/otp-service', () => ({
  verifyEmailOtp: mocks.verifyOtp,
  upsertPromoAudienceMember: vi.fn(),
}));
vi.mock('@/lib/notifications/service', () => ({
  sendNotification: vi.fn(),
}));
vi.mock('@/lib/notifications/email-otp-limiters', () => ({
  emailOtpVerifyLimiter: { limit: () => mocks.verifyLimit() },
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
        where: () => ({
          orderBy: () => Promise.resolve([]),
        }),
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve(),
    }),
  },
}));

describe('POST /api/promo-downloads/[id]/verify-otp entitlements gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generalLimit.mockResolvedValue({ success: true });
    mocks.verifyLimit.mockResolvedValue({ success: true });
    mocks.select.mockResolvedValue([
      {
        id: 'download_1',
        creatorProfileId: 'profile_1',
        releaseId: 'release_1',
        title: 'Track',
        artworkUrl: null,
        isActive: true,
        artistName: 'Artist',
        artistHandle: 'artist',
      },
    ]);
    mocks.creatorEntitlements.mockResolvedValue({ plan: 'pro' });
    mocks.verifyOtp.mockResolvedValue({ success: true });
  });

  it('hides downloads when creator plan is free', async () => {
    mocks.creatorEntitlements.mockResolvedValue({ plan: 'free' });

    const { POST } = await import('./route');
    const response = await POST(
      new Request(
        'http://localhost/api/promo-downloads/download_1/verify-otp',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'fan@example.com', code: '123456' }),
        }
      ) as never,
      { params: Promise.resolve({ id: 'download_1' }) }
    );

    expect(response.status).toBe(404);
    expect(mocks.creatorEntitlements).toHaveBeenCalledWith('profile_1');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
});
