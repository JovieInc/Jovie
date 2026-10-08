import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    vi.stubEnv('FEATURE_INSTANTLY_OUTBOUND', 'true');
    // Disable quiet hours (equal start/end) so tests are time-independent.
    vi.stubEnv('OUTREACH_QUIET_HOURS_START_UTC', '0');
    vi.stubEnv('OUTREACH_QUIET_HOURS_END_UTC', '0');
    mockReadOutboundLedger.mockResolvedValue(approvedLedger().ledger);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('does not claim or push leads when Instantly outbound is off', async () => {
    vi.stubEnv('FEATURE_INSTANTLY_OUTBOUND', '');

    const { processOutreachBatch } = await import('@/lib/leads/outreach-batch');
    const result = await processOutreachBatch(10);

    expect(result).toEqual({
      attempted: 0,
      queued: 0,
      failed: 0,
      dismissed: 0,
      unapproved: 0,
      remainingPending: 0,
    });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockPushLeadToInstantly).not.toHaveBeenCalled();
  });

  it('does not claim or push leads during quiet hours', async () => {
    vi.stubEnv('OUTREACH_QUIET_HOURS_START_UTC', '1');
    vi.stubEnv('OUTREACH_QUIET_HOURS_END_UTC', '15');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T05:00:00Z'));

    const { processOutreachBatch } = await import('@/lib/leads/outreach-batch');
    const result = await processOutreachBatch(10);

    expect(result).toEqual({
      attempted: 0,
      queued: 0,
      failed: 0,
      dismissed: 0,
      unapproved: 0,
      remainingPending: 0,
    });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockPushLeadToInstantly).not.toHaveBeenCalled();
  });

  it('skips send for suppressed leads (Fix #1)', async () => {
    const lead = makeLead();
    // Claim phase: return one lead
    mockTransaction.mockResolvedValue([{ ...lead, claimedAt: new Date() }]);

    // Pipeline still enabled at send-phase re-check
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ enabled: true }]),
        }),
      }),
    });

    // Suppressed
    mockIsEmailSuppressed.mockResolvedValue({
      suppressed: true,
      reason: 'user_request',
    });

    // db.update().set().where() chain for marking dismissed + final remaining count
    const updateChain = {
      set: () => ({ where: () => Promise.resolve(undefined) }),
    };
    mockDbUpdate.mockReturnValue(updateChain);

    // remainingPending count
    const countChain = {
      from: () => ({
        where: () => Promise.resolve([{ total: 0 }]),
      }),
    };
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([{ enabled: true }]) }),
      }),
    });
    mockDbSelect.mockReturnValueOnce(countChain);

    const { processOutreachBatch } = await import('@/lib/leads/outreach-batch');
    const result = await processOutreachBatch(10);

    expect(mockIsEmailSuppressed).toHaveBeenCalledWith('artist@example.com');
    expect(mockPushLeadToInstantly).not.toHaveBeenCalled();
    expect(result.dismissed).toBe(1);
    expect(result.queued).toBe(0);
  });

  it('skips send and releases claim when pipeline is disabled mid-batch (Fix #3)', async () => {
    const lead = { ...makeLead(), claimedAt: new Date() };
    mockTransaction.mockResolvedValue([lead]);

    // First select = per-iteration enabled re-check → false (kill switch flipped).
    // Second select = remainingPending count at the end.
    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([{ enabled: false }]) }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([{ total: 0 }]),
        }),
      });

    mockDbUpdate.mockReturnValue({
      set: () => ({ where: () => Promise.resolve(undefined) }),
    });

    const { processOutreachBatch } = await import('@/lib/leads/outreach-batch');
    const result = await processOutreachBatch(10);

    expect(mockPushLeadToInstantly).not.toHaveBeenCalled();
    expect(mockIsEmailSuppressed).not.toHaveBeenCalled();
    expect(mockDbUpdate).toHaveBeenCalled(); // releaseClaim ran
    expect(result.attempted).toBe(0);
  });

  it('acquires advisory lock and short-circuits when another batch holds it (Fix #2)', async () => {
    // Simulate advisory lock rejected → transaction returns []
    mockTransaction.mockResolvedValue([]);

    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => Promise.resolve([{ total: 0 }]),
      }),
    });

    const { processOutreachBatch } = await import('@/lib/leads/outreach-batch');
    const result = await processOutreachBatch(10);

    expect(mockPushLeadToInstantly).not.toHaveBeenCalled();
    expect(result).toEqual({
      attempted: 0,
      queued: 0,
      failed: 0,
      dismissed: 0,
      unapproved: 0,
      remainingPending: 0,
    });
  });

  it('never pushes a lead Tim has not approved, and releases its claim', async () => {
    const lead = { ...makeLead(), claimedAt: new Date() };
    mockTransaction.mockResolvedValue([lead]);
    mockReadOutboundLedger.mockResolvedValue(new Map());
    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([{ enabled: true }]) }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve([{ total: 1 }]) }),
      });
    const set = vi.fn(() => ({ where: () => Promise.resolve(undefined) }));
    mockDbUpdate.mockReturnValue({ set });

    const { processOutreachBatch } = await import('@/lib/leads/outreach-batch');
    const result = await processOutreachBatch(10);

    expect(mockPushLeadToInstantly).not.toHaveBeenCalled();
    expect(mockIsEmailSuppressed).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ outreachQueuedAt: null })
    );
    expect(result.unapproved).toBe(1);
    expect(result.attempted).toBe(0);
  });

  it('refuses a lead whose email changed after Tim approved it', async () => {
    const approved = approvedLedger();
    const lead = {
      ...makeLead({ contactEmail: 'new@example.com' }),
      claimedAt: new Date(),
    };
    mockTransaction.mockResolvedValue([lead]);
    mockReadOutboundLedger.mockResolvedValue(approved.ledger);
    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([{ enabled: true }]) }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve([{ total: 1 }]) }),
      });
    mockDbUpdate.mockReturnValue({
      set: () => ({ where: () => Promise.resolve(undefined) }),
    });

    const { processOutreachBatch } = await import('@/lib/leads/outreach-batch');
    const result = await processOutreachBatch(10);

    expect(mockPushLeadToInstantly).not.toHaveBeenCalled();
    expect(result.unapproved).toBe(1);
  });

  it('sends exactly the approved copy revision', async () => {
    const approved = approvedLedger();
    const lead = { ...makeLead(), claimedAt: new Date() };
    mockTransaction.mockResolvedValue([lead]);
    mockIsEmailSuppressed.mockResolvedValue({ suppressed: false });
    mockPushLeadToInstantly.mockResolvedValue('instantly-1');
    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([{ enabled: true }]) }),
        }),
      })
      // duplicate-email check
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve([{ total: 0 }]) }),
      });
    mockDbUpdate.mockReturnValue({
      set: () => ({ where: () => Promise.resolve(undefined) }),
    });

    const { processOutreachBatch } = await import('@/lib/leads/outreach-batch');
    const result = await processOutreachBatch(10);

    expect(result.queued).toBe(1);
    expect(mockPushLeadToInstantly).toHaveBeenCalledWith(
      expect.objectContaining({
        approvedCopy: { ...approved.copy, revision: approved.revision },
      })
    );
  });

  it('gates the pending-email query on recorded outreach consent', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../../lib/leads/outreach-batch.ts'),
      'utf8'
    );
    expect(source).toMatch(/isNotNull\(leads\.outreachConsentAt\)/);
  });
});
