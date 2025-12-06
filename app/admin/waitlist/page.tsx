import type { Metadata } from 'next';

import { WaitlistTable } from '@/components/admin/WaitlistTable';
import { getAdminWaitlistEntries } from '@/lib/admin/waitlist';

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

  const {
    entries,
    page: currentPage,
    pageSize: resolvedPageSize,
    total,
  } = await getAdminWaitlistEntries({ page, pageSize });

  return (
    <div className='space-y-8'>
      <header className='space-y-2'>
        <p className='text-xs uppercase tracking-wide text-tertiary-token'>
          Internal
        </p>
        <h1 className='text-3xl font-semibold text-primary-token'>Waitlist</h1>
        <p className='text-sm text-secondary-token'>
          Review waitlist submissions for early access.
        </p>
      </header>

      <section>
        <WaitlistTable
          entries={entries}
          page={currentPage}
          pageSize={resolvedPageSize}
          total={total}
        />
      </section>
    </div>
  );
}
