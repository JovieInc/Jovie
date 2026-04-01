import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';
import { AdminCreatorsPageWrapper } from '@/components/features/admin/admin-creator-profiles/AdminCreatorsPageWrapper';
import { AdminReleasesPageWrapper } from '@/components/features/admin/admin-releases-table';
import { AdminUsersTableUnified } from '@/components/features/admin/admin-users-table/AdminUsersTableUnified';
import { AdminFeedbackTable } from '@/components/features/admin/feedback-table/AdminFeedbackTable';
import { WaitlistMetrics } from '@/components/features/admin/WaitlistMetrics';
import { AdminWaitlistTableWithViews } from '@/components/features/admin/waitlist-table/AdminWaitlistTableWithViews';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { WorkspaceTabsSurface } from '@/components/organisms/WorkspaceTabsSurface';
import {
  type AdminPeopleView,
  adminPeopleViews,
  buildAdminPeopleHref,
  getAdminPeopleViewLabel,
  isAdminPeopleView,
} from '@/constants/admin-navigation';
import { getAdminCreatorProfiles } from '@/lib/admin/creator-profiles';
import { getAdminReleases } from '@/lib/admin/releases';
import { getAdminUsers } from '@/lib/admin/users';
import {
  getAdminWaitlistEntries,
  getWaitlistMetrics,
} from '@/lib/admin/waitlist';
import { getAdminFeedbackItems } from '@/lib/feedback';
import {
  type AdminCreatorsSort,
  type AdminPeopleSort,
  type AdminReleasesSort,
  type AdminUsersSort,
  adminCreatorsSortFields,
  adminPeopleSearchParams,
  adminReleasesSortFields,
  adminUsersSortFields,
} from '@/lib/nuqs';

interface AdminPeoplePageProps {
  readonly searchParams: Promise<SearchParams>;
}

export const metadata: Metadata = {
  title: 'Admin people',
};

export const runtime = 'nodejs';

const peopleTabs = adminPeopleViews.map(view => ({
  value: view,
  label: getAdminPeopleViewLabel(view),
}));

function resolvePeopleView(view: string): AdminPeopleView {
  return isAdminPeopleView(view) ? view : 'waitlist';
}

function resolveCreatorSort(sort: AdminPeopleSort): AdminCreatorsSort {
  return adminCreatorsSortFields.includes(sort as AdminCreatorsSort)
    ? (sort as AdminCreatorsSort)
    : 'created_desc';
}

function resolveUserSort(sort: AdminPeopleSort): AdminUsersSort {
  return adminUsersSortFields.includes(sort as AdminUsersSort)
    ? (sort as AdminUsersSort)
    : 'created_desc';
}

function resolveReleaseSort(sort: AdminPeopleSort): AdminReleasesSort {
  return adminReleasesSortFields.includes(sort as AdminReleasesSort)
    ? (sort as AdminReleasesSort)
    : 'release_date_desc';
}

async function renderPeopleView(
  view: AdminPeopleView,
  params: Awaited<ReturnType<typeof adminPeopleSearchParams.parse>>
) {
  const pageSize = params.pageSize;
  const page = params.page;
  const search = params.q ?? '';

  switch (view) {
    case 'waitlist': {
      const [{ entries, pageSize: resolvedPageSize, total }, metrics] =
        await Promise.all([
          getAdminWaitlistEntries({ page: 1, pageSize }),
          getWaitlistMetrics(),
        ]);

      return (
        <div className='space-y-4'>
          <WaitlistMetrics metrics={metrics} />
          <AdminWaitlistTableWithViews
            entries={entries}
            page={1}
            pageSize={resolvedPageSize}
            total={total}
          />
        </div>
      );
    }
    case 'creators': {
      const sort = resolveCreatorSort(params.sort);
      const {
        profiles,
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
          page={page}
          pageSize={resolvedPageSize}
          total={total}
          search={search}
          sort={sort}
          basePath={buildAdminPeopleHref('creators')}
        />
      );
    }
    case 'users': {
      const sort = resolveUserSort(params.sort);
      const { users, total } = await getAdminUsers({
        page,
        pageSize,
        search,
        sort,
      });

      return (
        <AdminUsersTableUnified
          users={users}
          page={page}
          pageSize={pageSize}
          total={total}
          search={search}
          sort={sort}
          basePath={buildAdminPeopleHref('users')}
        />
      );
    }
    case 'releases': {
      const sort = resolveReleaseSort(params.sort);
      const {
        releases,
        pageSize: resolvedPageSize,
        total,
      } = await getAdminReleases({
        page,
        pageSize,
        search,
        sort,
      });

      return (
        <AdminReleasesPageWrapper
          releases={releases}
          pageSize={resolvedPageSize}
          total={total}
          search={search}
          sort={sort}
          basePath={buildAdminPeopleHref('releases')}
        />
      );
    }
    case 'feedback':
    default: {
      const items = await getAdminFeedbackItems(200);

      return (
        <AdminFeedbackTable
          items={items.map(item => ({
            id: item.id,
            message: item.message,
            source: item.source,
            status: item.status,
            context: item.context,
            dismissedAtIso: item.dismissedAt?.toISOString() ?? null,
            createdAtIso: item.createdAt.toISOString(),
            user: item.user,
          }))}
        />
      );
    }
  }
}

export default async function AdminPeoplePage({
  searchParams,
}: Readonly<AdminPeoplePageProps>) {
  const params = await adminPeopleSearchParams.parse(searchParams);
  const view = resolvePeopleView(params.view);
  const content = await renderPeopleView(view, params);

  return (
    <PageShell>
      <PageContent noPadding>
        <div className='px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
          <WorkspaceTabsSurface
            title='People operations'
            description='Waitlist, creators, users, releases, and feedback.'
            primaryParam='view'
            primaryValue={view}
            primaryOptions={peopleTabs}
          >
            {content}
          </WorkspaceTabsSurface>
        </div>
      </PageContent>
    </PageShell>
  );
}
