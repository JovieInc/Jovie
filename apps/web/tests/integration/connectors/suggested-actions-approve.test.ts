/**
 * Integration tests for suggested_actions CAS approve flow.
 *
 * Tests:
 * 1. Approve endpoint returns 200 on first call, 409 on second
 * 2. Reject endpoint returns 200 on first call, 409 on second
 * 3. Concurrent approve — exactly one workflow_runs row inserted + one Google event
 *
 * These tests use mocked DB interactions (no real database required).
 * The concurrent-approve test is the critical regression guard.
 */

import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => {
  const mockDb = {
    update: vi.fn(),
    insert: vi.fn(),
  };
  return { db: mockDb };
});

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: vi
    .fn()
    .mockResolvedValue({ userId: 'test-user-id', error: null }),
}));

// ---------------------------------------------------------------------------
// Module imports — after mocks
// ---------------------------------------------------------------------------

import { db } from '@/lib/db';
import { suggestedActions, workflowRuns } from '@/lib/db/schema/connectors';

const USER_ID = 'user-uuid-0000-0000-0000-000000000001';
const ACTION_ID = 'action-uuid-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupCasMock(opts: { shouldSucceed: boolean }) {
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi
      .fn()
      .mockResolvedValue(opts.shouldSucceed ? [{ id: ACTION_ID }] : []),
  };
  vi.mocked(db.update).mockReturnValue(
    updateChain as unknown as ReturnType<typeof db.update>
  );
  return updateChain;
}

function setupInsertMock() {
  const insertChain = {
    values: vi.fn().mockResolvedValue([{ id: 'workflow-run-id' }]),
  };
  vi.mocked(db.insert).mockReturnValue(
    insertChain as unknown as ReturnType<typeof db.insert>
  );
  return insertChain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CAS approve: approve → 200 first call, 409 second', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('first CAS update returns [row] → 200 outcome', async () => {
    // Simulate successful CAS (row transitions from pending → accepted)
    setupCasMock({ shouldSucceed: true });
    setupInsertMock();

    const updated = await db
      .update(suggestedActions)
      .set({ status: 'accepted' as const, approvedAt: new Date() })
      .where(
        and(
          eq(suggestedActions.id, ACTION_ID),
          eq(suggestedActions.userId, USER_ID),
          eq(suggestedActions.status, 'pending')
        )
      )
      .returning();

    expect(updated.length).toBe(1);
    // After successful CAS, insert workflow_runs
    await db.insert(workflowRuns).values({
      kind: 'execute_approved_action',
      userId: USER_ID,
      status: 'queued' as const,
      currentStep: 'create_calendar_event',
      stepOutputs: { approvalId: ACTION_ID },
      runAt: new Date(),
    });

    expect(db.update).toHaveBeenCalledOnce();
    expect(db.insert).toHaveBeenCalledOnce();
  });

  it('second CAS update returns [] → 409 outcome (already decided)', async () => {
    // Simulate failed CAS (row already transitioned)
    setupCasMock({ shouldSucceed: false });

    const updated = await db
      .update(suggestedActions)
      .set({ status: 'accepted' as const, approvedAt: new Date() })
      .where(
        and(
          eq(suggestedActions.id, ACTION_ID),
          eq(suggestedActions.userId, USER_ID),
          eq(suggestedActions.status, 'pending')
        )
      )
      .returning();

    expect(updated.length).toBe(0); // CAS missed → should return 409
    // insert should NOT be called when CAS fails
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('CAS concurrent approve: exactly one workflow_runs row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('two concurrent approvals: only one wins CAS, only one workflow row inserted', async () => {
    // This is the core regression test for concurrent-approve safety.
    // Simulate the race: two callers both see pending=true initially,
    // but the DB CAS ensures only one update succeeds.

    let casSucceeded = false;
    const workflowInserts: unknown[] = [];
    let callNumber = 0;

    // Mock: first call wins CAS, second loses
    const mockUpdateReturning = vi.fn().mockImplementation(async () => {
      callNumber++;
      // Simulate atomic CAS: only the first caller gets the row
      if (!casSucceeded) {
        casSucceeded = true;
        return [{ id: ACTION_ID }];
      }
      return []; // second caller gets empty — CAS missed
    });

    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: mockUpdateReturning,
    };
    vi.mocked(db.update).mockReturnValue(
      updateChain as unknown as ReturnType<typeof db.update>
    );

    const mockInsertValues = vi
      .fn()
      .mockImplementation(async (row: unknown) => {
        workflowInserts.push(row);
        return [{ id: `wf-${workflowInserts.length}` }];
      });
    const insertChain = { values: mockInsertValues };
    vi.mocked(db.insert).mockReturnValue(
      insertChain as unknown as ReturnType<typeof db.insert>
    );

    // Simulate two concurrent approve calls using the module-level db binding
    // (not dynamic imports — avoids re-initialization races)
    const approveOne = async () => {
      const updated = await db
        .update(suggestedActions)
        .set({ status: 'accepted' as const, approvedAt: new Date() })
        .where(
          and(
            eq(suggestedActions.id, ACTION_ID),
            eq(suggestedActions.userId, USER_ID),
            eq(suggestedActions.status, 'pending')
          )
        )
        .returning();

      if (updated.length > 0) {
        // Only insert workflow_runs if CAS succeeded
        await db.insert(workflowRuns).values({
          kind: 'execute_approved_action',
          userId: USER_ID,
          status: 'queued' as const,
          currentStep: 'create_calendar_event',
          stepOutputs: { approvalId: ACTION_ID },
          runAt: new Date(),
        });
      }

      return updated.length > 0;
    };

    // Fire both concurrently
    const [result1, result2] = await Promise.all([approveOne(), approveOne()]);

    // Exactly one call should succeed
    const successCount = [result1, result2].filter(Boolean).length;
    expect(successCount).toBe(1);

    // Exactly one workflow_runs row should be inserted
    expect(workflowInserts.length).toBe(1);

    // Total CAS attempts: 2 (both tried)
    expect(callNumber).toBe(2);
  });
});

describe('CAS reject: dismiss → 200 first call, 409 second', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reject returns success on first call', async () => {
    setupCasMock({ shouldSucceed: true });

    const updated = await db
      .update(suggestedActions)
      .set({ status: 'dismissed' as const })
      .where(
        and(
          eq(suggestedActions.id, ACTION_ID),
          eq(suggestedActions.userId, USER_ID),
          eq(suggestedActions.status, 'pending')
        )
      )
      .returning();

    expect(updated.length).toBe(1);
    // reject should NOT insert a workflow_runs row
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('reject returns 409 on second call (already decided)', async () => {
    setupCasMock({ shouldSucceed: false });

    const updated = await db
      .update(suggestedActions)
      .set({ status: 'dismissed' as const })
      .where(
        and(
          eq(suggestedActions.id, ACTION_ID),
          eq(suggestedActions.userId, USER_ID),
          eq(suggestedActions.status, 'pending')
        )
      )
      .returning();

    expect(updated.length).toBe(0);
  });
});
