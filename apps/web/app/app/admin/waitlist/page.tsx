import type { Metadata } from 'next';

import { WaitlistMetrics } from '@/components/admin/WaitlistMetrics';
import { AdminWaitlistTableWithViews } from '@/components/admin/waitlist-table/AdminWaitlistTableWithViews';
import {
  PageContent,
  PageHeader,
  PageShell,
} from '@/components/organisms/PageShell';
import {
  getAdminWaitlistEntries,
  getWaitlistMetrics,
} from '@/lib/admin/waitlist';

export const metadata: Metadata = {
  title: 'Waitlist | Admin',
};

interface AdminWaitlistPageProps {
  searchParams?: {
    page?: string;
    pageSize?: string;
  };
}

export default async function AdminWaitlistPage({
  searchParams,
}: AdminWaitlistPageProps) {
  const pageParam = searchParams?.page
    ? Number.parseInt(searchParams.page, 10)
    : 1;
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const pageSizeParam = searchParams?.pageSize
    ? Number.parseInt(searchParams.pageSize, 10)
    : 20;
  const pageSize =
    Number.isFinite(pageSizeParam) && pageSizeParam > 0 && pageSizeParam <= 100
      ? pageSizeParam
      : 20;

  const [
    { entries, page: currentPage, pageSize: resolvedPageSize, total },
    metrics,
  ] = await Promise.all([
    getAdminWaitlistEntries({ page, pageSize }),
    getWaitlistMetrics(),
  ]);

  return (
    <PageShell>
      <PageHeader title='Waitlist' />
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
