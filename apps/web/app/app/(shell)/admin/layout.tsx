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

  // Redirect unauthorized users to dashboard.
  // Middleware already gates /app/admin as a protected path, so unauthenticated
  // users never reach this layout. If auth state is transiently unavailable,
  // redirecting to /sign-in would loop (middleware redirects authed users back).
  if (
    !entitlements.isAuthenticated ||
    !entitlements.userId ||
    !entitlements.isAdmin
  ) {
    redirect(APP_ROUTES.DASHBOARD);
  }

  return children;
}
