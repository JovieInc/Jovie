import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetCachedAuth,
  mockGetDashboardData,
  mockDbUpdate,
  mockSet,
  mockWhere,
  mockRevalidateTag,
  mockTrackServerEvent,
} = vi.hoisted(() => ({
  mockGetCachedAuth: vi.fn(),
  mockGetDashboardData: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockWhere: vi.fn(),
  mockRevalidateTag: vi.fn(),
  mockTrackServerEvent: vi.fn(),
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
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
  eq: vi.fn((a: unknown, b: unknown) => ({ _eq: [a, b] })),
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

  it('reports not found when a bulk update only updates part of the request', async () => {
    setupUpdateResult({ rowCount: 1 });
    const { confirmEvents } = await import(
      '@/app/app/(shell)/dashboard/tour-dates/events-actions'
    );

    const result = await confirmEvents([EVENT_ID, OTHER_EVENT_ID]);

    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(mockDbUpdate).toHaveBeenCalledOnce();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });

  it('invalidates cache and tracks analytics after a complete bulk update', async () => {
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
});
