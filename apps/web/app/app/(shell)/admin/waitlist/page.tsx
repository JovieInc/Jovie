import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import type { SearchParams } from 'nuqs/server';

import { WaitlistMetrics } from '@/components/admin/WaitlistMetrics';
import { TableSkeleton } from '@/components/molecules/LoadingSkeleton';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import {
  getAdminWaitlistEntries,
  getWaitlistMetrics,
} from '@/lib/admin/waitlist';
import { adminWaitlistSearchParams } from '@/lib/nuqs';

const AdminWaitlistTableWithViews = dynamic(
  () =>
    import(
      '@/components/admin/waitlist-table/AdminWaitlistTableWithViews'
    ).then(mod => ({
      default: mod.AdminWaitlistTableWithViews,
    })),
  {
    loading: () => (
      <div className='p-6 space-y-6'>
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
  searchParams: Promise<SearchParams>;
}

export default async function AdminWaitlistPage({
  searchParams,
}: Readonly<AdminWaitlistPageProps>) {
  const { page, pageSize } =
    await adminWaitlistSearchParams.parse(searchParams);

  const [
    { entries, page: currentPage, pageSize: resolvedPageSize, total },
    metrics,
  ] = await Promise.all([
    getAdminWaitlistEntries({ page, pageSize }),
    getWaitlistMetrics(),
  ]);

  return (
    <PageShell>
      <PageContent noPadding>
        <WaitlistMetrics metrics={metrics} />
        <AdminWaitlistTableWithViews
          entries={entries}
          page={currentPage}
          pageSize={resolvedPageSize}
          total={total}
        />
      </PageContent>
    </PageShell>
  );
}
