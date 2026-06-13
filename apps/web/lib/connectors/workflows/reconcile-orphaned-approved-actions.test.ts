import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
  };
  return { db: mockDb };
});

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { db } from '@/lib/db';
import {
  reconcileOrphanedAcceptedActions,
  recoverOrphanedApprovedAction,
} from './reconcile-orphaned-approved-actions';

const USER_ID = 'user-uuid-0000-0000-0000-000000000001';
const ACTION_ID = 'action-uuid-0000-0000-0000-000000000001';

function mockSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  vi.mocked(db.select).mockReturnValue(
    chain as unknown as ReturnType<typeof db.select>
  );
  return chain;
}

function mockInsertChain(rows = [{ id: 'workflow-run-id' }]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  vi.mocked(db.insert).mockReturnValue(
    chain as unknown as ReturnType<typeof db.insert>
  );
  return chain;
}

describe('recoverOrphanedApprovedAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not-found when the suggested action does not exist', async () => {
    mockSelectChain([]);

    await expect(
      recoverOrphanedApprovedAction({
        approvalId: ACTION_ID,
        userId: USER_ID,
      })
    ).resolves.toBe('not-found');
  });

  it('returns not-accepted when the action is not accepted for the user', async () => {
    mockSelectChain([
      {
        id: ACTION_ID,
        status: 'dismissed',
        userId: USER_ID,
        payload: {},
      },
    ]);

    await expect(
      recoverOrphanedApprovedAction({
        approvalId: ACTION_ID,
        userId: USER_ID,
      })
    ).resolves.toBe('not-accepted');
  });

  it('returns already-queued when a workflow run already exists', async () => {
    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      const rows =
        selectCall === 1
          ? [
              {
                id: ACTION_ID,
                status: 'accepted',
                userId: USER_ID,
                payload: { title: 'Show' },
              },
            ]
          : [{ id: 'existing-run' }];
      return {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(rows),
      } as unknown as ReturnType<typeof db.select>;
    });

    await expect(
      recoverOrphanedApprovedAction({
        approvalId: ACTION_ID,
        userId: USER_ID,
      })
    ).resolves.toBe('already-queued');

    expect(db.insert).not.toHaveBeenCalled();
  });

  it('enqueues a workflow run for accepted actions missing a run', async () => {
    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      const rows =
        selectCall === 1
          ? [
              {
                id: ACTION_ID,
                status: 'accepted',
                userId: USER_ID,
                payload: { title: 'Show' },
              },
            ]
          : [];
      return {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(rows),
      } as unknown as ReturnType<typeof db.select>;
    });
    const insertChain = mockInsertChain();

    await expect(
      recoverOrphanedApprovedAction({
        approvalId: ACTION_ID,
        userId: USER_ID,
      })
    ).resolves.toBe('enqueued');

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'execute_approved_action',
        userId: USER_ID,
        stepOutputs: {
          approvalId: ACTION_ID,
          eventPayload: { title: 'Show' },
        },
      })
    );
    expect(insertChain.onConflictDoNothing).toHaveBeenCalledOnce();
  });

  it('returns already-queued when a concurrent enqueue wins the unique constraint', async () => {
    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      const rows =
        selectCall === 1
          ? [
              {
                id: ACTION_ID,
                status: 'accepted',
                userId: USER_ID,
                payload: { title: 'Show' },
              },
            ]
          : [];
      return {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(rows),
      } as unknown as ReturnType<typeof db.select>;
    });
    const insertChain = mockInsertChain([]);

    await expect(
      recoverOrphanedApprovedAction({
        approvalId: ACTION_ID,
        userId: USER_ID,
      })
    ).resolves.toBe('already-queued');

    expect(insertChain.onConflictDoNothing).toHaveBeenCalledOnce();
  });
});

describe('reconcileOrphanedAcceptedActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enqueues workflow runs for each orphaned accepted action', async () => {
    mockSelectChain([
      {
        id: ACTION_ID,
        userId: USER_ID,
        payload: { title: 'Show' },
      },
    ]);
    const insertChain = mockInsertChain();

    await expect(reconcileOrphanedAcceptedActions(20)).resolves.toEqual({
      scanned: 1,
      enqueued: 1,
    });

    expect(insertChain.values).toHaveBeenCalledOnce();
    expect(insertChain.onConflictDoNothing).toHaveBeenCalledOnce();
  });
});
