import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { isAdminEmail } from '@/lib/admin/roles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const entitlements = await getCurrentUserEntitlements();

  if (!entitlements.isAuthenticated || !entitlements.userId) {
    redirect('/signin?redirect_url=/app/admin');
  }

  if (!isAdminEmail(entitlements.email)) {
    notFound();
  }

  return children;
}
