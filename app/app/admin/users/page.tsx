import type { Metadata } from 'next';

import { AdminUsersTable } from '@/components/admin/AdminUsersTable';
import { getAdminUsers } from '@/lib/admin/users';

interface AdminUsersPageProps {
  searchParams?: {
    page?: string;
    q?: string;
    pageSize?: string;
  };
}

export const metadata: Metadata = {
  title: 'Admin users',
};

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  const pageParam = searchParams?.page
    ? Number.parseInt(searchParams.page, 10)
    : 1;
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const search = searchParams?.q ?? '';

  const pageSizeParam = searchParams?.pageSize
    ? Number.parseInt(searchParams.pageSize, 10)
    : 20;
  const pageSize =
    Number.isFinite(pageSizeParam) && pageSizeParam > 0 && pageSizeParam <= 100
      ? pageSizeParam
      : 20;

  const { users, total } = await getAdminUsers({
    page,
    pageSize,
    search,
  });

  return (
    <div className='space-y-8'>
      <header className='space-y-2'>
        <p className='text-xs uppercase tracking-wide text-tertiary-token'>
          Internal
        </p>
        <h1 className='text-3xl font-semibold text-primary-token'>Users</h1>
        <p className='text-sm text-secondary-token'>
          Signed up users and billing status.
        </p>
      </header>

      <section className='-mx-4 sm:-mx-6 lg:-mx-8'>
        <AdminUsersTable
          users={users}
          page={page}
          pageSize={pageSize}
          total={total}
          search={search}
        />
      </section>
    </div>
  );
}
