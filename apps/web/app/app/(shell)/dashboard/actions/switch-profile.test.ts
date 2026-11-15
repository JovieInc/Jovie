import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  legacyTx: vi.fn(),
  setupDbSession: vi.fn(),
  update: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuth,
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.select,
    transaction: hoisted.transaction,
    update: hoisted.update,
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
vi.mock('next/cache', () => ({ revalidateTag: hoisted.revalidateTag }));

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

describe('switchActiveProfile cache invalidation', () => {
  const PROFILE_ID = '550e8400-e29b-41d4-a716-446655440000';

  function selectRows(rows: unknown[]) {
    return {
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(rows) }),
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCachedAuth.mockResolvedValue({ userId: 'user-1' });
  });

  it('expires dashboard data immediately so the refresh shows the new profile', async () => {
    hoisted.select
      .mockReturnValueOnce(selectRows([{ id: 'u1', activeProfileId: 'old' }]))
      .mockReturnValueOnce(selectRows([{ id: 'claim-1' }]));
    hoisted.update.mockReturnValue({
      set: () => ({ where: () => Promise.resolve() }),
    });
    const { switchActiveProfile } = await import('./switch-profile');

    await expect(switchActiveProfile(PROFILE_ID)).resolves.toEqual({
      success: true,
    });

    // Called from a Route Handler followed by router.refresh(): 'max' would
    // serve the previous profile stale, and updateTag throws outside actions.
    expect(hoisted.revalidateTag).toHaveBeenCalledTimes(1);
    expect(hoisted.revalidateTag).toHaveBeenCalledWith('dashboard-data', {
      expire: 0,
    });
  });

  it('does not touch the cache when the profile is already active', async () => {
    hoisted.select.mockReturnValueOnce(
      selectRows([{ id: 'u1', activeProfileId: PROFILE_ID }])
    );
    const { switchActiveProfile } = await import('./switch-profile');

    await expect(switchActiveProfile(PROFILE_ID)).resolves.toEqual({
      success: true,
    });
    expect(hoisted.revalidateTag).not.toHaveBeenCalled();
  });
});
