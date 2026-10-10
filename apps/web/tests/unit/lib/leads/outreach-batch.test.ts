import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTransaction,
  mockDbSelect,
  mockDbUpdate,
  mockIsEmailSuppressed,
  mockPushLeadToInstantly,
  mockRecordLeadFunnelEvent,
  mockCaptureError,
  mockReadOutboundLedger,
} = vi.hoisted(() => ({
  mockReadOutboundLedger: vi.fn(),
  mockTransaction: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockIsEmailSuppressed: vi.fn(),
  mockPushLeadToInstantly: vi.fn(),
  mockRecordLeadFunnelEvent: vi.fn(),
  mockCaptureError: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    transaction: mockTransaction,
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema/leads', () => ({
  leads: { id: 'leads.id', contactEmail: 'leads.contactEmail' },
  leadPipelineSettings: { id: 'leadPipelineSettings.id' },
}));

vi.mock('@/lib/notifications/suppression', () => ({
  isEmailSuppressed: mockIsEmailSuppressed,
}));

vi.mock('@/lib/leads/instantly', () => ({
  pushLeadToInstantly: mockPushLeadToInstantly,
}));

vi.mock('@/lib/leads/funnel-events', () => ({
  recordLeadFunnelEvent: mockRecordLeadFunnelEvent,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/constants/domains', () => ({
  getAppUrl: (path: string) => `https://jov.ie${path}`,
}));

vi.mock('@/lib/outbound/ledger.server', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/outbound/ledger.server')>()),
  readOutboundLedger: mockReadOutboundLedger,
}));

import {
  draftOutboundCopy,
  outboundCopyEvidenceKey,
  outboundCopyRevision,
  outboundTargetEvidenceKey,
  outboundTargetRevision,
} from '@/lib/outbound/approval';
import { outboundTargetFromLead } from '@/lib/outbound/ledger.server';

const makeLead = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'lead-1',
  linktreeHandle: 'artist',
  displayName: 'Artist',
  contactEmail: 'artist@example.com',
  instagramHandle: null,
  creatorProfileId: 'profile-1',
  claimToken: 'claim-token-1',
  priorityScore: 10,
  ...overrides,
});

/** Ledger rows for Tim approving the lead and its default email copy. */
function approvedLedger(lead = makeLead()) {
  const target = outboundTargetFromLead(lead as never);
  const targetRevision = outboundTargetRevision(target);
  const copy = draftOutboundCopy({
    channel: 'email',
    displayName: target.displayName,
    claimUrl: target.claimUrl ?? '',
    dmCopy: null,
  });
  const revision = outboundCopyRevision(targetRevision, copy);
  const rows = [
    {
      evidenceKey: outboundTargetEvidenceKey(lead.id as string),
      evidenceRevision: targetRevision,
      decision: 'yes',
      snapshot: {},
      actorUserId: 'tim',
      createdAt: new Date('2026-10-04T00:00:00Z'),
    },
    {
      evidenceKey: outboundCopyEvidenceKey(lead.id as string),
      evidenceRevision: revision,
      decision: 'yes',
      snapshot: { targetRevision, ...copy },
      actorUserId: 'tim',
      createdAt: new Date('2026-10-04T00:01:00Z'),
    },
  ];
  return { ledger: new Map([[lead.id as string, rows]]), copy, revision };
}

describe('processOutreachBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadOutboundLedger.mockResolvedValue(approvedLedger().ledger);
    mockPushLeadToInstantly.mockResolvedValue('would-send-if-called');
    mockDbSelect.mockReturnValue({
      from: () => ({ where: () => Promise.resolve([{ total: 2 }]) }),
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['', false],
    ['true', false],
    ['true', true],
    ['1', true],
  ])(
    'blocks before claims with provider flag %s and bypass %s',
    async (flag, bypass) => {
      vi.stubEnv('FEATURE_INSTANTLY_OUTBOUND', flag);
      const { processOutreachBatch } = await import(
        '@/lib/leads/outreach-batch'
      );
      const result = await processOutreachBatch(100, {
        ignorePipelineEnabled: bypass,
      });

      expect(result).toMatchObject({
        attempted: 0,
        queued: 0,
        failed: 0,
        dismissed: 0,
        unapproved: 0,
        remainingPending: 2,
        policyBlocked: {
          decision: 'blocked',
          dispatchAllowed: false,
          retryable: false,
          queueDisposition: 'do_not_enqueue_or_retry',
          reason: 'audience_delivery_disabled',
        },
      });
      expect(mockDbSelect).toHaveBeenCalledTimes(1);
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(mockDbUpdate).not.toHaveBeenCalled();
      expect(mockReadOutboundLedger).not.toHaveBeenCalled();
      expect(mockIsEmailSuppressed).not.toHaveBeenCalled();
      expect(mockPushLeadToInstantly).not.toHaveBeenCalled();
      expect(mockRecordLeadFunnelEvent).not.toHaveBeenCalled();
    }
  );

  it('keeps repeated cron/manual triggers read-only', async () => {
    const { processOutreachBatch } = await import('@/lib/leads/outreach-batch');
    await processOutreachBatch(10);
    await processOutreachBatch(10, { ignorePipelineEnabled: true });
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockReadOutboundLedger).not.toHaveBeenCalled();
    expect(mockPushLeadToInstantly).not.toHaveBeenCalled();
    expect(mockRecordLeadFunnelEvent).not.toHaveBeenCalled();
  });

  it('does not report an empty successful queue when the read-only count fails', async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => Promise.reject(new Error('count unavailable')),
      }),
    });
    const { processOutreachBatch } = await import('@/lib/leads/outreach-batch');
    await expect(processOutreachBatch(10)).rejects.toThrow('count unavailable');
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockPushLeadToInstantly).not.toHaveBeenCalled();
  });
});
