import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getDashboardDataFresh: vi.fn(),
  getProfileSocialLinks: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardDataFresh: mocks.getDashboardDataFresh,
  getProfileSocialLinks: mocks.getProfileSocialLinks,
}));
vi.mock('@/lib/auth/session', () => ({
  requireAuth: mocks.requireAuth,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));

// The route module is imported after mocks so GET runs against them.
const { GET } = await import('./route');

const dashboardData = {
  selectedProfile: {
    id: 'profile_1',
    username: 'artist',
    stripeAccountId: 'acct_123',
    stripeOnboardingComplete: true,
    stripePayoutsEnabled: true,
    venmoHandle: null,
  },
  tippingStats: {
    tipClicks: 3,
    tipsSubmitted: 1,
    totalReceivedCents: 1200,
    monthReceivedCents: 500,
  },
};

describe('GET /api/dashboard/monetization-summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(undefined);
    mocks.getDashboardDataFresh.mockResolvedValue(dashboardData);
    mocks.getProfileSocialLinks.mockResolvedValue([]);
  });

  it('returns the monetization summary with Stripe Connect always enabled', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    const payload = await response.json();
    // Stripe Connect is no longer flag-gated: a connected, onboarded profile
    // is monetization-ready without any runtime override.
    expect(payload.paymentState).toBe('active');
  });

  it('treats a connected profile without payout readiness as setup_incomplete', async () => {
    mocks.getDashboardDataFresh.mockResolvedValue({
      ...dashboardData,
      selectedProfile: {
        ...dashboardData.selectedProfile,
        stripePayoutsEnabled: false,
      },
    });
    const payload = await (await GET()).json();
    expect(payload.paymentState).toBe('setup_incomplete');
  });

  it('reports an active payment state after tips are received', async () => {
    mocks.getDashboardDataFresh.mockResolvedValue({
      ...dashboardData,
      tippingStats: {
        ...dashboardData.tippingStats,
        tipsSubmitted: 2,
      },
    });
    const payload = await (await GET()).json();
    expect(payload.paymentState).toBe('active');
  });

  it('returns 401 when authentication fails', async () => {
    mocks.requireAuth.mockRejectedValue(new Error('Unauthorized'));
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('returns 500 and captures unexpected errors', async () => {
    mocks.getDashboardDataFresh.mockRejectedValue(new Error('db down'));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(mocks.captureError).toHaveBeenCalledWith(
      'Failed to fetch monetization summary',
      expect.any(Error),
      expect.objectContaining({ route: '/api/dashboard/monetization-summary' })
    );
  });
});
