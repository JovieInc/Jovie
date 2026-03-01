import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import {
  BillingUnavailableError,
  getCurrentUserEntitlements,
} from '@/lib/entitlements/server';

export const dynamic = 'force-dynamic';

export default async function RetargetingAdsLayout({
  children,
}: {
  children: ReactNode;
}) {
  let entitlements;
  try {
    entitlements = await getCurrentUserEntitlements();
  } catch (error) {
    if (error instanceof BillingUnavailableError) {
      entitlements = {
        isAuthenticated: true,
        userId: error.userId,
        isAdmin: error.isAdmin,
      };
    } else {
      throw error;
    }
  }

  if (!entitlements.isAuthenticated || !entitlements.userId) {
    redirect('/sign-in');
  }

  if (!entitlements.isAdmin) {
    redirect(APP_ROUTES.DASHBOARD);
  }

  return children;
}
