import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PREMADE_ARTIST_PROFILE_EXPERIMENT_ID,
  captureAcquisitionRejection,
  rejectionEventDedupKey,
} from '@/lib/acquisition';

vi.mock('server-only', () => ({}));

const {
  mockRecordLeadFunnelEvent,
  mockDbSelect,
  mockDbUpdate,
  mockCaptureError,
} = vi.hoisted(() => ({
  mockRecordLeadFunnelEvent: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockCaptureError: vi.fn(),
}));

vi.mock('@/lib/leads/funnel-events', () => ({
  recordLeadFunnelEvent: mockRecordLeadFunnelEvent,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: vi.fn(),
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

function mockSelectResult(rows: unknown[]) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockDbSelect.mockReturnValue(chain);
  return chain;
}

describe('recordLeadRejectionEvent', () => {
  const qualityReject = captureAcquisitionRejection({
    candidateId: 'lead-9',
    experimentId: PREMADE_ARTIST_PROFILE_EXPERIMENT_ID,
    reason: 'quality_below_bar',
  });
  const gapReject = captureAcquisitionRejection({
    candidateId: 'lead-9',
    experimentId: PREMADE_ARTIST_PROFILE_EXPERIMENT_ID,
    reason: 'missing_product_capability',
    capability: 'claim page',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordLeadFunnelEvent.mockResolvedValue(undefined);
    mockDbUpdate.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    });
  });

  it('inserts the first rejection and stores the decision dedup key', async () => {
    mockSelectResult([]);
    const { recordLeadRejectionEvent } = await import(
      '@/lib/leads/rejection-event'
    );

    const result = await recordLeadRejectionEvent({
      leadId: 'lead-9',
      rejection: qualityReject,
    });

    expect(result).toEqual({
      action: 'insert',
      dedupKey: rejectionEventDedupKey(qualityReject),
    });
    expect(mockRecordLeadFunnelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-9',
        eventType: 'rejected',
        metadata: expect.objectContaining({
          dedupKey: rejectionEventDedupKey(qualityReject),
          rejection: qualityReject,
          productGapIssue: null,
          rebuildEligibleForAttempt: true,
        }),
      }),
      { idempotent: true }
    );
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('replays the same decision without writing another event', async () => {
    mockSelectResult([
      {
        id: 'event-1',
        metadata: {
          dedupKey: rejectionEventDedupKey(qualityReject),
          rejection: qualityReject,
        },
      },
    ]);
    const { recordLeadRejectionEvent } = await import(
      '@/lib/leads/rejection-event'
    );

    const result = await recordLeadRejectionEvent({
      leadId: 'lead-9',
      rejection: qualityReject,
    });

    expect(result.action).toBe('skip');
    expect(mockRecordLeadFunnelEvent).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('preserves a new reason after rebuild instead of dropping it on leadId + eventType', async () => {
    mockSelectResult([
      {
        id: 'event-1',
        metadata: {
          dedupKey: rejectionEventDedupKey(qualityReject),
          rejection: qualityReject,
        },
      },
    ]);
    const set = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    mockDbUpdate.mockReturnValue({ set });

    const { recordLeadRejectionEvent } = await import(
      '@/lib/leads/rejection-event'
    );

    const result = await recordLeadRejectionEvent({
      leadId: 'lead-9',
      rejection: gapReject,
    });

    expect(result.action).toBe('record-new-attempt');
    expect(result.dedupKey).toBe(rejectionEventDedupKey(gapReject));
    expect(result.dedupKey).not.toBe(rejectionEventDedupKey(qualityReject));
    expect(mockRecordLeadFunnelEvent).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          dedupKey: rejectionEventDedupKey(gapReject),
          rejection: gapReject,
          productGapIssue: expect.objectContaining({
            key: gapReject.productGapIssueKey,
          }),
          rebuildEligibleForAttempt: false,
        }),
      })
    );
  });

  it('treats a legacy rejection row without dedupKey as the same decision on replay', async () => {
    mockSelectResult([
      {
        id: 'event-legacy',
        metadata: { rejection: qualityReject },
      },
    ]);
    const { recordLeadRejectionEvent } = await import(
      '@/lib/leads/rejection-event'
    );

    const result = await recordLeadRejectionEvent({
      leadId: 'lead-9',
      rejection: qualityReject,
    });

    expect(result.action).toBe('skip');
    expect(mockRecordLeadFunnelEvent).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});
