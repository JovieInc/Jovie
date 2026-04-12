import 'server-only';

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
import type { UserEntitlements, UserPlan } from '@/types';

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

export async function getCurrentUserEntitlements(): Promise<UserEntitlements> {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return UNAUTHENTICATED_ENTITLEMENTS;
  }

  let clerkEmail: string | null = null;
  try {
    const clerkIdentity = resolveClerkIdentity(await getCachedCurrentUser());
    clerkEmail = clerkIdentity.email;
  } catch (error) {
    console.error('Failed to load Clerk user for entitlements', error);
  }

  // Check admin status independently of billing using the dedicated admin
  // role check (Redis-cached, 60s TTL). This avoids losing admin status when
  // the billing query fails due to transient DB/connection issues.
  const [adminStatus, billing] = await Promise.all([
    checkAdminRole(userId),
    getUserBillingInfo(),
  ]);

  if (!billing.success) {
    if (isMissingBillingRecord(billing.error)) {
      return {
        ...UNAUTHENTICATED_ENTITLEMENTS,
        userId,
        email: clerkEmail,
        isAuthenticated: true,
        isAdmin: adminStatus,
      };
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
    return {
      ...UNAUTHENTICATED_ENTITLEMENTS,
      userId,
      email: clerkEmail,
      isAuthenticated: true,
      isAdmin: adminStatus,
    };
  }

  if (!billing.data) {
    // User exists in auth but not in billing DB — genuinely a new/free user.
    return {
      ...UNAUTHENTICATED_ENTITLEMENTS,
      userId,
      email: clerkEmail,
      isAuthenticated: true,
      isAdmin: adminStatus,
    };
  }

  const { email: emailFromDb, isPro, plan: dbPlan } = billing.data;
  const effectiveEmail = emailFromDb || clerkEmail;

  // Determine plan from billing data.
  // Trial check comes BEFORE isPro gate because trial users have isPro=false
  // (no Stripe subscription yet) but need pro-level entitlements.
  let plan: UserPlan = 'free';
  let isTrialing = false;
  let trialEndsAt: string | null = null;
  let trialDaysRemaining: number | null = null;

  const rawTrialEndsAt = (billing.data as Record<string, unknown>)
    .trialEndsAt as Date | null;

  if (dbPlan === 'trial' && rawTrialEndsAt) {
    const now = new Date();
    const trialActive = rawTrialEndsAt > now;
    plan = trialActive ? 'trial' : 'free';
    isTrialing = trialActive;
    trialEndsAt = rawTrialEndsAt.toISOString();
    if (trialActive) {
      trialDaysRemaining = Math.max(
        0,
        Math.floor(
          (rawTrialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        )
      );
    }
  } else if (isPro) {
    plan = (dbPlan as UserPlan) || 'pro';
  }

  const ent = getEntitlements(plan);

  return {
    userId,
    email: effectiveEmail,
    isAuthenticated: true,
    isAdmin: adminStatus,
    plan,
    isPro: isProPlan(plan),
    hasAdvancedFeatures: hasAdvancedFeatures(plan),
    isTrialing,
    trialEndsAt,
    trialDaysRemaining,
    ...ent.booleans,
    ...ent.limits,
  };
}
