import type { Metadata } from 'next';

import { AdminCreatorProfilesWithSidebar } from '@/components/admin/AdminCreatorProfilesWithSidebar';
import {
  type AdminCreatorProfilesSort,
  getAdminCreatorProfiles,
} from '@/lib/admin/creator-profiles';

interface AdminUsersPageProps {
  searchParams?: Promise<{
    page?: string;
    q?: string;
    sort?: string;
    pageSize?: string;
  }>;
}

export const metadata: Metadata = {
  title: 'Admin users',
};

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};

  const pageParam = resolvedSearchParams.page
    ? Number.parseInt(resolvedSearchParams.page, 10)
    : 1;
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const search = resolvedSearchParams.q ?? '';

  const pageSizeParam = resolvedSearchParams.pageSize
    ? Number.parseInt(resolvedSearchParams.pageSize, 10)
    : 20;
  const pageSize =
    Number.isFinite(pageSizeParam) && pageSizeParam > 0 && pageSizeParam <= 100
      ? pageSizeParam
      : 20;

  const sortParam = resolvedSearchParams.sort;
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
