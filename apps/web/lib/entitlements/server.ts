import 'server-only';

import { hasRecentAdminMfaReverification } from '@/lib/admin/mfa';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { getCachedAuth, getCachedCurrentUser } from '@/lib/auth/cached';
import { resolveClerkIdentity } from '@/lib/auth/clerk-identity';
import {
  ENTITLEMENT_REGISTRY,
  getEntitlements,
  hasAdvancedFeatures,
  isProPlan,
} from '@/lib/entitlements/registry';
import { getUserBillingInfo } from '@/lib/stripe/customer-sync';
import { logger } from '@/lib/utils/logger';
import type {
  BillingPlanMismatch,
  BillingVerificationState,
  UserEntitlements,
  UserPlan,
} from '@/types';

const UNAUTHENTICATED_ENTITLEMENTS: UserEntitlements = {
  userId: null,
  email: null,
  isAuthenticated: false,
  isAdmin: false,
  plan: 'free',
  isPro: false,
  hasAdvancedFeatures: false,
  isTrialing: false,
  trialEndsAt: null,
  trialDaysRemaining: null,
  ...ENTITLEMENT_REGISTRY.free.booleans,
  ...ENTITLEMENT_REGISTRY.free.limits,
};

function buildFreeEntitlements(params: {
  userId: string | null;
  email: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  billingVerification?: BillingVerificationState;
}): UserEntitlements {
  return {
    ...UNAUTHENTICATED_ENTITLEMENTS,
    userId: params.userId,
    email: params.email,
    isAuthenticated: params.isAuthenticated,
    isAdmin: params.isAdmin,
    ...(params.billingVerification
      ? { billingVerification: params.billingVerification }
      : {}),
  };
}

/**
 * Error class retained for backwards compatibility.
 *
 * `getCurrentUserEntitlements` no longer throws this error -- it degrades
 * gracefully to free-tier entitlements when billing is unavailable.
 * Admin status is fetched independently (Redis-cached) and preserved.
 *
 * @deprecated No longer thrown in production. Will be removed in a future release.
 */
export class BillingUnavailableError extends Error {
  constructor(
    public readonly userId: string,
    public readonly isAdmin: boolean,
    cause?: string
  ) {
    super(`Billing data unavailable for user ${userId}: ${cause ?? 'unknown'}`);
    this.name = 'BillingUnavailableError';
  }
}

function isMissingBillingRecord(error?: string): boolean {
  return error === 'User not found';
}

function normalizeBillingPlan(params: {
  rawPlan: string | null | undefined;
  isPro: boolean;
  trialEndsAt: Date | null;
}): {
  plan: UserPlan;
  isTrialing: boolean;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  mismatch: BillingPlanMismatch | null;
} {
  const rawPlan =
    typeof params.rawPlan === 'string' && params.rawPlan.length > 0
      ? params.rawPlan
      : null;
  let isTrialing = false;
  let trialEndsAt: string | null = null;
  let trialDaysRemaining: number | null = null;

  if (rawPlan === 'trial' && params.trialEndsAt) {
    const now = new Date();
    const trialActive = params.trialEndsAt > now;
    if (trialActive) {
      isTrialing = true;
      trialEndsAt = params.trialEndsAt.toISOString();
      trialDaysRemaining = Math.max(
        0,
        Math.floor(
          (params.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        )
      );
      return {
        plan: 'trial',
        isTrialing,
        trialEndsAt,
        trialDaysRemaining,
        mismatch: null,
      };
    }
  }

  if (!params.isPro) {
    return {
      plan: 'free',
      isTrialing: false,
      trialEndsAt: null,
      trialDaysRemaining: null,
      mismatch: null,
    };
  }

  if (
    rawPlan === 'founding' ||
    rawPlan === 'pro' ||
    rawPlan === 'max' ||
    rawPlan === 'growth'
  ) {
    return {
      plan: rawPlan,
      isTrialing: false,
      trialEndsAt: null,
      trialDaysRemaining: null,
      mismatch: null,
    };
  }

  return {
    plan: 'pro',
    isTrialing: false,
    trialEndsAt: null,
    trialDaysRemaining: null,
    mismatch: {
      rawPlan,
      normalizedPlan: 'pro',
      reason: 'is_pro_true_with_non_paid_plan',
    },
  };
}

export async function getCurrentUserEntitlements(): Promise<UserEntitlements> {
  const authResult = await getCachedAuth();
  const { userId } = authResult;
  if (!userId) {
    return UNAUTHENTICATED_ENTITLEMENTS;
  }

  let clerkEmail: string | null = null;
  try {
    const clerkIdentity = resolveClerkIdentity(await getCachedCurrentUser());
    clerkEmail = clerkIdentity.email;
  } catch (error) {
    logger.error('Failed to load user identity for entitlements', {
      error,
    });
  }

  // Check admin status independently of billing using the dedicated admin
  // role check (Redis-cached, 60s TTL). This avoids losing admin status when
  // the billing query fails due to transient DB/connection issues.
  const [hasAdminRole, billing] = await Promise.all([
    checkAdminRole(userId),
    getUserBillingInfo(),
  ]);
  const adminStatus =
    hasAdminRole && hasRecentAdminMfaReverification(authResult);

  if (!billing.success) {
    if (isMissingBillingRecord(billing.error)) {
      return buildFreeEntitlements({
        userId,
        email: clerkEmail,
        isAuthenticated: true,
        isAdmin: adminStatus,
        billingVerification: 'missing_user',
      });
    }

    // Billing lookup failed (transient DB/connection error).
    // Degrade gracefully to free-tier entitlements instead of throwing.
    // This prevents unhandled BillingUnavailableError from crashing API
    // routes and dashboard pages. Pro users temporarily lose features
    // during the outage, but the app remains functional. The underlying
    // DB failure is already captured upstream in fetchUserBillingData.
    logger.warn('Billing lookup failed, degrading to free tier', {
      userId,
      error: billing.error,
    });
    return buildFreeEntitlements({
      userId,
      email: clerkEmail,
      isAuthenticated: true,
      isAdmin: adminStatus,
      billingVerification: 'unavailable',
    });
  }

  if (!billing.data) {
    // User exists in auth but not in billing DB — genuinely a new/free user.
    return buildFreeEntitlements({
      userId,
      email: clerkEmail,
      isAuthenticated: true,
      isAdmin: adminStatus,
      billingVerification: 'missing_user',
    });
  }

  const { email: emailFromDb, isPro, plan: dbPlan } = billing.data;
  const effectiveEmail = emailFromDb || clerkEmail;

  const rawTrialEndsAt = (billing.data as Record<string, unknown>)
    .trialEndsAt as Date | null;
  const normalized = normalizeBillingPlan({
    rawPlan: dbPlan,
    isPro,
    trialEndsAt: rawTrialEndsAt,
  });

  if (normalized.mismatch) {
    logger.warn('Billing plan mismatch normalized for entitlements', {
      userId,
      rawPlan: normalized.mismatch.rawPlan,
      normalizedPlan: normalized.mismatch.normalizedPlan,
      reason: normalized.mismatch.reason,
      hasStripeCustomer: Boolean(billing.data.stripeCustomerId),
      hasStripeSubscription: Boolean(billing.data.stripeSubscriptionId),
    });
  }

  const ent = getEntitlements(normalized.plan);

  return {
    userId,
    email: effectiveEmail,
    isAuthenticated: true,
    isAdmin: adminStatus,
    plan: normalized.plan,
    isPro: isProPlan(normalized.plan),
    hasAdvancedFeatures: hasAdvancedFeatures(normalized.plan),
    isTrialing: normalized.isTrialing,
    trialEndsAt: normalized.trialEndsAt,
    trialDaysRemaining: normalized.trialDaysRemaining,
    billingVerification: 'verified',
    ...(normalized.mismatch
      ? { billingPlanMismatch: normalized.mismatch }
      : {}),
    hasStripeCustomer: Boolean(billing.data.stripeCustomerId),
    hasStripeSubscription: Boolean(billing.data.stripeSubscriptionId),
    ...ent.booleans,
    ...ent.limits,
  };
}
