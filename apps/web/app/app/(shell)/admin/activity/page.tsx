import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminWorkspacePage } from '@/components/features/admin/layout/AdminWorkspacePage';
import { ActivityTableUnified } from '@/features/admin/ActivityTableUnified';
import { getAdminActivityFeed } from '@/lib/admin/overview';
import { AdminActivitySkeleton } from './loading';

export const metadata: Metadata = {
  title: 'Admin activity',
};

export const runtime = 'nodejs';

async function ActivityContent() {
  const items = await getAdminActivityFeed(50);
  return <ActivityTableUnified items={items} />;
}

const activityTabs = [{ value: 'activity', label: 'Activity' }] as const;

export default function AdminActivityPage() {
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
      <Suspense fallback={<AdminActivitySkeleton />}>
        <ActivityContent />
      </Suspense>
    </AdminWorkspacePage>
  );
}
