import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  BillingUnavailableError,
  getCurrentUserEntitlements,
} from '@/lib/entitlements/server';

export const runtime = 'nodejs';

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

  if (!entitlements.isAdmin) {
    notFound();
  }

  return children;
}
