import type { Metadata } from 'next';

import { AdminUsersTable } from '@/components/admin/admin-users-table';
import {
  PageContent,
  PageHeader,
  PageShell,
} from '@/components/organisms/PageShell';
import { type AdminUsersSort, getAdminUsers } from '@/lib/admin/users';

interface AdminUsersPageProps {
  searchParams?: {
    page?: string;
    q?: string;
    sort?: string;
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

  const sortParam = searchParams?.sort;
  const sort: AdminUsersSort =
    sortParam === 'created_asc' ||
    sortParam === 'created_desc' ||
    sortParam === 'name_asc' ||
    sortParam === 'name_desc' ||
    sortParam === 'email_asc' ||
    sortParam === 'email_desc'
      ? sortParam
      : 'created_desc';

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
    sort,
  });

  return (
    <PageShell>
      <PageHeader
        title='Users'
        description={`${total} total ${total === 1 ? 'user' : 'users'}`}
      />
      <PageContent noPadding>
        <AdminUsersTable
          users={users}
          page={page}
          pageSize={pageSize}
          total={total}
          search={search}
          sort={sort}
        />
      </PageContent>
    </PageShell>
  );
}
