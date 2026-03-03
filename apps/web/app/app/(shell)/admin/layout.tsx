import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // getCurrentUserEntitlements degrades gracefully on billing failure --
  // admin status is fetched independently and preserved even when billing is down.
  const entitlements = await getCurrentUserEntitlements();

  // Redirect unauthorized users to dashboard. Middleware already gates /app/admin
  // as a protected path, so unauthenticated users never reach this layout.
  // If auth state is transiently unavailable, redirecting to /sign-in would loop
  // (middleware redirects authed users back). Dashboard is the safe fallback.
  if (
    !entitlements.isAuthenticated ||
    !entitlements.userId ||
    !entitlements.isAdmin
  ) {
    redirect(APP_ROUTES.DASHBOARD);
  }

  return children;
}
