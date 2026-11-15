import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { AdminHealthDashboardSkeleton } from './_components/AdminHealthDashboard';

/**
 * Admin loading screen — matches Overview health dashboard layout. Renders
 * the Fleet view navigation (JOV-12641) so Health / Agents / Room stay
 * visible and geometrically stable while a destination loads.
 */
export default function AdminLoading() {
  return (
    <AdminPage
      title='Overview'
      views='operations'
      testId='admin-overview-loading'
      viewTestId='admin-dashboard-loading-content'
    >
      <AdminHealthDashboardSkeleton />
    </AdminPage>
  );
}
