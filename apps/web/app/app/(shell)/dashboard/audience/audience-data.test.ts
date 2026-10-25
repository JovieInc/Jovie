import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withDbSessionTx } from '@/lib/auth/session';
import { type DbSessionTx, getAudienceServerData } from './audience-data';

vi.mock('next/cache', () => ({
  unstable_cache: (callback: () => unknown) => callback,
}));
vi.mock('@/lib/auth/session', () => ({ withDbSessionTx: vi.fn() }));
vi.mock('@/lib/db', () => ({
  doesColumnExist: vi.fn().mockResolvedValue(true),
}));

describe('audience cached transaction identity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes the already authenticated app user ID without requesting auth inside the cache', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      as: vi.fn().mockReturnValue({}),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(withDbSessionTx).mockImplementation(operation =>
      operation(query as unknown as DbSessionTx, 'app-user-1')
    );
    const result = await getAudienceServerData({
      userId: 'app-user-1',
      selectedProfileId: 'profile-1',
      searchParams: {},
    });
    expect(withDbSessionTx).toHaveBeenCalledWith(expect.any(Function), {
      clerkUserId: 'app-user-1',
    });
    expect(result).toMatchObject({
      rows: [],
      view: 'all',
      hasMore: false,
      subscriberCount: null,
      totalAudienceCount: null,
    });
  });

  it('does not open a transaction when no profile is selected', async () => {
    const result = await getAudienceServerData({
      userId: 'app-user-1',
      selectedProfileId: null,
      searchParams: {},
    });
    expect(result.rows).toEqual([]);
    expect(withDbSessionTx).not.toHaveBeenCalled();
  });
});
