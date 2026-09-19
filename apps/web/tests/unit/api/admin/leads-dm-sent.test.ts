import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCompleteness = vi.hoisted(() => vi.fn());
vi.mock('@/lib/profile/completeness.server', () => ({
  loadProfileCompleteness: mockCompleteness,
}));

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn(() => 'eq-clause'));
const mockRecordLeadFunnelEvent = vi.hoisted(() => vi.fn());

const { mockDb, mockSelectLimit, mockUpdateSet, mockUpdateReturning } =
  vi.hoisted(() => {
    const mockSelectLimit = vi.fn();
    const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
    const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
    const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

    const mockUpdateReturning = vi.fn();
    const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }));
    const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
    const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

    return {
      mockDb: {
        select: mockSelect,
        update: mockUpdate,
      },
      mockSelectFrom,
      mockSelectWhere,
      mockSelectLimit,
      mockUpdate,
      mockUpdateSet,
      mockUpdateWhere,
      mockUpdateReturning,
    };
  });

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/db/schema/leads', () => ({
  leads: {
    id: 'id',
    firstContactedAt: 'first-contacted-at',
  },
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  getSafeErrorMessage: () => 'safe-error',
}));

vi.mock('@/lib/leads/funnel-events', () => ({
  recordLeadFunnelEvent: mockRecordLeadFunnelEvent,
}));

import { PATCH } from '@/app/api/admin/leads/[id]/dm-sent/route';

describe('PATCH /api/admin/leads/[id]/dm-sent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompleteness.mockResolvedValue(
      new Map([['profile-1', { eligible: true }]])
    );

    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });
  });

  it('preserves the first contact timestamp when a lead is contacted again', async () => {
    const originalFirstContactedAt = new Date('2026-03-20T12:00:00.000Z');

    mockSelectLimit.mockResolvedValue([
      {
        id: 'lead-1',
        creatorProfileId: 'profile-1',
        firstContactedAt: originalFirstContactedAt,
      },
    ]);
    mockUpdateReturning.mockResolvedValue([{ id: 'lead-1' }]);

    const response = await PATCH(new Request('http://localhost') as never, {
      params: Promise.resolve({ id: 'lead-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        firstContactedAt: originalFirstContactedAt,
      })
    );
    expect(mockRecordLeadFunnelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        eventType: 'dm_sent',
      }),
      { idempotent: true }
    );
  });

  it('rejects stale DM actions without recording a send', async () => {
    mockSelectLimit.mockResolvedValue([
      { id: 'lead-1', creatorProfileId: 'profile-1' },
    ]);
    mockCompleteness.mockResolvedValue(
      new Map([['profile-1', { eligible: false }]])
    );
    const response = await PATCH(new Request('http://localhost') as never, {
      params: Promise.resolve({ id: 'lead-1' }),
    });
    expect(response.status).toBe(409);
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockRecordLeadFunnelEvent).not.toHaveBeenCalled();
  });

  it('returns 404 when the lead does not exist', async () => {
    mockSelectLimit.mockResolvedValue([]);

    const response = await PATCH(new Request('http://localhost') as never, {
      params: Promise.resolve({ id: 'missing-lead' }),
    });

    expect(response.status).toBe(404);
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockRecordLeadFunnelEvent).not.toHaveBeenCalled();
  });
});
