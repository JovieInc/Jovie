import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withDbSession: vi.fn(),
  entitlements: vi.fn(),
  rateLimit: vi.fn(),
  select: vi.fn(),
  notify: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSession: mocks.withDbSession,
}));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mocks.entitlements,
}));
vi.mock('@/lib/rate-limit', () => ({
  checkVerificationRequestRateLimit: mocks.rateLimit,
  createRateLimitHeaders: () => ({}),
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mocks.select(),
        }),
      }),
    }),
  },
}));
vi.mock('@/lib/verification/notifications', () => ({
  notifyVerificationRequest: mocks.notify,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.capture,
}));

describe('POST /api/verification/request entitlements gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withDbSession.mockImplementation(async fn => fn('user_1'));
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.entitlements.mockResolvedValue({ canBeVerified: true, isPro: true });
    mocks.select
      .mockResolvedValueOnce([
        {
          id: 'user_1',
          clerkId: 'clerk_1',
          name: 'Artist',
          email: 'a@example.com',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'profile_1',
          usernameNormalized: 'artist',
          isVerified: false,
        },
      ]);
    mocks.notify.mockResolvedValue({ status: 'sent' });
  });

  it('rejects when canBeVerified is false without reading users.isPro', async () => {
    mocks.entitlements.mockResolvedValue({
      canBeVerified: false,
      isPro: false,
    });

    const { POST } = await import('./route');
    const response = await POST();

    expect(response.status).toBe(403);
    expect(mocks.entitlements).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('allows paid members that pass canBeVerified', async () => {
    const { POST } = await import('./route');
    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.entitlements).toHaveBeenCalledOnce();
    expect(mocks.notify).toHaveBeenCalledOnce();
  });
});
