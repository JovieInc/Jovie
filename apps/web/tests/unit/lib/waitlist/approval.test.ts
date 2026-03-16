import { beforeEach, describe, expect, it, vi } from 'vitest';
import { approveWaitlistEntryInTx } from '@/lib/waitlist/approval';

type QueryResult = Array<Record<string, unknown>>;

function createTxMock(selectResults: QueryResult[]) {
  const selectQueue = [...selectResults];
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        for: vi.fn(() => ({
          limit: vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve((selectQueue.shift() ?? []) as QueryResult)
            ),
        })),
        limit: vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve((selectQueue.shift() ?? []) as QueryResult)
          ),
      })),
    })),
  }));

  return {
    tx: { select, update } as unknown as Parameters<
      typeof approveWaitlistEntryInTx
    >[0],
    updateSet,
  };
}

describe('approveWaitlistEntryInTx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unclaims an existing claimed profile for the same user before claiming the target profile', async () => {
    const { tx, updateSet } = createTxMock([
      [
        {
          id: 'entry-1',
          email: 'creator@example.com',
          fullName: 'Creator',
          status: 'new',
        },
      ],
      [{ id: 'target-profile' }],
      [{ id: 'user-1', clerkId: 'clerk_123' }],
      [{ id: 'old-profile' }],
    ]);

    const result = await approveWaitlistEntryInTx(tx, 'entry-1');

    expect(result).toEqual({
      outcome: 'approved',
      profileId: 'target-profile',
      email: 'creator@example.com',
      fullName: 'Creator',
      clerkId: 'clerk_123',
    });

    expect(updateSet).toHaveBeenCalledTimes(4);

    expect(updateSet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: null,
        isClaimed: false,
        onboardingCompletedAt: null,
      })
    );

    expect(updateSet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        userId: 'user-1',
        isClaimed: true,
        isPublic: true,
      })
    );
  });

  it('claims profile directly when user has no other claimed profile', async () => {
    const { tx, updateSet } = createTxMock([
      [
        {
          id: 'entry-1',
          email: 'creator@example.com',
          fullName: 'Creator',
          status: 'new',
        },
      ],
      [{ id: 'target-profile' }],
      [{ id: 'user-1', clerkId: 'clerk_123' }],
      [],
    ]);

    await approveWaitlistEntryInTx(tx, 'entry-1');

    expect(updateSet).toHaveBeenCalledTimes(3);
    expect(updateSet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: 'user-1',
        isClaimed: true,
      })
    );
  });
});
