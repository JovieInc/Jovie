import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReport, mockEntitlements } = vi.hoisted(() => ({
  mockReport: vi.fn(),
  mockEntitlements: vi.fn(),
}));

vi.mock('@/lib/acquisition/artist-offer-funnel.server', () => ({
  getArtistOfferFunnelReport: mockReport,
}));

vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  getOvieOperatorEntitlements: mockEntitlements,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  getSafeErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const { GET } = await import('./route');

describe('GET /api/admin/acquisition/artist-offer-funnel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReport.mockResolvedValue({
      schema: 'jovie-artist-offer-funnel/v1',
      entity: 'revenue-funnel',
      scope: 'consented_first_party_journeys',
      stages: [
        { stage: 'visit', journeys: 10 },
        { stage: 'paid', journeys: 1 },
      ],
    });
  });

  it('requires an authenticated admin', async () => {
    mockEntitlements.mockResolvedValue({
      isAuthenticated: false,
      isAdmin: false,
    });
    const unauthorized = await GET(
      new NextRequest(
        'http://localhost/api/admin/acquisition/artist-offer-funnel'
      )
    );
    expect(unauthorized.status).toBe(401);

    mockEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: false,
    });
    const forbidden = await GET(
      new NextRequest(
        'http://localhost/api/admin/acquisition/artist-offer-funnel'
      )
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
        'http://localhost/api/admin/acquisition/artist-offer-funnel?start=2026-09-01'
      )
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schema: 'jovie-artist-offer-funnel/v1',
      stages: [{ stage: 'visit', journeys: 10 }, { stage: 'paid' }],
    });
    expect(mockReport).toHaveBeenCalledWith({
      start: new Date('2026-09-01'),
    });
  });
});
