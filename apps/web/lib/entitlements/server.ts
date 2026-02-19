import 'server-only';

import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { getCachedAuth, getCachedCurrentUser } from '@/lib/auth/cached';
import { resolveClerkIdentity } from '@/lib/auth/clerk-identity';
import {
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
  canRemoveBranding: false,
  canExportContacts: false,
  canAccessAdvancedAnalytics: false,
  canFilterSelfFromAnalytics: false,
  canAccessAdPixels: false,
  canBeVerified: false,
  aiCanUseTools: false,
  analyticsRetentionDays: 7,
  contactsLimit: 100,
  smartLinksLimit: 5,
  aiDailyMessageLimit: 5,
};

/**
 * Error thrown when billing data cannot be retrieved for an authenticated user.
 * Callers should catch this and show a retry/error state rather than
 * silently defaulting to free-tier entitlements.
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
    // Billing lookup failed — throw so callers surface an error state
    // instead of silently revoking pro features for paying users.
    logger.warn('Billing lookup failed in entitlements (transient)', {
      userId,
      error: billing.error,
    });
    throw new BillingUnavailableError(userId, adminStatus, billing.error);
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

  // Determine plan from billing data
  // isPro in DB means they have an active subscription
  // dbPlan contains the actual plan type if available
  let plan: UserPlan = 'free';
  if (isPro) {
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
    ...ent.booleans,
    ...ent.limits,
  };
}
