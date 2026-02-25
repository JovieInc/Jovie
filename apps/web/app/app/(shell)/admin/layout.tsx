import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { isAdmin } from '@/lib/admin/roles';
import { getCachedAuth } from '@/lib/auth/cached';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin layout — lightweight auth gate.
 *
 * The parent (shell)/layout.tsx already fetches full entitlements and
 * provides DashboardDataContext. This layout only needs to verify the
 * user has admin role before rendering admin pages.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/admin');
  }

  const hasAdminRole = await isAdmin(userId);

  if (!hasAdminRole) {
    redirect(APP_ROUTES.DASHBOARD);
  }

  return children;
}
