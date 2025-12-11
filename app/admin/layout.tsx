import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { isAdminEmail } from '@/lib/admin/roles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  getDashboardDataCached,
  setSidebarCollapsed,
} from '../dashboard/actions';
import DashboardLayoutClient from '../dashboard/DashboardLayoutClient';
import { MyStatsig } from '../my-statsig';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const entitlements = await getCurrentUserEntitlements();

  if (!entitlements.isAuthenticated || !entitlements.userId) {
    redirect('/signin?redirect_url=/admin');
  }

  if (!isAdminEmail(entitlements.email)) {
    notFound();
  }

  const dashboardData = await getDashboardDataCached();

  return (
    <MyStatsig userId={entitlements.userId}>
      <DashboardLayoutClient
        dashboardData={dashboardData}
        persistSidebarCollapsed={setSidebarCollapsed}
        fullWidth
      >
        {children}
      </DashboardLayoutClient>
    </MyStatsig>
  );
}
