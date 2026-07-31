import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: dbMocks.select,
    insert: dbMocks.insert,
  },
}));

vi.mock('@/lib/db/schema/library', () => ({
  libraryAssetApprovalStatuses: {
    assetId: 'asset_id',
    approvalStatus: 'approval_status',
    creatorProfileId: 'creator_profile_id',
    itemKind: 'item_kind',
    profileVisibility: 'profile_visibility',
    updatedAt: 'updated_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_column, value) => ({ eq: value })),
}));

describe('Library profile visibility persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads approval and profile visibility as independent asset state', async () => {
    dbMocks.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            assetId: 'release-1',
            approvalStatus: 'approved',
            profileVisibility: 'hidden',
          },
          {
            assetId: 'merch-2',
            approvalStatus: 'draft',
            profileVisibility: 'visible',
          },
        ]),
      }),
    });

    const { getLibraryProfileStateMapForProfile } = await import(
      './profile-visibility.server'
    );
    const result = await getLibraryProfileStateMapForProfile('profile-1');

    expect(result).toEqual(
      new Map([
        [
          'release-1',
          { approvalStatus: 'approved', profileVisibility: 'hidden' },
        ],
        ['merch-2', { approvalStatus: 'draft', profileVisibility: 'visible' }],
      ])
    );
  });

  it('updates visibility without changing approval status', async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ profileVisibility: 'hidden' }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    dbMocks.insert.mockReturnValue({ values });

    const { upsertLibraryProfileVisibility } = await import(
      './profile-visibility.server'
    );
    const result = await upsertLibraryProfileVisibility({
      creatorProfileId: 'profile-1',
      assetId: 'release-1',
      itemKind: 'release',
      profileVisibility: 'hidden',
    });

    expect(result).toBe('hidden');
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.not.objectContaining({
          approvalStatus: expect.anything(),
        }),
      })
    );
  });
});
