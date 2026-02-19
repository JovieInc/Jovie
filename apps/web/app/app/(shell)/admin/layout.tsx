import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import {
  BillingUnavailableError,
  getCurrentUserEntitlements,
} from '@/lib/entitlements/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  let entitlements;
  try {
    entitlements = await getCurrentUserEntitlements();
  } catch (error) {
    if (error instanceof BillingUnavailableError) {
      // Billing is down but admin status is available — allow access
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
    redirect('/sign-in?redirect_url=/app/admin');
  }

  // Redirect non-admins to dashboard instead of returning 404.
  // A 404 is misleading — the routes exist, the user just lacks permission.
  if (!entitlements.isAdmin) {
    redirect(APP_ROUTES.DASHBOARD);
  }

  return children;
}
