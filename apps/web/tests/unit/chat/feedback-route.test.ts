/**
 * /api/chat/feedback route tests.
 *
 * Covers auth, payload validation, ownership check, and the
 * supersession contract (current row marked superseded before insert).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks — used by the @/lib/db mock below + asserted on per-test.
const hoisted = vi.hoisted(() => {
  const usersSelectFirst = vi.fn();
  const traceSelectFirst = vi.fn();
  const supersedeUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const supersedeUpdateSet = vi
    .fn()
    .mockReturnValue({ where: supersedeUpdateWhere });
  const updateMock = vi.fn().mockReturnValue({ set: supersedeUpdateSet });

  const insertReturning = vi.fn().mockResolvedValue([{ id: 'fb-uuid' }]);
  const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
  const insertMock = vi.fn().mockReturnValue({ values: insertValues });

  // db.transaction(fn) resolves whatever the inner fn returns. We expose a
  // `tx` whose update/insert delegate to the same mocks.
  const txMock = {
    update: updateMock,
    insert: insertMock,
  };
  const transactionMock = vi.fn(async fn => fn(txMock));

  // Two separate `select` calls happen in the route — first for users,
  // second for trace lookup. We use a counter so each call returns the
  // right shape.
  let selectCallCount = 0;
  const selectMock = vi.fn(() => {
    const idx = selectCallCount++;
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(async () => {
            // First select = users, second = traces.
            return idx === 0
              ? await usersSelectFirst()
              : await traceSelectFirst();
          }),
        }),
      }),
    };
  });

  return {
    usersSelectFirst,
    traceSelectFirst,
    updateMock,
    supersedeUpdateSet,
    supersedeUpdateWhere,
    insertMock,
    insertValues,
    insertReturning,
    transactionMock,
    selectMock,
    resetCounter: () => {
      selectCallCount = 0;
    },
  };
});

let mockClerkUserId: string | null = 'clerk_user_1';

vi.mock('@/lib/auth/cached', () => ({
  getOptionalAuth: vi.fn(async () => ({ userId: mockClerkUserId })),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
    transaction: hoisted.transactionMock,
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  generalLimiter: {
    limit: vi.fn().mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: 0,
    }),
  },
  createRateLimitHeaders: vi.fn(() => ({})),
  getClientIP: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: vi.fn(async req => ({
    ok: true,
    data: await req.json(),
  })),
}));

// Schema imports referenced in route — provide stubs so the where/eq calls
// return objects that the mocked select chain can ignore.
vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'users.id', clerkId: 'users.clerkId' },
}));
vi.mock('@/lib/db/schema/chat-rag', () => ({
  chatAnswerFeedback: {
    traceId: 'fb.traceId',
    userId: 'fb.userId',
    supersededAt: 'fb.supersededAt',
    id: 'fb.id',
  },
  chatAnswerTraces: {
    traceId: 't.traceId',
    userId: 't.userId',
    messageId: 't.messageId',
  },
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ kind: 'eq', a, b })),
  and: vi.fn((...args) => ({ kind: 'and', args })),
  isNull: vi.fn(arg => ({ kind: 'isNull', arg })),
}));

const VALID_TRACE_ID = '11111111-2222-4333-8444-555555555555';

const VALID_BODY = {
  traceId: VALID_TRACE_ID,
  rating: 'down' as const,
  reason: 'wrong' as const,
  correction: 'The release date is wrong — should be 2026-04-15.',
};

function makeRequest(body: unknown): Request {
  return new Request('https://jov.ie/api/chat/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  hoisted.resetCounter();
  hoisted.usersSelectFirst
    .mockReset()
    .mockResolvedValue([{ id: 'user-uuid-1' }]);
  hoisted.traceSelectFirst
    .mockReset()
    .mockResolvedValue([{ userId: 'user-uuid-1', messageId: null }]);
  hoisted.updateMock.mockClear();
  hoisted.supersedeUpdateSet.mockClear();
  hoisted.supersedeUpdateWhere.mockClear();
  hoisted.insertMock.mockClear();
  hoisted.insertValues.mockClear();
  hoisted.insertReturning.mockClear().mockResolvedValue([{ id: 'fb-uuid' }]);
  hoisted.transactionMock.mockClear();
  mockClerkUserId = 'clerk_user_1';
});

describe('POST /api/chat/feedback', () => {
  it('returns 401 when unauthenticated', async () => {
    mockClerkUserId = null;
    const { POST } = await import('@/app/api/chat/feedback/route');
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid payload (missing traceId)', async () => {
    const { POST } = await import('@/app/api/chat/feedback/route');
    const res = await POST(makeRequest({ rating: 'up' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when reason is sent with up rating', async () => {
    const { POST } = await import('@/app/api/chat/feedback/route');
    const res = await POST(
      makeRequest({
        traceId: VALID_TRACE_ID,
        rating: 'up',
        reason: 'wrong',
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when traceId does not exist', async () => {
    hoisted.traceSelectFirst.mockResolvedValueOnce([]);
    const { POST } = await import('@/app/api/chat/feedback/route');
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('returns 403 when traceId belongs to a different user', async () => {
    hoisted.traceSelectFirst.mockResolvedValueOnce([
      { userId: 'someone-else', messageId: null },
    ]);
    const { POST } = await import('@/app/api/chat/feedback/route');
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it('on success: marks any current row superseded then inserts the new row', async () => {
    const { POST } = await import('@/app/api/chat/feedback/route');
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);

    // Update was called once to mark prior current rows as superseded.
    expect(hoisted.updateMock).toHaveBeenCalledTimes(1);
    const setArg = hoisted.supersedeUpdateSet.mock.calls[0][0] as {
      supersededAt: Date;
    };
    expect(setArg.supersededAt).toBeInstanceOf(Date);

    // Insert was called with the right shape.
    expect(hoisted.insertValues).toHaveBeenCalledTimes(1);
    const insertedValues = hoisted.insertValues.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(insertedValues.traceId).toBe(VALID_TRACE_ID);
    expect(insertedValues.rating).toBe('down');
    expect(insertedValues.reason).toBe('wrong');
    expect(insertedValues.correction).toBe(VALID_BODY.correction);
    expect(insertedValues.userId).toBe('user-uuid-1');
  });

  it('clears reason and correction on up ratings', async () => {
    const { POST } = await import('@/app/api/chat/feedback/route');
    const res = await POST(
      makeRequest({ traceId: VALID_TRACE_ID, rating: 'up' })
    );
    expect(res.status).toBe(201);

    const insertedValues = hoisted.insertValues.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(insertedValues.rating).toBe('up');
    expect(insertedValues.reason).toBeNull();
    expect(insertedValues.correction).toBeNull();
  });
});
