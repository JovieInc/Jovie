import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const entitlements = await getCurrentUserEntitlements();

  if (!entitlements.isAuthenticated || !entitlements.userId) {
    redirect('/sign-in?redirect_url=/app/admin');
  }

  if (!entitlements.isAdmin) {
    notFound();
  }

  return children;
}
