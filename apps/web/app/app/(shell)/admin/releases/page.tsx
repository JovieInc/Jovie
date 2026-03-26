import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { APP_ROUTES } from '@/constants/routes';
import { AdminReleasesPageWrapper } from '@/features/admin/admin-releases-table';
import { getAdminReleases } from '@/lib/admin/releases';
import { adminReleasesSearchParams } from '@/lib/nuqs';

interface AdminReleasesPageProps {
  readonly searchParams: Promise<SearchParams>;
}

export const metadata: Metadata = {
  title: 'Admin releases',
};

export const runtime = 'nodejs';

export default async function AdminReleasesPage({
  searchParams,
}: Readonly<AdminReleasesPageProps>) {
  const { pageSize, sort, q } =
    await adminReleasesSearchParams.parse(searchParams);

  const {
    releases,
    pageSize: resolvedPageSize,
    total,
  } = await getAdminReleases({
    page: 1,
    pageSize,
    search: q ?? '',
    sort,
  });

  return (
    <PageShell>
      <PageContent noPadding>
        <AdminReleasesPageWrapper
          releases={releases}
          pageSize={resolvedPageSize}
          total={total}
          search={q ?? ''}
          sort={sort}
          basePath={APP_ROUTES.ADMIN_RELEASES}
        />
      </PageContent>
    </PageShell>
  );
}
