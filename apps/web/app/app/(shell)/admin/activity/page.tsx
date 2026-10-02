import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { ActivityTableUnified } from '@/features/admin/ActivityTableUnified';
import { filterAdminActivityItems } from '@/lib/admin/activity-search';
import { getAdminActivityFeed } from '@/lib/admin/overview';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { AdminActivitySkeleton } from './loading';

export const metadata: Metadata = {
  title: 'Company timeline',
};

export const runtime = 'nodejs';

interface AdminActivityPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function ActivityContent({ query }: { readonly query: string }) {
  const items = await getAdminActivityFeed(query ? 200 : 50);
  return (
    <ActivityTableUnified items={filterAdminActivityItems(items, query)} />
  );
}

const activityTabs = [{ value: 'activity', label: 'Activity' }] as const;

export default async function AdminActivityPage({
  searchParams,
}: Readonly<AdminActivityPageProps>) {
  await requireCurrentAdminPageAccess();
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q.trim() : '';

  return (
    <AdminPage
      title='Timeline'
      description={
        query
          ? 'Search covers the 200 most recent company events from the last 7 days.'
          : 'The 50 most recent company events from the last 7 days, with source evidence and observed outcomes.'
      }
      tabs={{
        param: 'view',
        value: 'activity',
        options: activityTabs,
      }}
      testId='admin-activity-page'
      viewTestId='admin-activity-view'
    >
      <Suspense fallback={<AdminActivitySkeleton />}>
        <ActivityContent query={query} />
      </Suspense>
    </AdminPage>
  );
}
