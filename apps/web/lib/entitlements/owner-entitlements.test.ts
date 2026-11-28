import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  billing: vi.fn(),
  session: vi.fn(),
  admin: vi.fn(),
  mfa: vi.fn(),
}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mocks.session,
  getCachedCurrentUser: mocks.session,
}));
vi.mock('@/lib/admin/roles', () => ({ isAdmin: mocks.admin }));
vi.mock('@/lib/admin/mfa', () => ({
  hasRecentAdminMfaReverification: mocks.mfa,
}));
vi.mock('@/lib/stripe/customer-sync', () => ({
  getUserBillingInfo: mocks.session,
  getUserBillingInfoByAppId: mocks.billing,
}));
vi.mock('@/lib/observability/revenue-spine', () => ({
  captureRevenueSpineFailure: vi.fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/stripe/config', () => ({ isLegacyFanSendPrice: () => false }));

import { getAppUserEntitlements } from './server';

const actor = '00000000-0000-4000-8000-000000000001';
describe('explicit application-user entitlements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T00:00:00.000Z'));
    mocks.session.mockImplementation(() => {
      throw new Error('Ambient session is forbidden');
    });
    mocks.billing.mockResolvedValue({
      success: true,
      data: {
        userId: actor,
        email: 'owner@example.com',
        isPro: true,
        isAdmin: true,
        plan: 'pro',
        stripePriceId: null,
        trialEndsAt: null,
        stripeCustomerId: 'customer',
        stripeSubscriptionId: 'subscription',
      },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('uses canonical paid entitlements without granting an API key an MFA admin session', async () => {
    const result = await getAppUserEntitlements(actor);
    expect(result).toMatchObject({
      userId: actor,
      isAuthenticated: true,
      isAdmin: false,
      plan: 'pro',
      billingVerification: 'verified',
    });
    expect(mocks.billing).toHaveBeenCalledWith(actor);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.mfa).not.toHaveBeenCalled();
  });
  it('retains the canonical unavailable versus free distinction', async () => {
    mocks.billing.mockResolvedValue({
      success: false,
      error: 'Failed to retrieve billing data',
    });
    expect(await getAppUserEntitlements(actor)).toMatchObject({
      billingVerification: 'unavailable',
      plan: 'free',
      isAdmin: false,
    });
    mocks.billing.mockResolvedValue({ success: true });
    expect(await getAppUserEntitlements(actor)).toMatchObject({
      billingVerification: 'missing_user',
      plan: 'free',
    });
  });
  it('uses the same trial normalization as the current-user resolver', async () => {
    mocks.billing.mockResolvedValue({
      success: true,
      data: {
        userId: actor,
        email: '',
        plan: 'trial',
        isPro: false,
        trialEndsAt: new Date('2026-11-28T00:00:00.000Z'),
        stripePriceId: null,
      },
    });
    expect(await getAppUserEntitlements(actor)).toMatchObject({
      plan: 'trial',
      isTrialing: true,
      billingVerification: 'verified',
    });
  });
});
