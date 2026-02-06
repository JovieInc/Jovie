import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';
import { AdminCreatorsPageWrapper } from '@/components/admin/admin-creator-profiles/AdminCreatorsPageWrapper';
import { APP_ROUTES } from '@/constants/routes';
import { getAdminCreatorProfiles } from '@/lib/admin/creator-profiles';
import { adminCreatorsSearchParams } from '@/lib/nuqs';

interface AdminCreatorsPageProps {
  readonly searchParams: Promise<SearchParams>;
}

export const metadata: Metadata = {
  title: 'Admin creators',
};

export const runtime = 'nodejs';

export default async function AdminCreatorsPage({
  searchParams,
}: Readonly<AdminCreatorsPageProps>) {
  const { page, pageSize, sort, q } =
    await adminCreatorsSearchParams.parse(searchParams);

  const {
    profiles,
    page: currentPage,
    pageSize: resolvedPageSize,
    total,
  } = await getAdminCreatorProfiles({
    page,
    pageSize,
    search: q ?? '',
    sort,
  });

  return (
    <AdminCreatorsPageWrapper
      profiles={profiles}
      page={currentPage}
      pageSize={resolvedPageSize}
      total={total}
      search={q ?? ''}
      sort={sort}
      basePath={APP_ROUTES.ADMIN_CREATORS}
    />
  );
}
