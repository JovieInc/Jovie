import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';
import { AdminCreatorsPageWrapper } from '@/components/admin/admin-creator-profiles/AdminCreatorsPageWrapper';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
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
  const { pageSize, sort, q } =
    await adminCreatorsSearchParams.parse(searchParams);

  const {
    profiles,
    pageSize: resolvedPageSize,
    total,
  } = await getAdminCreatorProfiles({
    page: 1,
    pageSize,
    search: q ?? '',
    sort,
  });

  return (
    <PageShell>
      <PageContent noPadding>
        <AdminCreatorsPageWrapper
          profiles={profiles}
          page={1}
          pageSize={resolvedPageSize}
          total={total}
          search={q ?? ''}
          sort={sort}
          basePath={APP_ROUTES.ADMIN_CREATORS}
        />
      </PageContent>
    </PageShell>
  );
}
