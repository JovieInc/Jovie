'server only';

import { auth } from '@clerk/nextjs/server';
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

  const billing = await getUserBillingInfo();

  if (!billing.success || !billing.data) {
    return {
      userId,
      email: null,
      isAuthenticated: true,
      isAdmin: false,
      isPro: false,
      hasAdvancedFeatures: false,
      canRemoveBranding: false,
    };
  }

  const { email, isPro, isAdmin } = billing.data;
  const pro = isPro ?? false;
  const admin = isAdmin ?? false;

  return {
    userId,
    email,
    isAuthenticated: true,
    isAdmin: admin,
    isPro: pro,
    hasAdvancedFeatures: pro,
    canRemoveBranding: pro,
  };
}
