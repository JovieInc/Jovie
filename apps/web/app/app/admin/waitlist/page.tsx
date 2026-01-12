import type { Metadata } from 'next';

import { WaitlistMetrics } from '@/components/admin/WaitlistMetrics';
import { AdminWaitlistTableWithViews } from '@/components/admin/waitlist-table/AdminWaitlistTableWithViews';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import {
  getAdminWaitlistEntries,
  getWaitlistMetrics,
} from '@/lib/admin/waitlist';
import { parsePaginationParams } from '@/lib/utils/pagination-parser';

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
  const { page, pageSize } = parsePaginationParams(searchParams);

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
