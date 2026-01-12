import type { Metadata } from 'next';

import { AdminUsersTableUnified } from '@/components/admin/admin-users-table/AdminUsersTableUnified';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { type AdminUsersSort, getAdminUsers } from '@/lib/admin/users';
import { parsePaginationParams } from '@/lib/utils/pagination-parser';

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
  const { page, pageSize } = parsePaginationParams(searchParams);
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

  const { users, total } = await getAdminUsers({
    page,
    pageSize,
    search,
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
          search={search}
          sort={sort}
        />
      </PageContent>
    </PageShell>
  );
}
