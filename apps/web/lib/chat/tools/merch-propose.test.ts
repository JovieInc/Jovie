import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  whereMock: vi.fn(),
  limitMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock.mockImplementation(() => ({
      from: hoisted.fromMock.mockReturnValue({
        where: hoisted.whereMock.mockReturnValue({
          limit: hoisted.limitMock,
        }),
      }),
    })),
  },
}));

vi.mock('@/lib/db/schema/merch', () => ({
  merchCards: {
    id: 'id',
    title: 'title',
    status: 'status',
    retailPriceCents: 'retailPriceCents',
    primaryImageUrl: 'primaryImageUrl',
    creatorProfileId: 'creatorProfileId',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
}));

describe('proposeMerchAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns proposal details without writing status', async () => {
    hoisted.limitMock.mockResolvedValue([
      {
        id: 'card-1',
        title: 'Tour Tee',
        status: 'draft',
        retailPriceCents: 2500,
        primaryImageUrl: null,
      },
    ]);

    const { proposeMerchAction } = await import('./merch-propose');
    const result = await proposeMerchAction({
      action: 'publish',
      merchCardId: 'card-1',
      profileId: 'profile-1',
    });

    expect(result).toEqual({
      success: true,
      action: 'publish_merch',
      merchCardId: 'card-1',
      title: 'Tour Tee',
      currentStatus: 'draft',
      retailPrice: '$25.00',
      primaryImageUrl: null,
    });
  });

  it('proposes pause without writing status (JOV-3549)', async () => {
    hoisted.limitMock.mockResolvedValue([
      {
        id: 'card-2',
        title: 'Hoodie',
        status: 'live',
        retailPriceCents: 4500,
        primaryImageUrl: null,
      },
    ]);

    const { proposeMerchAction } = await import('./merch-propose');
    const result = await proposeMerchAction({
      action: 'pause',
      merchCardId: 'card-2',
      profileId: 'profile-1',
    });

    expect(result).toEqual({
      success: true,
      action: 'pause_merch',
      merchCardId: 'card-2',
      title: 'Hoodie',
      currentStatus: 'live',
      retailPrice: '$45.00',
      primaryImageUrl: null,
    });
  });

  it('returns not found when card is missing', async () => {
    hoisted.limitMock.mockResolvedValue([]);

    const { proposeMerchAction } = await import('./merch-propose');
    const result = await proposeMerchAction({
      action: 'archive',
      merchCardId: 'missing',
      profileId: 'profile-1',
    });

    expect(result).toEqual({ success: false, error: 'Merch card not found' });
  });
});
