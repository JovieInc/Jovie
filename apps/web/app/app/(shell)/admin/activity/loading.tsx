import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { ActivityTableSkeleton } from '@/features/admin/ActivityTableUnified';

/**
 * Skeleton wrapper for the admin Activity page.
 *
 * Renders the exact same chrome and `UnifiedTable` primitives as the loaded
 * table so that the skeleton -> data transition produces no visible layout
 * shift. The previous implementation rendered an ad-hoc `<table>` with a
 * different column padding scale, an extra title block, and a wrapping card —
 * all of which would jump when the streamed `<ActivityTableUnified />` mounted.
 */
export function AdminActivitySkeleton() {
  return <ActivityTableSkeleton />;
}

export default function AdminActivityLoading() {
  return (
    <AdminPage
      views='shipping'
      title='Timeline'
      description='The 50 most recent company events from the last 7 days, with source evidence and observed outcomes.'
      testId='admin-activity-page'
      viewTestId='admin-activity-view'
    >
      <AdminActivitySkeleton />
    </AdminPage>
  );
}
