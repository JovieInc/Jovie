import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import type { SearchParams } from 'nuqs/server';

import { TableSkeleton } from '@/components/molecules/LoadingSkeleton';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { getAdminUsers } from '@/lib/admin/users';
import { adminUsersSearchParams } from '@/lib/nuqs';

const AdminUsersTableUnified = dynamic(
  () =>
    import('@/components/admin/admin-users-table/AdminUsersTableUnified').then(
      mod => ({
        default: mod.AdminUsersTableUnified,
      })
    ),
  {
    loading: () => (
      <div className='p-6 space-y-6'>
        <div className='flex items-center justify-between'>
          <div className='space-y-2'>
            <div className='h-8 w-32 skeleton rounded-md' />
            <div className='h-4 w-48 skeleton rounded-md' />
          </div>
          <div className='flex gap-2'>
            <div className='h-10 w-48 skeleton rounded-md' />
            <div className='h-10 w-24 skeleton rounded-md' />
          </div>
        </div>
        <TableSkeleton rows={10} columns={4} />
      </div>
    ),
  }
);

interface AdminUsersPageProps {
  searchParams: Promise<SearchParams>;
}

export const metadata: Metadata = {
  title: 'Admin users',
};

export const runtime = 'nodejs';

export default async function AdminUsersPage({
  searchParams,
}: Readonly<AdminUsersPageProps>) {
  const { page, pageSize, sort, q } =
    await adminUsersSearchParams.parse(searchParams);

  const { users, total } = await getAdminUsers({
    page,
    pageSize,
    search: q ?? '',
    sort,
  });

  return (
    <PageShell>
      <PageContent noPadding>
        <AdminUsersTableUnified
          users={users}
          page={page}
          pageSize={pageSize}
          total={total}
          search={q ?? ''}
          sort={sort}
        />
      </PageContent>
    </PageShell>
  );
}
