import { AdminWorkspacePage } from '@/components/features/admin/layout/AdminWorkspacePage';
import { ActivityTableSkeleton } from '@/features/admin/ActivityTableUnified';

const activityTabs = [{ value: 'activity', label: 'Activity' }] as const;

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
    <AdminWorkspacePage
      title='Activity'
      description='Recent admin interventions, creator events, and system outcomes.'
      primaryParam='view'
      primaryValue='activity'
      primaryOptions={activityTabs}
      testId='admin-activity-page'
      viewTestId='admin-activity-view'
    >
      <AdminActivitySkeleton />
    </AdminWorkspacePage>
  );
}
