import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWithDbSessionTx = vi.hoisted(() => vi.fn());
const mockInvalidateUsernameChange = vi.hoisted(() => vi.fn());
const mockInvalidateHandleCache = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: mockWithDbSessionTx,
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateUsernameChange: mockInvalidateUsernameChange,
}));

vi.mock('@/lib/onboarding/handle-availability-cache', () => ({
  invalidateHandleCache: mockInvalidateHandleCache,
}));

describe('syncCanonicalUsernameFromApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvalidateUsernameChange.mockResolvedValue(undefined);
    mockInvalidateHandleCache.mockResolvedValue(undefined);
  });

  it('invalidates both old and new usernames after a rename', async () => {
    const selectCalls: unknown[] = [
      [{ id: 'user-1' }],
      [{ id: 'profile-1', usernameNormalized: 'oldname' }],
      [],
    ];

    const fakeTx = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(selectCalls.shift() ?? []),
          }),
        }),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };

    mockWithDbSessionTx.mockImplementation(async (operation: Function) =>
      operation(fakeTx, 'clerk-1')
    );

    const { syncCanonicalUsernameFromApp } = await import(
      '@/lib/username/sync'
    );

    await syncCanonicalUsernameFromApp('clerk-1', 'newname');

    expect(mockInvalidateUsernameChange).toHaveBeenCalledWith(
      'newname',
      'oldname'
    );
    expect(mockInvalidateHandleCache).toHaveBeenCalledWith('newname');
    expect(mockInvalidateHandleCache).toHaveBeenCalledWith('oldname');
  });
});
