import { describe, expect, it } from 'vitest';
import type { ChatAccountContext } from '@/lib/chat/account-context';
import {
  canUsePaidChatTools,
  resolveChatTurnPlanLimits,
} from '@/lib/chat/tool-access';
import { getEntitlements } from '@/lib/entitlements/registry';

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
    usage: null,
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

describe('chat tool gating', () => {
  it('enables the paid tool palette only for verified paid accounts', () => {
    expect(canUsePaidChatTools(makeAccountContext())).toBe(true);
    expect(
      canUsePaidChatTools(
        makeAccountContext({
          plan: 'free',
          displayPlan: 'Free',
          isPro: false,
        })
      )
    ).toBe(false);
    expect(
      canUsePaidChatTools(
        makeAccountContext({
          billingVerification: 'unavailable',
        })
      )
    ).toBe(false);
  });

  it('forces paid chat tools off for verified Free and billing-unavailable accounts', () => {
    expect(
      resolveChatTurnPlanLimits(makeAccountContext()).booleans.aiCanUseTools
    ).toBe(true);

    expect(
      resolveChatTurnPlanLimits(
        makeAccountContext({
          plan: 'free',
          displayPlan: 'Free',
          isPro: false,
        })
      ).booleans.aiCanUseTools
    ).toBe(false);

    expect(
      resolveChatTurnPlanLimits(
        makeAccountContext({
          billingVerification: 'unavailable',
        })
      ).booleans.aiCanUseTools
    ).toBe(false);
  });
});
