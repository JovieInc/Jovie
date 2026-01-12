import type { Metadata } from 'next';

import { AdminCreatorsPageWrapper } from '@/components/admin/admin-creator-profiles/AdminCreatorsPageWrapper';
import {
  type AdminCreatorProfilesSort,
  getAdminCreatorProfiles,
} from '@/lib/admin/creator-profiles';

interface AdminCreatorsPageProps {
  searchParams?: {
    page?: string;
    q?: string;
    sort?: string;
    pageSize?: string;
  };
}

export const metadata: Metadata = {
  title: 'Admin creators',
};

export default async function AdminCreatorsPage({
  searchParams,
}: AdminCreatorsPageProps) {
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
    <AdminCreatorsPageWrapper
      profiles={profiles}
      page={currentPage}
      pageSize={resolvedPageSize}
      total={total}
      search={search}
      sort={sort}
      basePath='/app/admin/creators'
    />
  );
}
