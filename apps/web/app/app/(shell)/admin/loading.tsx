import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { AdminHealthDashboardSkeleton } from './_components/AdminHealthDashboard';

/**
 * Admin loading screen — matches Overview health dashboard layout.
 */
export default function AdminLoading() {
  return (
    <AdminPage
      title='Overview'
      testId='admin-overview-loading'
      viewTestId='admin-dashboard-loading-content'
    >
      <AdminHealthDashboardSkeleton />
    </AdminPage>
  );
}
