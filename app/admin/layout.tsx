import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { isAdminEmail } from '@/lib/admin/roles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const entitlements = await getCurrentUserEntitlements();

  if (!entitlements.isAuthenticated) {
    redirect('/signin?redirect_url=/admin');
  }

  if (!isAdminEmail(entitlements.email)) {
    notFound();
  }

  return <AdminShell>{children}</AdminShell>;
}
