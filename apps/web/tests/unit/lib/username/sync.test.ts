import { beforeEach, describe, expect, it, vi } from 'vitest';

const withDbSessionTxMock = vi.hoisted(() => vi.fn());
const invalidateUsernameChangeMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: withDbSessionTxMock,
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateUsernameChange: invalidateUsernameChangeMock,
}));

type SelectResult = Array<Record<string, unknown>>;

function createTx(selectResults: SelectResult[]) {
  const queue = [...selectResults];

  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const chain = {
            orderBy: vi.fn(() => chain),
            limit: vi.fn(async () => queue.shift() ?? []),
          };
          return chain;
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    })),
  };
}

describe('syncCanonicalUsernameFromApp', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('invalidates old and new profile caches when username changes', async () => {
    const tx = createTx([
      [{ id: 'profile-1', usernameNormalized: 'oldname' }],
      [],
    ]);

    withDbSessionTxMock.mockImplementation(async (operation, options) =>
      operation(tx, options.clerkUserId)
    );

    const { syncCanonicalUsernameFromApp } = await import(
      '@/lib/username/sync'
    );

    await syncCanonicalUsernameFromApp('clerk_1', 'newname');

    expect(invalidateUsernameChangeMock).toHaveBeenCalledWith(
      'newname',
      'oldname'
    );
  });

  it('does not invalidate caches when username is unchanged', async () => {
    const tx = createTx([
      [{ id: 'profile-1', usernameNormalized: 'samehandle' }],
    ]);

    withDbSessionTxMock.mockImplementation(async (operation, options) =>
      operation(tx, options.clerkUserId)
    );

    const { syncCanonicalUsernameFromApp } = await import(
      '@/lib/username/sync'
    );

    await syncCanonicalUsernameFromApp('clerk_1', 'samehandle');

    expect(invalidateUsernameChangeMock).not.toHaveBeenCalled();
  });

  it('syncs by profile user_id without a users.activeProfileId lookup', async () => {
    const tx = createTx([
      [{ id: 'profile-1', usernameNormalized: 'oldname' }],
      [],
    ]);

    withDbSessionTxMock.mockImplementation(async (operation, options) =>
      operation(tx, options.clerkUserId)
    );

    const { syncCanonicalUsernameFromApp } = await import(
      '@/lib/username/sync'
    );

    await expect(
      syncCanonicalUsernameFromApp(
        '7b4b948f-9720-4c5f-98da-8a7335015da9',
        'newname'
      )
    ).resolves.toBeUndefined();

    expect(invalidateUsernameChangeMock).toHaveBeenCalledWith(
      'newname',
      'oldname'
    );
  });

  it('does not throw User not found when the authenticated user has no profile yet', async () => {
    const tx = createTx([[]]);

    withDbSessionTxMock.mockImplementation(async (operation, options) =>
      operation(tx, options.clerkUserId)
    );

    const { syncCanonicalUsernameFromApp } = await import(
      '@/lib/username/sync'
    );

    await expect(
      syncCanonicalUsernameFromApp(
        '7b4b948f-9720-4c5f-98da-8a7335015da9',
        'newname'
      )
    ).resolves.toBeUndefined();

    expect(invalidateUsernameChangeMock).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });
});
