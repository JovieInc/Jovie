import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  entitlements: vi.fn(),
  selectLimit: vi.fn(),
  selectWhere: vi.fn(),
  update: vi.fn(),
  notify: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: mocks.requireAuth,
}));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mocks.entitlements,
}));
vi.mock('@/lib/notifications/providers/slack', () => ({
  notifySlackSmsAccessRequest: mocks.notify,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.capture,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (condition?: unknown) => {
          void condition;
          const builder = {
            limit: () => mocks.selectLimit(),
            then: (
              resolve: (value: unknown) => unknown,
              reject?: (reason: unknown) => unknown
            ) => Promise.resolve(mocks.selectWhere()).then(resolve, reject),
          };
          return builder;
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => mocks.update(),
        }),
      }),
    }),
  },
}));

describe('POST /api/sms-access-request entitlements gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ userId: 'user_1', error: null });
    mocks.entitlements.mockResolvedValue({ isPro: true });
    mocks.selectLimit
      .mockResolvedValueOnce([
        { id: 'user_1', name: 'Artist', email: 'a@example.com' },
      ])
      .mockResolvedValueOnce([
        {
          id: 'profile_1',
          displayName: 'Artist',
          username: 'artist',
          smsAccessRequestedAt: null,
        },
      ]);
    mocks.selectWhere.mockResolvedValue([{ value: 0 }]);
    mocks.update.mockResolvedValue([{ id: 'profile_1' }]);
    mocks.notify.mockResolvedValue(undefined);
  });

  it('rejects free users via entitlements.isPro', async () => {
    mocks.entitlements.mockResolvedValue({ isPro: false });

    const { POST } = await import('./route');
    const response = await POST();

    expect(response.status).toBe(403);
    expect(mocks.entitlements).toHaveBeenCalledOnce();
    expect(mocks.selectLimit).not.toHaveBeenCalled();
  });

  it('allows pro users through the entitlements gate', async () => {
    const { POST } = await import('./route');
    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.entitlements).toHaveBeenCalledOnce();
    expect(mocks.selectLimit).toHaveBeenCalled();
  });
});
