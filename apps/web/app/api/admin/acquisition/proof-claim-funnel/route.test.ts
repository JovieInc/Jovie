import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReport, mockEntitlements } = vi.hoisted(() => ({
  mockReport: vi.fn(),
  mockEntitlements: vi.fn(),
}));

vi.mock('@/lib/acquisition/proof-claim-funnel.server', () => ({
  getProofClaimFunnelReport: mockReport,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockEntitlements,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  getSafeErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const { GET } = await import('./route');

describe('GET /api/admin/acquisition/proof-claim-funnel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReport.mockResolvedValue({
      campaignKey: 'proof-to-claim',
      variantKey: 'proof-to-claim:m1:v1',
      stages: {
        proofViewed: 10,
        claimStarted: 4,
        checkout: 2,
        activation: 1,
      },
      rates: {
        viewToClaim: 0.4,
        claimToCheckout: 0.5,
        checkoutToActivation: 0.5,
      },
    });
  });

  it('requires an authenticated admin', async () => {
    mockEntitlements.mockResolvedValue({
      isAuthenticated: false,
      isAdmin: false,
    });
    const unauthorized = await GET(
      new NextRequest('http://localhost/api/admin/acquisition/proof-claim-funnel')
    );
    expect(unauthorized.status).toBe(401);

    mockEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: false,
    });
    const forbidden = await GET(
      new NextRequest('http://localhost/api/admin/acquisition/proof-claim-funnel')
    );
    expect(forbidden.status).toBe(403);
    expect(mockReport).not.toHaveBeenCalled();
  });

  it('returns the queryable funnel report for admins', async () => {
    mockEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/admin/acquisition/proof-claim-funnel?start=2026-09-01'
      )
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      campaignKey: 'proof-to-claim',
      stages: { proofViewed: 10, activation: 1 },
    });
    expect(mockReport).toHaveBeenCalledWith({
      start: new Date('2026-09-01'),
    });
  });
});
