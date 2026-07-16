/**
 * Real-handler tests for POST /api/connectors/suggested-actions/[id]/approve.
 *
 * The pre-existing integration test at
 * `apps/web/tests/integration/connectors/suggested-actions-approve.test.ts`
 * reimplements the CAS update/insert logic inline and asserts against its own
 * reimplementation — it never imports the route module, so it cannot catch a
 * divergence in the real handler. This file imports the real `POST` handler
 * and pins:
 *
 * - the exact `db.update(...).set(...).where(...).returning(...)` shape (CAS
 *   predicate: id + userId + status='pending')
 * - both branches of the CAS-miss orphan-recovery hand-off
 *   (`recoverOrphanedApprovedAction`), including the 404/409 outcomes
 * - the fail-closed 500 behavior when `enqueueApprovedActionWorkflow` throws
 *   after the CAS update has already committed (documented "silent
 *   inconsistency" window in the route's header comment)
 */

import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockRequireAuth,
  mockDbUpdate,
  mockDbUpdateSet,
  mockDbUpdateWhere,
  mockDbUpdateReturning,
  mockEnqueueApprovedActionWorkflow,
  mockRecoverOrphanedApprovedAction,
  mockRecordInboxDecision,
  mockCaptureError,
  mockLoggerInfo,
  mockLoggerError,
} = vi.hoisted(() => {
  const mockDbUpdateReturning = vi.fn();
  const mockDbUpdateWhere = vi.fn(() => ({ returning: mockDbUpdateReturning }));
  const mockDbUpdateSet = vi.fn(() => ({ where: mockDbUpdateWhere }));
  const mockDbUpdate = vi.fn(() => ({ set: mockDbUpdateSet }));

  return {
    mockRequireAuth: vi.fn(),
    mockDbUpdate,
    mockDbUpdateSet,
    mockDbUpdateWhere,
    mockDbUpdateReturning,
    mockEnqueueApprovedActionWorkflow: vi.fn(),
    mockRecoverOrphanedApprovedAction: vi.fn(),
    mockRecordInboxDecision: vi.fn(),
    mockCaptureError: vi.fn(),
    mockLoggerInfo: vi.fn(),
    mockLoggerError: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Module mocks (declared before the route import)
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: mockRequireAuth,
}));

vi.mock('@/lib/db', () => ({
  db: { update: mockDbUpdate },
}));

// Stub column tokens are opaque values — the route only ever forwards them
// into `eq(...)`, it never inspects their shape.
vi.mock('@/lib/db/schema/connectors', () => ({
  suggestedActions: {
    id: 'suggested_actions.id',
    userId: 'suggested_actions.userId',
    status: 'suggested_actions.status',
    payload: 'suggested_actions.payload',
    kind: 'suggested_actions.kind',
    approvedAt: 'suggested_actions.approvedAt',
  },
}));

// Real `and`/`eq` build a Drizzle SQL AST that's painful to assert on.
// Swap in transparent shape-preserving stand-ins so we can assert the exact
// CAS predicate the route builds without depending on drizzle-orm internals.
vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (column: unknown, value: unknown) => ({ __eq: [column, value] }),
}));

vi.mock('@/lib/connectors/inbox-decision', () => ({
  recordInboxDecision: mockRecordInboxDecision,
}));

vi.mock(
  '@/lib/connectors/workflows/reconcile-orphaned-approved-actions',
  () => ({
    enqueueApprovedActionWorkflow: mockEnqueueApprovedActionWorkflow,
    recoverOrphanedApprovedAction: mockRecoverOrphanedApprovedAction,
  })
);

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: vi.fn(),
    error: mockLoggerError,
  },
}));

// ---------------------------------------------------------------------------
// Import the real handler + mocked schema stub after mocks are wired up
// ---------------------------------------------------------------------------

import { POST } from '@/app/api/connectors/suggested-actions/[id]/approve/route';
import { suggestedActions } from '@/lib/db/schema/connectors';

const ACTION_ID = 'action-0000-0000-0000-000000000001';
const USER_ID = 'user-0000-0000-0000-000000000001';

const BOOKING_PAYLOAD = {
  title: 'Album release call',
  startsAt: '2026-08-01T18:00:00.000Z',
  endsAt: '2026-08-01T19:00:00.000Z',
  timeZone: 'America/Los_Angeles',
};

function makeRequest() {
  return new Request(
    'http://localhost/api/connectors/suggested-actions/action-id/approve',
    { method: 'POST' }
  );
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// Mirrors the vi.mock('drizzle-orm') stand-ins above so we can assert the
// exact CAS `.where(...)` argument the route constructs.
function eqShape(column: unknown, value: unknown) {
  return { __eq: [column, value] };
}
function andShape(...conditions: unknown[]) {
  return { __and: conditions };
}

const ROUTE_PATH = '/api/connectors/suggested-actions/[id]/approve';

describe('POST /api/connectors/suggested-actions/[id]/approve (real handler)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 and performs no db/workflow work when unauthenticated', async () => {
    const unauthorizedResponse = NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
    mockRequireAuth.mockResolvedValue({
      userId: null,
      error: unauthorizedResponse,
    });

    const response = await POST(makeRequest(), makeParams(ACTION_ID));

    expect(response.status).toBe(401);
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockRecoverOrphanedApprovedAction).not.toHaveBeenCalled();
    expect(mockEnqueueApprovedActionWorkflow).not.toHaveBeenCalled();
    expect(mockRecordInboxDecision).not.toHaveBeenCalled();
  });

  it('approves via CAS with the exact update/where/returning shape and enqueues the workflow', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID, error: null });
    mockDbUpdateReturning.mockResolvedValueOnce([
      { id: ACTION_ID, payload: BOOKING_PAYLOAD, kind: 'calendar_booking' },
    ]);
    mockEnqueueApprovedActionWorkflow.mockResolvedValueOnce('enqueued');
    mockRecordInboxDecision.mockResolvedValueOnce({ id: 'feedback-1' });

    const response = await POST(makeRequest(), makeParams(ACTION_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, approvalId: ACTION_ID });
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    // Exact CAS update shape: status transition + WHERE(id, userId, status='pending')
    expect(mockDbUpdate).toHaveBeenCalledWith(suggestedActions);
    expect(mockDbUpdateSet).toHaveBeenCalledWith({
      status: 'approved',
      approvedAt: expect.any(Date),
    });
    expect(mockDbUpdateWhere).toHaveBeenCalledWith(
      andShape(
        eqShape(suggestedActions.id, ACTION_ID),
        eqShape(suggestedActions.userId, USER_ID),
        eqShape(suggestedActions.status, 'pending')
      )
    );
    expect(mockDbUpdateReturning).toHaveBeenCalledWith({
      id: suggestedActions.id,
      payload: suggestedActions.payload,
      kind: suggestedActions.kind,
    });

    // Workflow enqueue gets the row's own payload, no second DB round-trip.
    expect(mockEnqueueApprovedActionWorkflow).toHaveBeenCalledWith({
      userId: USER_ID,
      approvalId: ACTION_ID,
      eventPayload: BOOKING_PAYLOAD,
    });

    // Taste writeback fires with the row's kind as cardKind.
    expect(mockRecordInboxDecision).toHaveBeenCalledWith({
      suggestedActionId: ACTION_ID,
      userId: USER_ID,
      verdict: 'approved',
      cardKind: 'calendar_booking',
      surface: 'opportunity-inbox',
    });

    // CAS hit — the orphan-recovery path must not run.
    expect(mockRecoverOrphanedApprovedAction).not.toHaveBeenCalled();
  });

  it('falls back to null cardKind when the CAS row has no kind', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID, error: null });
    mockDbUpdateReturning.mockResolvedValueOnce([
      { id: ACTION_ID, payload: null, kind: null },
    ]);
    mockEnqueueApprovedActionWorkflow.mockResolvedValueOnce('enqueued');

    await POST(makeRequest(), makeParams(ACTION_ID));

    expect(mockEnqueueApprovedActionWorkflow).toHaveBeenCalledWith({
      userId: USER_ID,
      approvalId: ACTION_ID,
      eventPayload: null,
    });
    expect(mockRecordInboxDecision).toHaveBeenCalledWith(
      expect.objectContaining({ cardKind: null })
    );
  });

  it('CAS miss + recovery "enqueued" -> 200 approved-recovered, no direct enqueue call', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID, error: null });
    mockDbUpdateReturning.mockResolvedValueOnce([]);
    mockRecoverOrphanedApprovedAction.mockResolvedValueOnce('enqueued');

    const response = await POST(makeRequest(), makeParams(ACTION_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      approvalId: ACTION_ID,
      status: 'approved-recovered',
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mockRecoverOrphanedApprovedAction).toHaveBeenCalledWith({
      approvalId: ACTION_ID,
      userId: USER_ID,
    });
    // Recovery owns enqueueing internally but currently does not perform taste
    // writeback. Leave that gap unspecified here so this suite does not freeze it.
    expect(mockEnqueueApprovedActionWorkflow).not.toHaveBeenCalled();
  });

  it('CAS miss + recovery "already-queued" -> 200 approved-pending-enqueue', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID, error: null });
    mockDbUpdateReturning.mockResolvedValueOnce([]);
    mockRecoverOrphanedApprovedAction.mockResolvedValueOnce('already-queued');

    const response = await POST(makeRequest(), makeParams(ACTION_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      approvalId: ACTION_ID,
      status: 'approved-pending-enqueue',
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mockEnqueueApprovedActionWorkflow).not.toHaveBeenCalled();
  });

  it('CAS miss + recovery "not-found" -> 404', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID, error: null });
    mockDbUpdateReturning.mockResolvedValueOnce([]);
    mockRecoverOrphanedApprovedAction.mockResolvedValueOnce('not-found');

    const response = await POST(makeRequest(), makeParams(ACTION_ID));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'not-found' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('CAS miss + recovery "not-accepted" -> 409 already-decided', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID, error: null });
    mockDbUpdateReturning.mockResolvedValueOnce([]);
    mockRecoverOrphanedApprovedAction.mockResolvedValueOnce('not-accepted');

    const response = await POST(makeRequest(), makeParams(ACTION_ID));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({ error: 'already-decided' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('fails closed with 500 when the workflow enqueue throws after CAS already committed', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID, error: null });
    mockDbUpdateReturning.mockResolvedValueOnce([
      { id: ACTION_ID, payload: BOOKING_PAYLOAD, kind: 'calendar_booking' },
    ]);
    const enqueueError = new Error('workflow_runs insert failed');
    mockEnqueueApprovedActionWorkflow.mockRejectedValueOnce(enqueueError);

    const response = await POST(makeRequest(), makeParams(ACTION_ID));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'internal-error' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[approve] Failed to approve suggested_action',
      enqueueError
    );
    expect(mockCaptureError).toHaveBeenCalledWith(
      'suggest-action approve failed',
      enqueueError,
      { route: ROUTE_PATH, approvalId: ACTION_ID }
    );
    // The CAS update already flipped status -> approved before this throw;
    // the row is left "approved" with no workflow_runs row and no feedback
    // event recorded for this request (documented in the route's header
    // comment as a retry/reconcile-recoverable window, not a client-visible
    // partial success).
    expect(mockRecordInboxDecision).not.toHaveBeenCalled();
  });

  it('fails closed with 500 when the CAS update itself throws', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID, error: null });
    const dbError = new Error('connection reset');
    mockDbUpdateReturning.mockRejectedValueOnce(dbError);

    const response = await POST(makeRequest(), makeParams(ACTION_ID));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'internal-error' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mockCaptureError).toHaveBeenCalledWith(
      'suggest-action approve failed',
      dbError,
      { route: ROUTE_PATH, approvalId: ACTION_ID }
    );
    expect(mockRecoverOrphanedApprovedAction).not.toHaveBeenCalled();
    expect(mockEnqueueApprovedActionWorkflow).not.toHaveBeenCalled();
  });
});
