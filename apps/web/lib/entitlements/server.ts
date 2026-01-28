import 'server-only';

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
  analyticsRetentionDays: 7,
  contactsLimit: 100,
};

export async function getCurrentUserEntitlements(): Promise<UserEntitlements> {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return FREE_ENTITLEMENTS;
  }

  const clerkIdentity = resolveClerkIdentity(await getCachedCurrentUser());
  const clerkEmail = clerkIdentity.email;

  // Get billing info which includes isAdmin (avoids redundant DB query)
  const billing = await getUserBillingInfo();

  if (!billing.success || !billing.data) {
    return {
      ...FREE_ENTITLEMENTS,
      userId,
      email: clerkEmail,
      isAuthenticated: true,
      isAdmin: false,
    };
  }

  // Extract isAdmin from billing data (already fetched, no separate query needed)
  const {
    email: emailFromDb,
    isPro,
    plan: dbPlan,
    isAdmin: adminStatus,
  } = billing.data;
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
    analyticsRetentionDays: limits.analyticsRetentionDays,
    contactsLimit: limits.contactsLimit,
  };
}
