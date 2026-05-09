import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markWaitlistSignedUpInTx } from '@/lib/waitlist/signup';

const mockInsertWaitlistAuditLog = vi.hoisted(() => vi.fn());
const mockEnqueueSignedUpWelcomeEmail = vi.hoisted(() => vi.fn());

vi.mock('@/lib/waitlist/audit', () => ({
  insertWaitlistAuditLog: mockInsertWaitlistAuditLog,
}));

vi.mock('@/lib/waitlist/email-jobs', () => ({
  enqueueSignedUpWelcomeEmail: mockEnqueueSignedUpWelcomeEmail,
}));

type Row = Record<string, unknown>;

function createTxMock(userRows: Row[], entryRows: Row[]) {
  const selectQueue = [userRows, entryRows];
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
              Promise.resolve(selectQueue.shift() ?? [])
            ),
        })),
      })),
    })),
  }));

  return {
    tx: {
      select,
      update,
    } as unknown as Parameters<typeof markWaitlistSignedUpInTx>[0],
    updateSet,
  };
}

describe('markWaitlistSignedUpInTx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails closed when a pending waitlist entry attempts onboarding completion', async () => {
    const { tx, updateSet } = createTxMock(
      [
        {
          id: 'user-1',
          email: 'creator@example.com',
          userStatus: 'waitlist_pending',
          waitlistEntryId: 'entry-1',
        },
      ],
      [{ id: 'entry-1', status: 'waitlisted' }]
    );

    await expect(markWaitlistSignedUpInTx(tx, 'clerk_123')).rejects.toThrow(
      'Approved waitlist access is required'
    );

    expect(updateSet).not.toHaveBeenCalled();
    expect(mockInsertWaitlistAuditLog).not.toHaveBeenCalled();
    expect(mockEnqueueSignedUpWelcomeEmail).not.toHaveBeenCalled();
  });

  it('marks an approved entry signed up and queues the welcome email', async () => {
    const { tx, updateSet } = createTxMock(
      [
        {
          id: 'user-1',
          email: 'creator@example.com',
          userStatus: 'waitlist_approved',
          waitlistEntryId: 'entry-1',
        },
      ],
      [{ id: 'entry-1', status: 'approved' }]
    );

    const result = await markWaitlistSignedUpInTx(tx, 'clerk_123');

    expect(result).toEqual({ entryId: 'entry-1' });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ userStatus: 'active' })
    );
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'signed_up' })
    );
    expect(mockInsertWaitlistAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        fromStatus: 'approved',
        toStatus: 'signed_up',
      })
    );
    expect(mockEnqueueSignedUpWelcomeEmail).toHaveBeenCalledWith(tx, 'entry-1');
  });
});
