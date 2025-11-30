import type { Metadata } from 'next';

import { AdminCreatorProfilesWithSidebar } from '@/components/admin/AdminCreatorProfilesWithSidebar';
import {
  type AdminCreatorProfilesSort,
  getAdminCreatorProfiles,
} from '@/lib/admin/creator-profiles';

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

  const pageSizeParam = searchParams?.pageSize
    ? Number.parseInt(searchParams.pageSize, 10)
    : 20;
  const pageSize =
    Number.isFinite(pageSizeParam) && pageSizeParam > 0 && pageSizeParam <= 100
      ? pageSizeParam
      : 20;

  const sortParam = searchParams?.sort;
  const sort: AdminCreatorProfilesSort =
    sortParam === 'created_asc' ||
    sortParam === 'verified_desc' ||
    sortParam === 'verified_asc' ||
    sortParam === 'claimed_desc' ||
    sortParam === 'claimed_asc'
      ? sortParam
      : 'created_desc';

  const {
    profiles,
    page: currentPage,
    pageSize: resolvedPageSize,
    total,
  } = await getAdminCreatorProfiles({
    page,
    pageSize,
    search,
    sort,
  });

  return (
    <div className='space-y-8'>
      <header className='space-y-2'>
        <p className='text-xs uppercase tracking-wide text-tertiary-token'>
          Admin
        </p>
        <h1 className='text-3xl font-semibold text-primary-token'>Users</h1>
        <p className='text-sm text-secondary-token'>
          View and manage creator verification and avatars.
        </p>
      </header>

      <AdminCreatorProfilesWithSidebar
        profiles={profiles}
        page={currentPage}
        pageSize={resolvedPageSize}
        total={total}
        search={search}
        sort={sort}
      />
    </div>
  );
}
