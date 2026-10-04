import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn(() => 'eq-clause'));
const mockRecordLeadFunnelEvent = vi.hoisted(() => vi.fn());
const mockReadOutboundLedger = vi.hoisted(() => vi.fn());

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

vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  getOvieOperatorEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  getSafeErrorMessage: () => 'safe-error',
}));

vi.mock('@/lib/leads/funnel-events', () => ({
  recordLeadFunnelEvent: mockRecordLeadFunnelEvent,
}));

vi.mock('@/lib/outbound/ledger.server', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/outbound/ledger.server')>()),
  readOutboundLedger: mockReadOutboundLedger,
}));

import { PATCH } from '@/app/api/admin/leads/[id]/dm-sent/route';
import {
  outboundCopyEvidenceKey,
  outboundCopyRevision,
  outboundTargetEvidenceKey,
  outboundTargetRevision,
} from '@/lib/outbound/approval';
import { outboundTargetFromLead } from '@/lib/outbound/ledger.server';

const LEAD = {
  id: 'lead-1',
  linktreeHandle: 'artist',
  displayName: 'Artist',
  contactEmail: null,
  instagramHandle: 'artist',
  creatorProfileId: 'profile-1',
  claimToken: 'tok',
};

function approvedDmLedger(body?: string) {
  const target = outboundTargetFromLead(LEAD);
  const targetRevision = outboundTargetRevision(target);
  const copy = {
    channel: 'dm' as const,
    subject: null,
    body: body ?? `Hey Artist, your page: ${target.claimUrl}`,
  };
  return new Map([
    [
      LEAD.id,
      [
        {
          evidenceKey: outboundCopyEvidenceKey(LEAD.id),
          evidenceRevision: outboundCopyRevision(targetRevision, copy),
          decision: 'yes',
          snapshot: { targetRevision, ...copy },
          actorUserId: 'tim',
          createdAt: new Date('2026-10-04T01:00:00Z'),
        },
        {
          evidenceKey: outboundTargetEvidenceKey(LEAD.id),
          evidenceRevision: targetRevision,
          decision: 'yes',
          snapshot: {},
          actorUserId: 'tim',
          createdAt: new Date('2026-10-04T00:59:00Z'),
        },
      ],
    ],
  ]);
}

describe('PATCH /api/admin/leads/[id]/dm-sent', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });
    mockReadOutboundLedger.mockResolvedValue(approvedDmLedger());
  });

  it('preserves the first contact timestamp when a lead is contacted again', async () => {
    const originalFirstContactedAt = new Date('2026-03-20T12:00:00.000Z');

    mockSelectLimit.mockResolvedValue([
      {
        ...LEAD,
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

  it('returns 404 when the lead does not exist', async () => {
    mockSelectLimit.mockResolvedValue([]);

    const response = await PATCH(new Request('http://localhost') as never, {
      params: Promise.resolve({ id: 'missing-lead' }),
    });

    expect(response.status).toBe(404);
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockRecordLeadFunnelEvent).not.toHaveBeenCalled();
  });

  it('refuses to record a DM Tim has not approved', async () => {
    mockSelectLimit.mockResolvedValue([{ ...LEAD, firstContactedAt: null }]);
    mockReadOutboundLedger.mockResolvedValue(new Map());

    const response = await PATCH(new Request('http://localhost') as never, {
      params: Promise.resolve({ id: 'lead-1' }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      reason: 'target_not_approved',
    });
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockRecordLeadFunnelEvent).not.toHaveBeenCalled();
  });

  it('refuses when the lead changed after Tim approved it', async () => {
    mockSelectLimit.mockResolvedValue([
      { ...LEAD, instagramHandle: 'someone-else', firstContactedAt: null },
    ]);

    const response = await PATCH(new Request('http://localhost') as never, {
      params: Promise.resolve({ id: 'lead-1' }),
    });

    expect(response.status).toBe(409);
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
