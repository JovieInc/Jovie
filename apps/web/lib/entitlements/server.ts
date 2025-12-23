'server only';

import { auth, currentUser } from '@clerk/nextjs/server';
import { isAdmin } from '@/lib/admin/roles';
import { resolveClerkIdentity } from '@/lib/auth/clerk-identity';
import { getUserBillingInfo } from '@/lib/stripe/customer-sync';
import type { UserEntitlements } from '@/types';

export async function getCurrentUserEntitlements(): Promise<UserEntitlements> {
  const { userId } = await auth();
  if (!userId) {
    return {
      userId: null,
      email: null,
      isAuthenticated: false,
      isAdmin: false,
      isPro: false,
      hasAdvancedFeatures: false,
      canRemoveBranding: false,
    };
  }

  const clerkIdentity = resolveClerkIdentity(await currentUser());
  const clerkEmail = clerkIdentity.email;

  // Check admin status from database (cached)
  const adminStatus = await isAdmin(userId);

  const billing = await getUserBillingInfo();

  if (!billing.success || !billing.data) {
    return {
      userId,
      email: clerkEmail,
      isAuthenticated: true,
      isAdmin: adminStatus,
      isPro: false,
      hasAdvancedFeatures: false,
      canRemoveBranding: false,
    };
  }

  const { email: emailFromDb, isPro } = billing.data;
  const effectiveEmail = emailFromDb || clerkEmail;
  const pro = isPro ?? false;

  return {
    userId,
    email: effectiveEmail,
    isAuthenticated: true,
    isAdmin: adminStatus,
    isPro: pro,
    hasAdvancedFeatures: pro,
    canRemoveBranding: pro,
  };
}
