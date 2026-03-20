import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import type { SearchParams } from 'nuqs/server';
import { TableSkeleton } from '@/components/molecules/LoadingSkeleton';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { WaitlistMetrics } from '@/features/admin/WaitlistMetrics';
import {
  getAdminWaitlistEntries,
  getWaitlistMetrics,
} from '@/lib/admin/waitlist';
import { adminWaitlistSearchParams } from '@/lib/nuqs';

const AdminWaitlistTableWithViews = dynamic(
  () =>
    import('@/features/admin/waitlist-table/AdminWaitlistTableWithViews').then(
      mod => ({
        default: mod.AdminWaitlistTableWithViews,
      })
    ),
  {
    loading: () => (
      <div className='space-y-4 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
        <div className='flex items-center justify-between'>
          <div className='space-y-2'>
            <div className='h-8 w-32 skeleton rounded-md' />
            <div className='h-4 w-48 skeleton rounded-md' />
          </div>
          <div className='flex gap-2'>
            <div className='h-10 w-32 skeleton rounded-md' />
            <div className='h-10 w-24 skeleton rounded-md' />
          </div>
        </div>
        <TableSkeleton rows={10} columns={5} />
      </div>
    ),
  }
);

export const metadata: Metadata = {
  title: 'Waitlist | Admin',
};

export const runtime = 'nodejs';

interface AdminWaitlistPageProps {
  readonly searchParams: Promise<SearchParams>;
}

export default async function AdminWaitlistPage({
  searchParams,
}: Readonly<AdminWaitlistPageProps>) {
  const { pageSize } = await adminWaitlistSearchParams.parse(searchParams);

  const [{ entries, pageSize: resolvedPageSize, total }, metrics] =
    await Promise.all([
      getAdminWaitlistEntries({ page: 1, pageSize }),
      getWaitlistMetrics(),
    ]);

  return (
    <PageShell>
      <PageContent noPadding>
        <div className='flex h-full flex-col gap-4 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
          <WaitlistMetrics metrics={metrics} />
          <div className='flex-1 min-h-0'>
            <AdminWaitlistTableWithViews
              entries={entries}
              page={1}
              pageSize={resolvedPageSize}
              total={total}
            />
          </div>
        </div>
      </PageContent>
    </PageShell>
  );
}
