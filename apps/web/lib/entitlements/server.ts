import 'server-only';

import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { getCachedAuth, getCachedCurrentUser } from '@/lib/auth/cached';
import { resolveClerkIdentity } from '@/lib/auth/clerk-identity';
import {
  getPlanLimits,
  hasAdvancedFeatures,
  isProPlan,
} from '@/lib/stripe/config';
import { getUserBillingInfo } from '@/lib/stripe/customer-sync';
import type { UserEntitlements, UserPlan } from '@/types';

const FREE_ENTITLEMENTS: UserEntitlements = {
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
  analyticsRetentionDays: 7,
  contactsLimit: 100,
};

export async function getCurrentUserEntitlements(): Promise<UserEntitlements> {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return FREE_ENTITLEMENTS;
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

  if (!billing.success || !billing.data) {
    return {
      ...FREE_ENTITLEMENTS,
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

  const limits = getPlanLimits(plan);

  return {
    userId,
    email: effectiveEmail,
    isAuthenticated: true,
    isAdmin: adminStatus,
    plan,
    isPro: isProPlan(plan),
    hasAdvancedFeatures: hasAdvancedFeatures(plan),
    canRemoveBranding: limits.canRemoveBranding,
    canExportContacts: limits.canExportContacts,
    canAccessAdvancedAnalytics: limits.canAccessAdvancedAnalytics,
    canFilterSelfFromAnalytics: limits.canFilterSelfFromAnalytics,
    analyticsRetentionDays: limits.analyticsRetentionDays,
    contactsLimit: limits.contactsLimit,
  };
}
