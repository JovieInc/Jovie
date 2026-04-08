import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockCreateBillingPortalSession = vi.hoisted(() => vi.fn());
const mockGetUserBillingInfo = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/stripe/client', () => ({
  createBillingPortalSession: mockCreateBillingPortalSession,
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  getUserBillingInfo: mockGetUserBillingInfo,
}));

import { POST } from '@/app/api/stripe/portal/route';

describe('POST /api/stripe/portal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 400 when user has no Stripe customer ID', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        stripeCustomerId: null,
      },
    });

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe(
      'No billing account found. Upgrade to Pro to manage billing.'
    );
    expect(data.code).toBe('no_billing_account');
  });

  it('creates portal session for user with Stripe customer', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        stripeCustomerId: 'cus_123',
      },
    });
    mockCreateBillingPortalSession.mockResolvedValue({
      id: 'bps_123',
      url: 'https://billing.stripe.com/session/bps_123',
    });

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBeDefined();
  });
});
