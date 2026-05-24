import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatAccountContext } from '@/lib/chat/account-context';
import {
  buildAccountStatusPayload,
  createAccountChatTools,
} from '@/lib/chat/account-tools';
import { getEntitlements } from '@/lib/entitlements/registry';

const hoisted = vi.hoisted(() => ({
  createBillingPortalSessionMock: vi.fn(),
  getUserBillingInfoMock: vi.fn(),
}));

vi.mock('@/lib/stripe/client', () => ({
  createBillingPortalSession: hoisted.createBillingPortalSessionMock,
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  getUserBillingInfo: hoisted.getUserBillingInfoMock,
}));

function makeAccountContext(
  overrides: Partial<ChatAccountContext> = {}
): ChatAccountContext {
  const planLimits = getEntitlements('pro');
  return {
    email: 'tim@jov.ie',
    plan: 'pro',
    displayPlan: 'Pro',
    isPro: true,
    billingVerification: 'verified',
    planMismatch: null,
    usage: {
      dailyLimit: 100,
      used: 4,
      remaining: 96,
      resetAt: '2026-05-24T07:00:00.000Z',
      monthlyLimit: 3100,
      monthlyUsed: 4,
      monthlyRemaining: 3096,
      monthlyResetAt: '2026-06-01T00:00:00.000Z',
    },
    entitlements: {
      aiCanUseTools: true,
      canAccessMerchCreation: true,
      canGenerateAlbumArt: true,
      canAccessAdvancedAnalytics: true,
    },
    flags: { merchMvp: true },
    billing: {
      hasStripeCustomer: true,
      hasStripeSubscription: true,
    },
    merchAccess: {
      available: true,
      reason: 'available',
    },
    planLimits,
    userEntitlements: {
      userId: 'user_123',
      email: 'tim@jov.ie',
      isAuthenticated: true,
      isAdmin: false,
      plan: 'pro',
      isPro: true,
      hasAdvancedFeatures: false,
      isTrialing: false,
      trialEndsAt: null,
      trialDaysRemaining: null,
      billingVerification: 'verified',
      hasStripeCustomer: true,
      hasStripeSubscription: true,
      ...planLimits.booleans,
      ...planLimits.limits,
    },
    ...overrides,
  };
}

async function executeTool(
  toolConfig: unknown
): Promise<Record<string, unknown>> {
  const execute = (toolConfig as { execute?: (input: object) => unknown })
    .execute;
  if (!execute) {
    throw new Error('Expected executable tool');
  }
  return (await execute({})) as Record<string, unknown>;
}

describe('account chat tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns account status without raw Stripe identifiers', () => {
    const payload = buildAccountStatusPayload(makeAccountContext());

    expect(payload).toMatchObject({
      email: 'tim@jov.ie',
      plan: 'pro',
      displayPlan: 'Pro',
      billingVerification: 'verified',
      merchAccess: { available: true, reason: 'available' },
    });
    expect(JSON.stringify(payload)).not.toContain('cus_');
    expect(JSON.stringify(payload)).not.toContain('sub_');
  });

  it('returns usage when billing is verified', async () => {
    const tools = createAccountChatTools(makeAccountContext());

    await expect(executeTool(tools.showUsage)).resolves.toMatchObject({
      success: true,
      displayPlan: 'Pro',
      usage: {
        dailyLimit: 100,
        used: 4,
        remaining: 96,
      },
    });
  });

  it('returns billing settings when no Stripe customer exists', async () => {
    hoisted.getUserBillingInfoMock.mockResolvedValue({
      success: true,
      data: { stripeCustomerId: null },
    });
    const tools = createAccountChatTools(
      makeAccountContext({
        billing: {
          hasStripeCustomer: false,
          hasStripeSubscription: false,
        },
      })
    );

    await expect(executeTool(tools.openBillingPortal)).resolves.toMatchObject({
      success: true,
      action: 'open_url',
      url: expect.stringContaining('/settings/billing'),
    });
    expect(hoisted.createBillingPortalSessionMock).not.toHaveBeenCalled();
  });

  it('creates a billing portal handoff for accounts with a Stripe customer', async () => {
    hoisted.getUserBillingInfoMock.mockResolvedValue({
      success: true,
      data: { stripeCustomerId: 'cus_123' },
    });
    hoisted.createBillingPortalSessionMock.mockResolvedValue({
      url: 'https://billing.stripe.com/session/bps_123',
    });
    const tools = createAccountChatTools(makeAccountContext());

    await expect(executeTool(tools.openBillingPortal)).resolves.toMatchObject({
      success: true,
      action: 'open_url',
      url: 'https://billing.stripe.com/session/bps_123',
    });
    expect(hoisted.createBillingPortalSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cus_123' })
    );
  });

  it('returns a structured error when the portal handoff fails', async () => {
    hoisted.getUserBillingInfoMock.mockResolvedValue({
      success: true,
      data: { stripeCustomerId: 'cus_123' },
    });
    hoisted.createBillingPortalSessionMock.mockRejectedValue(
      new Error('stripe unavailable')
    );
    const tools = createAccountChatTools(makeAccountContext());

    await expect(executeTool(tools.openBillingPortal)).resolves.toMatchObject({
      success: false,
      billingVerification: 'unavailable',
      error: 'Billing portal is temporarily unavailable.',
    });
  });
});
