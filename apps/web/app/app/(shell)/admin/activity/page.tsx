import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { ActivityTableUnified } from '@/features/admin/ActivityTableUnified';
import { getAdminActivityFeed } from '@/lib/admin/overview';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { AdminActivitySkeleton } from './loading';

export const metadata: Metadata = {
  title: 'Company timeline',
};

export const runtime = 'nodejs';

async function ActivityContent() {
  const items = await getAdminActivityFeed(50);
  return <ActivityTableUnified items={items} />;
}

const activityTabs = [{ value: 'activity', label: 'Activity' }] as const;

export default async function AdminActivityPage() {
  await requireCurrentAdminPageAccess();

  return (
    <AdminPage
      title='Timeline'
      description='Semantic company events with their source evidence and observed outcomes.'
      tabs={{
        param: 'view',
        value: 'activity',
        options: activityTabs,
      }}
      testId='admin-activity-page'
      viewTestId='admin-activity-view'
    >
      <Suspense fallback={<AdminActivitySkeleton />}>
        <ActivityContent />
      </Suspense>
    </AdminPage>
  );
}
