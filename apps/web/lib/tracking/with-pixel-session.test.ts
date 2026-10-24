import { NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const eqMock = vi.hoisted(() =>
  vi.fn((column: unknown, value: unknown) => ({ column, value }))
);
const limitMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ profileId: 'profile-1', username: 'artist' }])
);

vi.mock('drizzle-orm', () => ({ eq: eqMock }));
vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'users.id', clerkId: 'users.clerkId' },
}));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'creatorProfiles.id',
    userId: 'creatorProfiles.userId',
    username: 'creatorProfiles.username',
  },
}));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: vi.fn().mockResolvedValue({
    canAccessAdPixels: true,
  }),
}));
vi.mock('@/lib/entitlements/registry', () => ({
  getPlanDisplayName: () => 'Pro',
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: (
    operation: (tx: unknown, appUserId: string) => Promise<unknown>
  ) => {
    const tx = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({ where: () => ({ limit: limitMock }) }),
        }),
      }),
    };
    return operation(tx, 'app-user-uuid');
  },
}));

describe('withPixelSession', () => {
  it('resolves the profile by the session app user id, not the retired Clerk id', async () => {
    const { withPixelSession } = await import('./with-pixel-session');
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));

    const response = await withPixelSession('Pixels Health', handler);

    expect(response.status).toBe(200);
    expect(eqMock).toHaveBeenCalledWith('users.id', 'app-user-uuid');
    expect(eqMock).not.toHaveBeenCalledWith('users.clerkId', expect.anything());
    expect(handler).toHaveBeenCalledWith(expect.anything(), {
      profileId: 'profile-1',
      username: 'artist',
    });
  });
});
