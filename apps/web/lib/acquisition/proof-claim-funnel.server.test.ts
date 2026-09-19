import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbSelect,
  mockGetCanonicalProfileViews,
  mockGetRedis,
  mockGetLeadAttributionCookie,
  mockRecordLeadFunnelEvent,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockGetCanonicalProfileViews: vi.fn(),
  mockGetRedis: vi.fn(),
  mockGetLeadAttributionCookie: vi.fn(),
  mockRecordLeadFunnelEvent: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/queries/analytics', () => ({
  getCanonicalProfileViews: mockGetCanonicalProfileViews,
}));

vi.mock('@/lib/redis', () => ({
  getRedis: mockGetRedis,
}));

vi.mock('@/lib/leads/funnel-events', () => ({
  getLeadAttributionCookie: mockGetLeadAttributionCookie,
  recordLeadFunnelEvent: mockRecordLeadFunnelEvent,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

import {
  getProofClaimFunnelReport,
  incrementProofClaimCounter,
  recordProofClaimFunnelEvent,
} from './proof-claim-funnel.server';

function createThenableSelect<T>(row: T) {
  const chain: {
    from: ReturnType<typeof vi.fn>;
    innerJoin: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    then: (resolve: (value: T[]) => unknown) => unknown;
  } = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    then: (resolve: (value: T[]) => unknown) => resolve([row]),
  };
  return chain;
}

describe('proof-claim funnel server persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCanonicalProfileViews.mockResolvedValue(0);
    mockGetLeadAttributionCookie.mockResolvedValue(null);
    mockRecordLeadFunnelEvent.mockResolvedValue(undefined);
  });

  it('increments the Redis counter and skips lead writes for proof_viewed', async () => {
    const incr = vi.fn().mockResolvedValue(4);
    mockGetRedis.mockReturnValue({ incr });

    await recordProofClaimFunnelEvent('proof_viewed', {
      profileHandle: 'tim',
    });

    expect(incr).toHaveBeenCalledWith('proof-claim:funnel:v1:proof_viewed');
    expect(mockGetLeadAttributionCookie).not.toHaveBeenCalled();
    expect(mockRecordLeadFunnelEvent).not.toHaveBeenCalled();
  });

  it('writes identified later-stage events when attribution exists', async () => {
    const incr = vi.fn().mockResolvedValue(2);
    mockGetRedis.mockReturnValue({ incr });
    mockGetLeadAttributionCookie.mockResolvedValue({
      leadId: 'lead_proof',
      campaignKey: 'proof-to-claim',
      variantKey: 'proof-to-claim:m1:v1',
      channel: 'web',
      provider: null,
    });

    await recordProofClaimFunnelEvent('claim_started', {
      destination: '/waitlist',
    });

    expect(incr).toHaveBeenCalledWith('proof-claim:funnel:v1:claim_started');
    expect(mockRecordLeadFunnelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead_proof',
        eventType: 'claim_started',
        campaignKey: 'proof-to-claim',
        variantKey: 'proof-to-claim:m1:v1',
      })
    );
  });

  it('returns conversion from the max of durable views and Redis counters', async () => {
    mockGetCanonicalProfileViews.mockResolvedValue(12);
    mockDbSelect.mockReturnValue(createThenableSelect({ count: 3 }));
    mockGetRedis.mockReturnValue({
      mget: vi.fn().mockResolvedValue([20, 5, 2, 1]),
    });

    const report = await getProofClaimFunnelReport();

    expect(mockGetCanonicalProfileViews).toHaveBeenCalledWith({
      handle: 'tim',
      start: undefined,
      end: undefined,
    });
    expect(report.campaignKey).toBe('proof-to-claim');
    expect(report.stages).toEqual({
      proofViewed: 20,
      claimStarted: 5,
      checkout: 3,
      activation: 3,
    });
    expect(report.rates).toEqual({
      viewToClaim: 5 / 20,
      claimToCheckout: 3 / 5,
      checkoutToActivation: 1,
    });
  });

  it('returns null from increment when Redis is unavailable', async () => {
    mockGetRedis.mockReturnValue(null);
    await expect(incrementProofClaimCounter('checkout')).resolves.toBeNull();
  });
});
