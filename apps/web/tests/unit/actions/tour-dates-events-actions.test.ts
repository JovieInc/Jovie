import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetCachedAuth,
  mockGetDashboardData,
  mockDbUpdate,
  mockDbSelect,
  mockSelectFrom,
  mockSelectWhere,
  mockSet,
  mockWhere,
  mockRevalidateTag,
  mockTrackServerEvent,
  mockAnd,
  mockEq,
} = vi.hoisted(() => ({
  mockGetCachedAuth: vi.fn(),
  mockGetDashboardData: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbSelect: vi.fn(),
  mockSelectFrom: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockSet: vi.fn(),
  mockWhere: vi.fn(),
  mockRevalidateTag: vi.fn(),
  mockTrackServerEvent: vi.fn(),
  mockAnd: vi.fn((...args: unknown[]) => ({ _and: args })),
  mockEq: vi.fn((a: unknown, b: unknown) => ({ _eq: [a, b] })),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardData: mockGetDashboardData,
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: mockDbUpdate,
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema/tour', () => ({
  tourDates: {
    id: 'id',
    profileId: 'profile_id',
    confirmationStatus: 'confirmation_status',
  },
}));

vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: mockTrackServerEvent,
}));

vi.mock('next/cache', () => ({
  unstable_noStore: vi.fn(),
  revalidateTag: mockRevalidateTag,
}));

vi.mock('drizzle-orm', () => ({
  and: mockAnd,
  eq: mockEq,
  inArray: vi.fn((a: unknown, b: unknown) => ({ _inArray: [a, b] })),
}));

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_EVENT_ID = '550e8400-e29b-41d4-a716-446655440001';

function setupAuthenticatedUser() {
  mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
  mockGetDashboardData.mockResolvedValue({
    dashboardLoadError: null,
    needsOnboarding: false,
    selectedProfile: { id: 'prof_123' },
  });
}

function setupUpdateResult(result: { rowCount?: number | null }) {
  mockWhere.mockResolvedValue(result);
  mockSet.mockReturnValue({ where: mockWhere });
  mockDbUpdate.mockReturnValue({ set: mockSet });
}

function setupOwnedSelectResult(rows: Array<{ id: string }>) {
  mockSelectWhere.mockResolvedValue(rows);
  mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  mockDbSelect.mockReturnValue({ from: mockSelectFrom });
}

describe('event moderation server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthenticatedUser();
    setupUpdateResult({ rowCount: 1 });
  });

  it('rejects malformed event IDs before updating rows', async () => {
    const { confirmEvent } = await import(
      '@/app/app/(shell)/dashboard/tour-dates/events-actions'
    );

    const result = await confirmEvent('not-a-uuid');

    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });

  it('treats null rowCount as not found for single updates', async () => {
    setupUpdateResult({ rowCount: null });
    const { rejectEvent } = await import(
      '@/app/app/(shell)/dashboard/tour-dates/events-actions'
    );

    const result = await rejectEvent(EVENT_ID);

    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(mockDbUpdate).toHaveBeenCalledOnce();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });

  it('rejects malformed IDs in bulk requests before updating rows', async () => {
    const { rejectEvents } = await import(
      '@/app/app/(shell)/dashboard/tour-dates/events-actions'
    );

    const result = await rejectEvents([EVENT_ID, 'not-a-uuid']);

    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });

  it('refuses partial bulk updates pre-flight when ownership SELECT misses an id', async () => {
    // Pre-flight ownership SELECT returns only one of the two requested ids.
    setupOwnedSelectResult([{ id: EVENT_ID }]);
    const { confirmEvents } = await import(
      '@/app/app/(shell)/dashboard/tour-dates/events-actions'
    );

    const result = await confirmEvents([EVENT_ID, OTHER_EVENT_ID]);

    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });

  it('invalidates cache on a TOCTOU partial-write so client state cannot drift', async () => {
    // Ownership pre-flight passes for both ids, but a concurrent delete
    // means the actual UPDATE only touches one row.
    setupOwnedSelectResult([{ id: EVENT_ID }, { id: OTHER_EVENT_ID }]);
    setupUpdateResult({ rowCount: 1 });
    const { confirmEvents } = await import(
      '@/app/app/(shell)/dashboard/tour-dates/events-actions'
    );

    const result = await confirmEvents([EVENT_ID, OTHER_EVENT_ID]);

    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(mockDbUpdate).toHaveBeenCalledOnce();
    // Cache MUST flush so stale TanStack/Next caches do not show pre-action state.
    expect(mockRevalidateTag).toHaveBeenCalledWith(
      'tour-dates:user_123:prof_123',
      'max'
    );
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });

  it('invalidates cache and tracks analytics after a complete bulk update', async () => {
    setupOwnedSelectResult([{ id: EVENT_ID }, { id: OTHER_EVENT_ID }]);
    setupUpdateResult({ rowCount: 2 });
    const { confirmEvents } = await import(
      '@/app/app/(shell)/dashboard/tour-dates/events-actions'
    );

    const result = await confirmEvents([EVENT_ID, OTHER_EVENT_ID]);

    expect(result).toEqual({ ok: true, updated: 2, requested: 2 });
    expect(mockTrackServerEvent).toHaveBeenCalledWith('events_confirmed_bulk', {
      profileId: 'prof_123',
      requested: 2,
      updated: 2,
    });
    expect(mockRevalidateTag).toHaveBeenCalledWith(
      'tour-dates:user_123:prof_123',
      'max'
    );
  });

  it('undoRejectEvent stays scoped to profileId and only matches rejected rows', async () => {
    setupUpdateResult({ rowCount: 1 });
    const { undoRejectEvent } = await import(
      '@/app/app/(shell)/dashboard/tour-dates/events-actions'
    );

    const result = await undoRejectEvent(EVENT_ID);

    expect(result).toEqual({ ok: true });
    // The WHERE clause must include both the profileId scope AND the
    // confirmationStatus = 'rejected' guard so dropping either predicate
    // would change the recorded `eq` calls.
    const eqCalls = mockEq.mock.calls;
    const eqValues = eqCalls.map(args => args[1]);
    expect(eqValues).toContain('prof_123');
    expect(eqValues).toContain('rejected');
  });
});
