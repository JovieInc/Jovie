import type { ChatAccountContext } from '@/lib/chat/account-context';
import { getEntitlements } from '@/lib/entitlements/registry';

/** A resolved chat account context for /api/chat route tests. */
export function makeAccountContext(
  overrides: Partial<{
    plan: 'free' | 'pro' | 'max';
    billingVerification: 'verified' | 'unavailable';
    email: string;
  }> = {}
): ChatAccountContext {
  const billingVerification = overrides.billingVerification ?? 'verified';
  const plan =
    billingVerification === 'unavailable' ? 'free' : (overrides.plan ?? 'pro');
  const planLimits = getEntitlements(plan);
  const isPro = plan !== 'free';
  const merchAvailable = billingVerification === 'verified' && isPro;
  const displayPlan =
    billingVerification === 'unavailable'
      ? 'Unverified'
      : plan === 'max'
        ? 'Max'
        : plan === 'pro'
          ? 'Pro'
          : 'Free';
  return {
    email: overrides.email ?? 'artist@example.com',
    plan,
    displayPlan,
    isPro,
    billingVerification,
    planMismatch: null,
    usage: null,
    entitlements: {
      aiCanUseTools: planLimits.booleans.aiCanUseTools,
      canAccessMerchCreation: planLimits.booleans.canAccessMerchCreation,
      canGenerateAlbumArt: planLimits.booleans.canGenerateAlbumArt,
      canAccessAdvancedAnalytics:
        planLimits.booleans.canAccessAdvancedAnalytics,
    },
    flags: { merchMvp: false },
    billing: {
      hasStripeCustomer: isPro,
      hasStripeSubscription: isPro,
    },
    merchAccess: {
      available: merchAvailable,
      reason:
        billingVerification === 'unavailable'
          ? 'billing_unavailable'
          : merchAvailable
            ? 'available'
            : 'plan_unavailable',
    },
    planLimits,
    userEntitlements: {
      userId: 'user_123',
      email: 'artist@example.com',
      isAuthenticated: true,
      isAdmin: false,
      plan,
      isPro,
      hasAdvancedFeatures: false,
      isTrialing: false,
      trialEndsAt: null,
      trialDaysRemaining: null,
      billingVerification,
      hasStripeCustomer: isPro,
      hasStripeSubscription: isPro,
      ...planLimits.booleans,
      ...planLimits.limits,
    },
  };
}
