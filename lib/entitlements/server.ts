'server only';

import { auth, currentUser } from '@clerk/nextjs/server';
import { isAdminEmail } from '@/lib/admin/roles';
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

  const billing = await getUserBillingInfo();

  if (!billing.success || !billing.data) {
    const adminFromEmail = isAdminEmail(clerkEmail);
    return {
      userId,
      email: clerkEmail,
      isAuthenticated: true,
      isAdmin: adminFromEmail,
      isPro: false,
      hasAdvancedFeatures: false,
      canRemoveBranding: false,
    };
  }

  const { email: emailFromDb, isPro, isAdmin } = billing.data;
  const effectiveEmail = emailFromDb || clerkEmail;
  const pro = isPro ?? false;
  const admin = Boolean(isAdmin) || isAdminEmail(effectiveEmail);

  return {
    userId,
    email: effectiveEmail,
    isAuthenticated: true,
    isAdmin: admin,
    isPro: pro,
    hasAdvancedFeatures: pro,
    canRemoveBranding: pro,
  };
}
