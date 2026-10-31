import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  legacyTx: vi.fn(),
  setupDbSession: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuth,
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.select,
    transaction: hoisted.transaction,
  },
}));
vi.mock('@/lib/auth/session', () => ({
  setupDbSession: hoisted.setupDbSession,
}));
vi.mock('@/lib/db/legacy-transaction', () => ({
  runLegacyDbTransaction: hoisted.legacyTx,
}));
vi.mock('@/lib/auth/app-user-id', () => ({
  appUserIdFilter: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

describe('createAdditionalProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCachedAuth.mockResolvedValue({ userId: 'user-1' });
  });

  it.each(['dualipa', 'testartist', 'authqaprod', 'e2eclaimartist'])(
    'rejects protected identity %s before database access',
    async username => {
      const { createAdditionalProfile } = await import('./switch-profile');
      const result = await createAdditionalProfile({
        displayName: 'Protected Fixture',
        username,
      });

      expect(result).toEqual({
        success: false,
        error: 'Username is reserved',
      });
      expect(hoisted.select).not.toHaveBeenCalled();
      expect(hoisted.transaction).not.toHaveBeenCalled();
    }
  );
});

describe('createAdditionalProfile account status gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCachedAuth.mockResolvedValue({ userId: 'user-1' });
  });

  it.each(['banned', 'suspended', 'waitlist_pending'])(
    'does not create a public profile for a %s account',
    async userStatus => {
      hoisted.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ id: 'u1', userStatus }]),
          }),
        }),
      });
      const { createAdditionalProfile } = await import('./switch-profile');

      const result = await createAdditionalProfile({
        displayName: 'Someone',
        username: 'someone-new',
      });

      expect(result.success).toBe(false);
      expect(hoisted.legacyTx).not.toHaveBeenCalled();
    }
  );
});
