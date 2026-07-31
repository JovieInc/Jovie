import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import {
  AdminHealthDashboard,
  AdminHealthDashboardSkeleton,
} from './_components/AdminHealthDashboard';

export const metadata: Metadata = {
  title: 'Admin Overview',
  description:
    'Health dashboard — one signal per area, each linking to its detail screen.',
};

export const runtime = 'nodejs';

/**
 * JOV-2098 IA: Overview is the health launchpad only.
 * Detail surfaces own their full metrics and controls:
 * - Ops — live operational state, canaries, control panel, HUD
 * - Growth — acquisition funnel, leads, outreach, conversion
 * - People — waitlist, users, creators, roles, actions
 * - Revenue Lift — IRPAA / revenue detail
 */
export default async function AdminOverviewPage() {
  await requireCurrentAdminPageAccess();

  return (
    <AdminPage
      title='Overview'
      description='Health dashboard — one signal per area, each linking to its detail screen.'
      testId='admin-overview-page'
      viewTestId='admin-dashboard-content'
    >
      <Suspense fallback={<AdminHealthDashboardSkeleton />}>
        <AdminHealthDashboard />
      </Suspense>
    </AdminPage>
  );
}
