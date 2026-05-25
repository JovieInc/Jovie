import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  doesColumnExistMock,
  fromMock,
  limitMock,
  selectMock,
  withRetryMock,
  whereMock,
} = vi.hoisted(() => {
  const limitMock = vi.fn();
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  return {
    doesColumnExistMock: vi.fn(),
    fromMock,
    limitMock,
    selectMock,
    withRetryMock: vi.fn(async (operation: () => Promise<unknown>) =>
      operation()
    ),
    whereMock,
  };
});

vi.mock('react', () => ({
  cache: (fn: unknown) => fn,
}));

vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => () => fn,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: selectMock,
  },
  doesColumnExist: doesColumnExistMock,
  withRetry: withRetryMock,
}));

describe('smart-link creator schema compatibility', () => {
  beforeEach(() => {
    vi.resetModules();
    doesColumnExistMock.mockReset();
    selectMock.mockClear();
    fromMock.mockClear();
    whereMock.mockClear();
    limitMock.mockReset();
  });

  it('does not select is_claimed when the column is absent', async () => {
    doesColumnExistMock.mockResolvedValue(false);
    limitMock.mockResolvedValue([
      {
        id: 'creator-1',
        userId: 'user-1',
        displayName: 'Dua Lipa',
        username: 'dualipa',
        usernameNormalized: 'dualipa',
        avatarUrl: null,
        settings: {},
      },
    ]);

    const { getCreatorByUsername } = await import(
      '@/app/[username]/[slug]/_lib/data'
    );

    await expect(getCreatorByUsername('dualipa')).resolves.toMatchObject({
      usernameNormalized: 'dualipa',
      isClaimed: true,
    });

    const selection = selectMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(selection)).not.toContain('isClaimed');
    expect(doesColumnExistMock).toHaveBeenCalledWith(
      'creator_profiles',
      'is_claimed'
    );
  });

  it('preserves is_claimed when the column exists', async () => {
    doesColumnExistMock.mockResolvedValue(true);
    limitMock.mockResolvedValue([
      {
        id: 'creator-1',
        userId: 'user-1',
        displayName: 'Dua Lipa',
        username: 'dualipa',
        usernameNormalized: 'dualipa',
        avatarUrl: null,
        settings: {},
        isClaimed: false,
      },
    ]);

    const { getCreatorByUsername } = await import(
      '@/app/[username]/[slug]/_lib/data'
    );

    await expect(getCreatorByUsername('dualipa')).resolves.toMatchObject({
      usernameNormalized: 'dualipa',
      isClaimed: false,
    });

    const selection = selectMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(selection)).toContain('isClaimed');
  });
});
