import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionContext: vi.fn(),
  insert: vi.fn(),
  markHasBlocks: vi.fn(),
  markHasNoBlocks: vi.fn(),
  markVisitorAllowed: vi.fn(),
  revalidateTag: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and-clause'),
  eq: vi.fn(() => 'eq-clause'),
  inArray: vi.fn(() => 'in-array-clause'),
  isNull: vi.fn(() => 'is-null-clause'),
}));

vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: mocks.getSessionContext,
}));

vi.mock('@/lib/audience/public-profile-block', () => ({
  markProfileHasAudienceBlocks: mocks.markHasBlocks,
  markProfileHasNoAudienceBlocks: mocks.markHasNoBlocks,
  markProfileVisitorAllowed: mocks.markVisitorAllowed,
}));

vi.mock('@/lib/cache/tags', () => ({
  createAudienceDataTag: (profileId: string) => `audience:${profileId}`,
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mocks.insert,
    select: mocks.select,
    update: mocks.update,
  },
}));

vi.mock('@/lib/db/schema/analytics', () => ({
  audienceBlocks: {
    audienceMemberId: 'audienceBlocks.audienceMemberId',
    creatorProfileId: 'audienceBlocks.creatorProfileId',
    displayName: 'audienceBlocks.displayName',
    email: 'audienceBlocks.email',
    fingerprint: 'audienceBlocks.fingerprint',
    geoCity: 'audienceBlocks.geoCity',
    geoCountry: 'audienceBlocks.geoCountry',
    id: 'audienceBlocks.id',
    reason: 'audienceBlocks.reason',
    unblockedAt: 'audienceBlocks.unblockedAt',
  },
  audienceMembers: {
    creatorProfileId: 'audienceMembers.creatorProfileId',
    displayName: 'audienceMembers.displayName',
    email: 'audienceMembers.email',
    fingerprint: 'audienceMembers.fingerprint',
    geoCity: 'audienceMembers.geoCity',
    geoCountry: 'audienceMembers.geoCountry',
    id: 'audienceMembers.id',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'creatorProfiles.id',
    userId: 'creatorProfiles.userId',
    username: 'creatorProfiles.username',
  },
}));

import {
  blockAudienceMember,
  unblockAudienceMember,
} from '@/app/app/(shell)/dashboard/audience/block-actions';

function selectRows(rows: unknown[], withJoin = false) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const innerJoin = vi.fn(() => ({ where }));
  return {
    from: vi.fn(() => (withJoin ? { innerJoin } : { where })),
  };
}

function mockInsertResult(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  mocks.insert.mockReturnValue({ values });
}

function mockUnblockResult(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  mocks.update.mockReturnValue({ set });
}

describe('audience block actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionContext.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.markHasBlocks.mockResolvedValue(undefined);
    mocks.markHasNoBlocks.mockResolvedValue(undefined);
    mocks.markVisitorAllowed.mockResolvedValue(undefined);
  });

  it('repairs and awaits the exact visitor cache on an idempotent block', async () => {
    mocks.select.mockReturnValueOnce(
      selectRows(
        [
          {
            member: {
              audienceMemberId: 'member-1',
              creatorProfileId: 'profile-1',
              displayName: 'Listener',
              email: 'listener@example.com',
              fingerprint: 'fingerprint-1',
              geoCity: null,
              geoCountry: null,
              id: 'member-1',
            },
            profileId: 'profile-1',
            profileUsername: 'tim',
          },
        ],
        true
      )
    );
    mockInsertResult([]);

    let releaseCacheWrite: (() => void) | undefined;
    mocks.markHasBlocks.mockReturnValue(
      new Promise<void>(resolve => {
        releaseCacheWrite = resolve;
      })
    );

    let actionSettled = false;
    const action = blockAudienceMember('member-1').then(() => {
      actionSettled = true;
    });
    await vi.waitFor(() => {
      expect(mocks.markHasBlocks).toHaveBeenCalledWith('tim', 'fingerprint-1');
    });
    expect(actionSettled).toBe(false);

    releaseCacheWrite?.();
    await action;
    expect(actionSettled).toBe(true);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it('clears the exact visitor decision after the final unblock', async () => {
    mockUnblockResult([
      { fingerprint: 'fingerprint-1', profileId: 'profile-1' },
    ]);
    mocks.select
      .mockReturnValueOnce(selectRows([]))
      .mockReturnValueOnce(selectRows([{ username: 'tim' }]))
      .mockReturnValueOnce(selectRows([]));

    await unblockAudienceMember('block-1');

    expect(mocks.markHasNoBlocks).toHaveBeenCalledWith('tim', 'fingerprint-1');
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      'audience:profile-1',
      'max'
    );
  });

  it('keeps the profile hot while allowing one unblocked visitor', async () => {
    mockUnblockResult([
      { fingerprint: 'fingerprint-1', profileId: 'profile-1' },
    ]);
    mocks.select
      .mockReturnValueOnce(selectRows([]))
      .mockReturnValueOnce(selectRows([{ username: 'tim' }]))
      .mockReturnValueOnce(selectRows([{ id: 'another-block' }]));

    await unblockAudienceMember('block-1');

    expect(mocks.markHasBlocks).toHaveBeenCalledWith('tim');
    expect(mocks.markVisitorAllowed).toHaveBeenCalledWith(
      'tim',
      'fingerprint-1'
    );
  });
});
