import { beforeEach, describe, expect, it, vi } from 'vitest';

const withDbSessionTxMock = vi.hoisted(() => vi.fn());
const invalidateUsernameChangeMock = vi.hoisted(() => vi.fn());
const invalidateHandleCacheMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: withDbSessionTxMock,
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateUsernameChange: invalidateUsernameChangeMock,
}));

vi.mock('@/lib/onboarding/handle-availability-cache', () => ({
  invalidateHandleCache: invalidateHandleCacheMock,
}));

type SelectResult = Array<Record<string, unknown>>;

function createTx(selectResults: SelectResult[]) {
  const queue = [...selectResults];

  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => queue.shift() ?? []),
        })),
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
      [{ id: 'user-1' }],
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
    expect(invalidateHandleCacheMock).toHaveBeenCalledWith('newname');
    expect(invalidateHandleCacheMock).toHaveBeenCalledWith('oldname');
  });

  it('does not invalidate caches when username is unchanged', async () => {
    const tx = createTx([
      [{ id: 'user-1' }],
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
    expect(invalidateHandleCacheMock).not.toHaveBeenCalled();
  });
});
