import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEntitlements } from '@/lib/entitlements/registry';
import { canRefreshYouTubeChannel } from './refresh-authority';

const { getCreator, select, where, limit } = vi.hoisted(() => ({
  getCreator: vi.fn(),
  select: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('@/lib/entitlements/creator-plan', () => ({
  getCreatorEntitlementsWithOwner: getCreator,
}));
vi.mock('@/lib/db', () => ({ db: { select } }));

const channel = { creatorProfileId: 'profile-1', channelId: 'channel-1' };

beforeEach(() => {
  vi.clearAllMocks();
  getCreator.mockResolvedValue({
    ownerUserId: 'owner-1',
    entitlements: {
      ...getEntitlements('pro'),
      booleans: {
        ...getEntitlements('pro').booleans,
        canAutoCreateLinks: true,
      },
    },
  });
  limit.mockResolvedValue([{ id: 'account-1' }]);
  where.mockReturnValue({ limit });
  select.mockReturnValue({ from: () => ({ where }) });
});

describe('scheduled YouTube authority', () => {
  it('requires a connected account belonging to this owner, profile and channel', async () => {
    expect(await canRefreshYouTubeChannel(channel)).toBe(true);
    const { PgDialect } = await import('drizzle-orm/pg-core');
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.params).toEqual([
      'owner-1',
      'profile-1',
      'youtube',
      'channel-1',
      'connected',
    ]);
  });

  it('connector presence never grants the paid capability', async () => {
    getCreator.mockResolvedValue({ entitlements: getEntitlements('pro') });
    expect(await canRefreshYouTubeChannel(channel)).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });

  it('denies an unclaimed profile', async () => {
    const paid = await getCreator();
    getCreator.mockResolvedValue({ ...paid, ownerUserId: null });
    expect(await canRefreshYouTubeChannel(channel)).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });

  it('re-reads a disconnected or replaced account instead of trusting earlier authority', async () => {
    expect(await canRefreshYouTubeChannel(channel)).toBe(true);
    limit.mockResolvedValue([]);
    expect(await canRefreshYouTubeChannel(channel)).toBe(false);
    expect(getCreator).toHaveBeenCalledTimes(2);
  });

  it('cannot proceed when authority storage fails', async () => {
    limit.mockRejectedValue(new Error('database unavailable'));
    await expect(canRefreshYouTubeChannel(channel)).rejects.toThrow(
      'database unavailable'
    );
  });
});
