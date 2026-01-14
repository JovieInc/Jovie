import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { AdminUsersTableUnified } from '@/components/admin/admin-users-table/AdminUsersTableUnified';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { getAdminUsers } from '@/lib/admin/users';
import { adminUsersSearchParams } from '@/lib/nuqs';

interface AdminUsersPageProps {
  searchParams: Promise<SearchParams>;
}

export const metadata: Metadata = {
  title: 'Admin users',
};

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
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
