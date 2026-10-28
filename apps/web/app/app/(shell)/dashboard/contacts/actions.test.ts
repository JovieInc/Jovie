import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProfileContactsForOwner } from './actions';

const mock = vi.hoisted(() => ({
  userId: 'user-1' as string | null,
  owner: true,
  reads: vi.fn(),
  ownership: vi.fn(),
  cache: new Map<string, unknown>(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({ userId: mock.userId }),
}));
vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: async (
    operation: (tx: unknown, userId: string) => unknown
  ) =>
    operation(
      {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: async () => {
                  mock.ownership();
                  return mock.owner ? [{ id: 'profile-1' }] : [];
                },
              }),
            }),
          }),
        }),
      },
      mock.userId ?? ''
    ),
}));
vi.mock('@/lib/contacts/queries', () => ({
  getDashboardContacts: mock.reads,
}));
vi.mock('@/lib/cache/profile', () => ({ invalidateProfileCache: vi.fn() }));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: vi.fn(),
}));
vi.mock('next/cache', () => ({
  unstable_noStore: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache:
    (callback: () => Promise<unknown>, keyParts: string[]) => async () => {
      const key = JSON.stringify(keyParts);
      if (mock.cache.has(key)) return mock.cache.get(key);
      const result = await callback();
      mock.cache.set(key, result);
      return result;
    },
}));

describe('contacts persistent cache authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.userId = 'user-1';
    mock.owner = true;
    mock.cache.clear();
    mock.reads.mockResolvedValue([{ id: 'private-contact' }]);
  });

  it('checks current ownership on a warm cache without repeating the data read', async () => {
    const first = await getProfileContactsForOwner('profile-1');
    const checksBeforeHit = mock.ownership.mock.calls.length;
    await expect(getProfileContactsForOwner('profile-1')).resolves.toEqual(
      first
    );
    expect(mock.ownership).toHaveBeenCalledTimes(checksBeforeHit + 1);
    expect(mock.reads).toHaveBeenCalledTimes(1);
  });

  it('denies a revoked owner even when their private contact result is cached', async () => {
    await getProfileContactsForOwner('profile-1');
    mock.owner = false;
    await expect(getProfileContactsForOwner('profile-1')).rejects.toThrow(
      'Unauthorized to access this profile'
    );
    expect(mock.reads).toHaveBeenCalledTimes(1);
  });

  it('rejects an anonymous request before reading ownership or cached data', async () => {
    mock.userId = null;
    await expect(getProfileContactsForOwner('profile-1')).rejects.toThrow(
      'Unauthorized'
    );
    expect(mock.ownership).not.toHaveBeenCalled();
    expect(mock.reads).not.toHaveBeenCalled();
  });
});
