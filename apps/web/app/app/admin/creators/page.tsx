import type { Metadata } from 'next';

import { AdminCreatorsPageWrapper } from '@/components/admin/admin-creator-profiles/AdminCreatorsPageWrapper';
import {
  type AdminCreatorProfilesSort,
  getAdminCreatorProfiles,
} from '@/lib/admin/creator-profiles';
import { parsePaginationParams } from '@/lib/utils/pagination-parser';

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
  const { page, pageSize } = parsePaginationParams(searchParams);
  const search = searchParams?.q ?? '';

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
