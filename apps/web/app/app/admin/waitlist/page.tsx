import type { Metadata } from 'next';

import { WaitlistMetrics } from '@/components/admin/WaitlistMetrics';
import { WaitlistTable } from '@/components/admin/WaitlistTable';
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
    <div className='flex h-full min-h-0 flex-col'>
      {/* Scrollable container for entire page content */}
      <div className='flex-1 min-h-0 overflow-auto -mx-4 sm:-mx-6 lg:-mx-8'>
        <div className='px-4 sm:px-6 lg:px-8'>
          {/* Header - scrolls out of view */}
          <header className='space-y-1 sm:space-y-2 py-4 sm:py-6'>
            <p className='text-[10px] sm:text-xs uppercase tracking-wide text-tertiary-token'>
              Internal
            </p>
            <h1 className='text-2xl sm:text-3xl font-semibold text-primary-token'>
              Waitlist
            </h1>
            <p className='text-xs sm:text-sm text-secondary-token'>
              Review waitlist submissions for early access.
            </p>
          </header>

          {/* Metrics cards - scroll out of view */}
          <section className='pb-4 sm:pb-6'>
            <WaitlistMetrics metrics={metrics} />
          </section>
        </div>

        {/* Table section with sticky header */}
        <section className='px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6'>
          <WaitlistTable
            entries={entries}
            page={currentPage}
            pageSize={resolvedPageSize}
            total={total}
          />
        </section>
      </div>
    </div>
  );
}
