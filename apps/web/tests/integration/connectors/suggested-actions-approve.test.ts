/**
 * Integration tests for the suggested_actions approve/reject route handlers.
 *
 * Unlike the unit suite at
 * `apps/web/tests/unit/api/connectors/suggested-actions-approve-route.test.ts`
 * (which mocks the workflow-enqueue module), this file invokes the real
 * exported `POST` handlers end-to-end against mocked DB bindings:
 *
 * - `enqueueApprovedActionWorkflow` and `recoverOrphanedApprovedAction` run for
 *   real, so the persisted `workflowRuns` row — including the `stepOutputs`
 *   layout with `approvalId` + `eventPayload` — is verified, not re-asserted
 *   from a hand-written reimplementation.
 * - The full response contract is pinned: auth gate (401), success bodies,
 *   `Cache-Control: no-store` on every response, and the exact error shapes
 *   for 404 / 409 / 500.
 * - The concurrent-approve regression guard fires two real `POST` invocations
 *   and asserts exactly one `workflow_runs` insert.
 *
 * Flagged in PR #8813 (CodeRabbit comment id:3252956030); tracked as JOV-2280.
 */

import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — DB bindings record calls so tests can assert the exact rows
// the real handlers persist.
// ---------------------------------------------------------------------------

const {
  mockRequireAuth,
  mockRecordInboxDecision,
  mockCaptureError,
  mockLoggerError,
  dbMockState,
  mockDbUpdate,
  mockDbInsert,
  mockDbSelect,
} = vi.hoisted(() => {
  const dbMockState = {
    /** Resolved value for each successive `update(...).returning(...)` call. */
    updateReturningQueue: [] as unknown[],
    /** Resolved value for each successive `select(...)...limit(...)` call. */
    selectResultQueue: [] as unknown[],
    /** Every row passed to `insert(...).values(...)`, in call order. */
    insertedRows: [] as Record<string, unknown>[],
    /** Every value passed to `update(...).set(...)`, in call order. */
    updateSetCalls: [] as Record<string, unknown>[],
    /** When set, the next update `.returning()` rejects with this error. */
    updateError: null as Error | null,
    /** When set, the next insert `.returning()` rejects with this error. */
    insertError: null as Error | null,
  };

  const mockDbUpdate = vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => {
      dbMockState.updateSetCalls.push(values);
      return {
        where: vi.fn(() => ({
          returning: vi.fn(() => {
            if (dbMockState.updateError) {
              return Promise.reject(dbMockState.updateError);
            }
            return Promise.resolve(
              dbMockState.updateReturningQueue.shift() ?? []
            );
          }),
        })),
      };
    }),
  }));

  const mockDbInsert = vi.fn(() => ({
    values: vi.fn((row: Record<string, unknown>) => {
      dbMockState.insertedRows.push(row);
      return {
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(() => {
            if (dbMockState.insertError) {
              return Promise.reject(dbMockState.insertError);
            }
            return Promise.resolve([{ id: 'workflow-run-id' }]);
          }),
        })),
      };
    }),
  }));

  const mockDbSelect = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() =>
          Promise.resolve(dbMockState.selectResultQueue.shift() ?? [])
        ),
      })),
    })),
  }));

  return {
    mockRequireAuth: vi.fn(),
    mockRecordInboxDecision: vi.fn(),
    mockCaptureError: vi.fn(),
    mockLoggerError: vi.fn(),
    dbMockState,
    mockDbUpdate,
    mockDbInsert,
    mockDbSelect,
  };
});

// ---------------------------------------------------------------------------
// Module mocks (declared before the route imports)
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: mockRequireAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: mockDbUpdate,
    insert: mockDbInsert,
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/connectors/inbox-decision', () => ({
  recordInboxDecision: mockRecordInboxDecision,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

// revalidateTag throws an invariant error when called outside a Next.js
// request store; the CI integration setup does not stub it globally.
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: mockLoggerError,
  },
}));

// ---------------------------------------------------------------------------
// Import the real handlers after mocks are wired up
// ---------------------------------------------------------------------------

import { POST as approvePOST } from '@/app/api/connectors/suggested-actions/[id]/approve/route';
import { POST as rejectPOST } from '@/app/api/connectors/suggested-actions/[id]/reject/route';

const USER_ID = 'user-uuid-0000-0000-0000-000000000001';
const ACTION_ID = 'action-uuid-0000-0000-0000-000000000001';

const BOOKING_PAYLOAD = {
  title: 'Album release call',
  startsAt: '2026-08-01T18:00:00.000Z',
  endsAt: '2026-08-01T19:00:00.000Z',
  timeZone: 'America/Los_Angeles',
};

/** Row shape the approve CAS update returns (`.returning({ id, payload, kind, signalType })`). */
function casApprovedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ACTION_ID,
    payload: BOOKING_PAYLOAD,
    kind: 'calendar_booking',
    signalType: null,
    ...overrides,
  };
}

/** Row shape the orphan-recovery select returns (full action row). */
function approvedActionRow(overrides: Record<string, unknown> = {}) {
  return {
    ...casApprovedRow(),
    status: 'approved',
    userId: USER_ID,
    ...overrides,
  };
}

function makeRequest(path: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
        }),
  });
}

function makeApproveRequest() {
  return makeRequest(`/api/connectors/suggested-actions/${ACTION_ID}/approve`);
}

function makeRejectRequest(body?: unknown) {
  return makeRequest(
    `/api/connectors/suggested-actions/${ACTION_ID}/reject`,
    body
  );
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function expectNoStore(response: Response) {
  expect(response.headers.get('Cache-Control')).toBe('no-store');
}

// ---------------------------------------------------------------------------
// Approve route — real POST handler, real enqueue/recovery, mocked DB
// ---------------------------------------------------------------------------

describe('POST approve (real handler)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMockState.updateReturningQueue.length = 0;
    dbMockState.selectResultQueue.length = 0;
    dbMockState.insertedRows.length = 0;
    dbMockState.updateSetCalls.length = 0;
    dbMockState.updateError = null;
    dbMockState.insertError = null;
    mockRequireAuth.mockResolvedValue({ userId: USER_ID, error: null });
    mockRecordInboxDecision.mockResolvedValue({ id: 'feedback-1' });
  });

  it('returns 401 and touches no DB bindings when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({
      userId: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await approvePOST(
      makeApproveRequest(),
      makeParams(ACTION_ID)
    );

    expect(response.status).toBe(401);
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('first approve: 200 + no-store, CAS set shape, and workflow_runs row with stepOutputs.eventPayload', async () => {
    dbMockState.updateReturningQueue.push([casApprovedRow()]);

    const response = await approvePOST(
      makeApproveRequest(),
      makeParams(ACTION_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, approvalId: ACTION_ID });
    expectNoStore(response);

    // CAS transition written by the real handler.
    expect(dbMockState.updateSetCalls).toEqual([
      { status: 'approved', approvedAt: expect.any(Date) },
    ]);

    // The real enqueueApprovedActionWorkflow persisted exactly one run row.
    expect(dbMockState.insertedRows).toEqual([
      {
        kind: 'execute_approved_action',
        userId: USER_ID,
        status: 'queued',
        currentStep: 'create_calendar_event',
        stepOutputs: {
          approvalId: ACTION_ID,
          eventPayload: BOOKING_PAYLOAD,
        },
        runAt: expect.any(Date),
      },
    ]);

    expect(mockRecordInboxDecision).toHaveBeenCalledWith({
      suggestedActionId: ACTION_ID,
      userId: USER_ID,
      verdict: 'approved',
      cardKind: 'calendar_booking',
      surface: 'opportunity-inbox',
    });
  });

  it('persists stepOutputs.eventPayload as null when the action row has no payload', async () => {
    dbMockState.updateReturningQueue.push([casApprovedRow({ payload: null })]);

    const response = await approvePOST(
      makeApproveRequest(),
      makeParams(ACTION_ID)
    );

    expect(response.status).toBe(200);
    expect(dbMockState.insertedRows).toHaveLength(1);
    expect(dbMockState.insertedRows[0].stepOutputs).toEqual({
      approvalId: ACTION_ID,
      eventPayload: null,
    });
  });

  it('approves a social reply without routing it through the calendar executor', async () => {
    dbMockState.updateReturningQueue.push([
      casApprovedRow({
        kind: 'social.reply',
        signalType: 'fan_reply',
        payload: { targetId: 'comment-1', draftedText: 'Thank you.' },
      }),
    ]);

    const response = await approvePOST(
      makeApproveRequest(),
      makeParams(ACTION_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      approvalId: ACTION_ID,
      status: 'approved-awaiting-connector-execution',
    });
    expectNoStore(response);
    expect(dbMockState.insertedRows).toEqual([]);
    expect(mockRecordInboxDecision).toHaveBeenCalledWith({
      suggestedActionId: ACTION_ID,
      userId: USER_ID,
      verdict: 'approved',
      cardKind: 'social.reply',
      surface: 'opportunity-inbox',
    });
  });

  it('second approve after a completed first approve: recovery finds the run → 200 approved-pending-enqueue, no new insert', async () => {
    dbMockState.updateReturningQueue.push([]); // CAS missed
    dbMockState.selectResultQueue.push(
      [approvedActionRow()], // action exists, approved, owned by caller
      [{ id: 'existing-workflow-run-id' }] // workflow_runs row already present
    );

    const response = await approvePOST(
      makeApproveRequest(),
      makeParams(ACTION_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      approvalId: ACTION_ID,
      status: 'approved-pending-enqueue',
    });
    expectNoStore(response);
    expect(dbMockState.insertedRows).toHaveLength(0);
  });

  it('approve of an already-rejected action: 409 already-decided', async () => {
    dbMockState.updateReturningQueue.push([]); // CAS missed
    dbMockState.selectResultQueue.push([
      approvedActionRow({ status: 'rejected' }),
    ]);

    const response = await approvePOST(
      makeApproveRequest(),
      makeParams(ACTION_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({ error: 'already-decided' });
    expectNoStore(response);
    expect(dbMockState.insertedRows).toHaveLength(0);
  });

  it('approve of an unknown action id: 404 not-found', async () => {
    dbMockState.updateReturningQueue.push([]); // CAS missed
    dbMockState.selectResultQueue.push([]); // recovery select finds nothing

    const response = await approvePOST(
      makeApproveRequest(),
      makeParams(ACTION_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'not-found' });
    expectNoStore(response);
  });

  it('fails closed with 500 when the workflow_runs insert throws after CAS committed', async () => {
    dbMockState.updateReturningQueue.push([casApprovedRow()]);
    const insertError = new Error('workflow_runs insert failed');
    dbMockState.insertError = insertError;

    const response = await approvePOST(
      makeApproveRequest(),
      makeParams(ACTION_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'internal-error' });
    expectNoStore(response);
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[approve] Failed to approve suggested_action',
      insertError
    );
    expect(mockCaptureError).toHaveBeenCalledWith(
      'suggest-action approve failed',
      insertError,
      {
        route: '/api/connectors/suggested-actions/[id]/approve',
        approvalId: ACTION_ID,
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Concurrent approve — the core regression guard, now through the real handler
// ---------------------------------------------------------------------------

describe('concurrent approve (real handler): exactly one workflow_runs row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMockState.updateReturningQueue.length = 0;
    dbMockState.selectResultQueue.length = 0;
    dbMockState.insertedRows.length = 0;
    dbMockState.updateSetCalls.length = 0;
    dbMockState.updateError = null;
    dbMockState.insertError = null;
    mockRequireAuth.mockResolvedValue({ userId: USER_ID, error: null });
    mockRecordInboxDecision.mockResolvedValue({ id: 'feedback-1' });
  });

  it('two concurrent POSTs: one wins the CAS and inserts, the loser recovers as already-queued', async () => {
    // First CAS update wins, second misses. The loser's orphan recovery then
    // sees the approved action and the winner's existing workflow run.
    dbMockState.updateReturningQueue.push([casApprovedRow()], []);
    dbMockState.selectResultQueue.push(
      [approvedActionRow()],
      [{ id: 'workflow-run-id' }]
    );

    const [winner, loser] = await Promise.all([
      approvePOST(makeApproveRequest(), makeParams(ACTION_ID)),
      approvePOST(makeApproveRequest(), makeParams(ACTION_ID)),
    ]);

    // Both callers attempted the CAS transition.
    expect(mockDbUpdate).toHaveBeenCalledTimes(2);

    // Winner: direct approve. Loser: recovered, idempotent 200.
    expect(winner.status).toBe(200);
    expect(await winner.json()).toEqual({ ok: true, approvalId: ACTION_ID });
    expect(loser.status).toBe(200);
    expect(await loser.json()).toEqual({
      ok: true,
      approvalId: ACTION_ID,
      status: 'approved-pending-enqueue',
    });

    // Exactly one workflow_runs row was inserted across both requests.
    expect(dbMockState.insertedRows).toHaveLength(1);
    expect(dbMockState.insertedRows[0].stepOutputs).toEqual({
      approvalId: ACTION_ID,
      eventPayload: BOOKING_PAYLOAD,
    });
  });
});

// ---------------------------------------------------------------------------
// Reject route — real POST handler
// ---------------------------------------------------------------------------

describe('POST reject (real handler)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMockState.updateReturningQueue.length = 0;
    dbMockState.selectResultQueue.length = 0;
    dbMockState.insertedRows.length = 0;
    dbMockState.updateSetCalls.length = 0;
    dbMockState.updateError = null;
    dbMockState.insertError = null;
    mockRequireAuth.mockResolvedValue({ userId: USER_ID, error: null });
    mockRecordInboxDecision.mockResolvedValue({ id: 'feedback-1' });
  });

  it('returns 401 and touches no DB bindings when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({
      userId: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await rejectPOST(
      makeRejectRequest(),
      makeParams(ACTION_ID)
    );

    expect(response.status).toBe(401);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('first reject: 200 + no-store, rejected CAS transition, no workflow_runs insert', async () => {
    dbMockState.updateReturningQueue.push([
      { id: ACTION_ID, kind: 'calendar_booking' },
    ]);

    const response = await rejectPOST(
      makeRejectRequest({ reason: 'not relevant to me' }),
      makeParams(ACTION_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, approvalId: ACTION_ID });
    expectNoStore(response);

    // Real handler wrote the rejected transition; reject never enqueues work.
    expect(dbMockState.updateSetCalls).toEqual([{ status: 'rejected' }]);
    expect(dbMockState.insertedRows).toHaveLength(0);

    expect(mockRecordInboxDecision).toHaveBeenCalledWith({
      suggestedActionId: ACTION_ID,
      userId: USER_ID,
      verdict: 'rejected',
      reason: 'not relevant to me',
      cardKind: 'calendar_booking',
      surface: 'opportunity-inbox',
    });
  });

  it('reject without a JSON body still succeeds', async () => {
    dbMockState.updateReturningQueue.push([
      { id: ACTION_ID, kind: 'calendar_booking' },
    ]);

    const response = await rejectPOST(
      makeRejectRequest(),
      makeParams(ACTION_ID)
    );

    expect(response.status).toBe(200);
    expect(mockRecordInboxDecision).toHaveBeenCalledWith(
      expect.objectContaining({ verdict: 'rejected', reason: null })
    );
  });

  it('second reject: 409 already-decided', async () => {
    dbMockState.updateReturningQueue.push([]); // CAS missed

    const response = await rejectPOST(
      makeRejectRequest(),
      makeParams(ACTION_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({ error: 'already-decided' });
    expectNoStore(response);
    expect(mockRecordInboxDecision).not.toHaveBeenCalled();
  });
});
