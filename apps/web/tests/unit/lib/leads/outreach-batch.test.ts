import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTransaction,
  mockDbSelect,
  mockDbUpdate,
  mockIsEmailSuppressed,
  mockPushLeadToInstantly,
  mockRecordLeadFunnelEvent,
  mockCaptureError,
} = vi.hoisted(() => ({
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

const makeLead = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'lead-1',
  linktreeHandle: 'artist',
  displayName: 'Artist',
  contactEmail: 'artist@example.com',
  claimToken: 'claim-token-1',
  priorityScore: 10,
  ...overrides,
});

describe('processOutreachBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      remainingPending: 0,
    });
  });
});
