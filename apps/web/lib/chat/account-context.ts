import 'server-only';

import { getEntitlements } from '@/lib/entitlements/registry';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { getAppFlagValue } from '@/lib/flags/server';
import { aiChatDailyPlanAwareLimiter } from '@/lib/rate-limit/limiters';
import type {
  BillingPlanMismatch,
  BillingVerificationState,
  UserEntitlements,
  UserPlan,
} from '@/types';

export interface ChatUsageContext {
  dailyLimit: number;
  used: number;
  remaining: number;
  resetAt: string | null;
  monthlyLimit: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  monthlyResetAt: string;
}

export interface ChatAccountContext {
  email: string | null;
  plan: UserPlan;
  displayPlan: string;
  isPro: boolean;
  billingVerification: BillingVerificationState;
  planMismatch: BillingPlanMismatch | null;
  usage: ChatUsageContext | null;
  entitlements: {
    aiCanUseTools: boolean;
    canAccessMerchCreation: boolean;
    canGenerateAlbumArt: boolean;
    canAccessAdvancedAnalytics: boolean;
  };
  flags: {
    merchMvp: boolean;
  };
  billing: {
    hasStripeCustomer: boolean;
    hasStripeSubscription: boolean;
  };
  merchAccess: {
    available: boolean;
    reason:
      | 'available'
      | 'billing_unavailable'
      | 'feature_flag_disabled'
      | 'plan_unavailable';
  };
  planLimits: ReturnType<typeof getEntitlements>;
  userEntitlements: UserEntitlements;
}

function formatResetAt(resetTime: number | undefined): string | null {
  if (typeof resetTime !== 'number' || !Number.isFinite(resetTime)) {
    return null;
  }
  return new Date(resetTime).toISOString();
}

function resolveMonthlyUsageWindow(now = new Date()): {
  daysInMonth: number;
  resetAt: string;
} {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const resetAt = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));

  return {
    daysInMonth,
    resetAt: resetAt.toISOString(),
  };
}

function resolveDisplayPlan(
  plan: UserPlan,
  billingVerification: BillingVerificationState
): string {
  if (billingVerification === 'unavailable') return 'Unverified';
  if (plan === 'trial') return 'Pro Trial';
  if (plan === 'max' || plan === 'growth') return 'Max';
  if (plan === 'founding' || plan === 'pro') return 'Pro';
  return 'Free';
}

function resolveUsage(
  userId: string,
  plan: UserPlan,
  dailyLimit: number,
  billingVerification: BillingVerificationState
): ChatUsageContext | null {
  if (billingVerification === 'unavailable') return null;

  const status = aiChatDailyPlanAwareLimiter.getStatus(userId, plan);
  const remaining = Math.max(0, Math.min(dailyLimit, status.remaining));
  const used = Math.max(0, dailyLimit - remaining);
  const monthlyWindow = resolveMonthlyUsageWindow();
  const monthlyLimit = dailyLimit * monthlyWindow.daysInMonth;
  const monthlyUsed = Math.min(used, monthlyLimit);

  return {
    dailyLimit,
    used,
    remaining,
    resetAt: formatResetAt(status.resetTime),
    monthlyLimit,
    monthlyUsed,
    monthlyRemaining: Math.max(0, monthlyLimit - monthlyUsed),
    monthlyResetAt: monthlyWindow.resetAt,
  };
}

function resolveMerchAccess(params: {
  billingVerification: BillingVerificationState;
  merchMvp: boolean;
  canAccessMerchCreation: boolean;
}): ChatAccountContext['merchAccess'] {
  if (params.billingVerification === 'unavailable') {
    return { available: false, reason: 'billing_unavailable' };
  }
  if (!params.canAccessMerchCreation) {
    return { available: false, reason: 'plan_unavailable' };
  }
  return { available: true, reason: 'available' };
}

export async function resolveChatAccountContext(params: {
  userId: string;
}): Promise<ChatAccountContext> {
  const [entitlements, merchMvp] = await Promise.all([
    getCurrentUserEntitlements(),
    getAppFlagValue('MERCH_MVP', { userId: params.userId }),
  ]);
  const billingVerification = entitlements.billingVerification ?? 'verified';
  const planLimits = getEntitlements(entitlements.plan);
  const usage = resolveUsage(
    params.userId,
    entitlements.plan,
    entitlements.aiDailyMessageLimit,
    billingVerification
  );
  const canAccessMerchCreation = Boolean(entitlements.canAccessMerchCreation);

  return {
    email: entitlements.email,
    plan: entitlements.plan,
    displayPlan: resolveDisplayPlan(entitlements.plan, billingVerification),
    isPro: entitlements.isPro,
    billingVerification,
    planMismatch: entitlements.billingPlanMismatch ?? null,
    usage,
    entitlements: {
      aiCanUseTools: entitlements.aiCanUseTools,
      canAccessMerchCreation,
      canGenerateAlbumArt: entitlements.canGenerateAlbumArt,
      canAccessAdvancedAnalytics: entitlements.canAccessAdvancedAnalytics,
    },
    flags: { merchMvp },
    billing: {
      hasStripeCustomer: Boolean(entitlements.hasStripeCustomer),
      hasStripeSubscription: Boolean(entitlements.hasStripeSubscription),
    },
    merchAccess: resolveMerchAccess({
      billingVerification,
      merchMvp,
      canAccessMerchCreation,
    }),
    planLimits,
    userEntitlements: entitlements,
  };
}
