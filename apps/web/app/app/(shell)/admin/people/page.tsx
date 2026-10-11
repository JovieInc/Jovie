import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import type { SearchParams } from 'nuqs/server';
import { AdminPeopleRightPanelProvider } from '@/components/features/admin/AdminPeopleRightPanelProvider';
import { AdminCreatorsPageWrapper } from '@/components/features/admin/admin-creator-profiles/AdminCreatorsPageWrapper';
import { AdminReleasesPageWrapper } from '@/components/features/admin/admin-releases-table';
import { AdminUsersTableUnified } from '@/components/features/admin/admin-users-table/AdminUsersTableUnified';
import { AdminContactsTable } from '@/components/features/admin/contacts-table/AdminContactsTable';
import { CustomerRecoveryPanel } from '@/components/features/admin/customer-recovery/CustomerRecoveryPanel';
import { AdminFeedbackTable } from '@/components/features/admin/feedback-table/AdminFeedbackTable';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { WaitlistMetrics } from '@/components/features/admin/WaitlistMetrics';
import { WaitlistSettingsPanel } from '@/components/features/admin/WaitlistSettingsPanel';
import { AdminWaitlistTableWithViews } from '@/components/features/admin/waitlist-table/AdminWaitlistTableWithViews';
import {
  type AdminPeopleView,
  adminPeopleViews,
  buildAdminPeopleHref,
  getAdminPeopleViewLabel,
  isAdminPeopleView,
} from '@/constants/admin-navigation';
import {
  type AdminAssetSort,
  adminAssetSortFields,
  getAdminAssets,
} from '@/lib/admin/assets';
import { getCanonicalContacts } from '@/lib/admin/contacts';
import { getAdminCreatorProfiles } from '@/lib/admin/creator-profiles';
import { getCustomerRecovery } from '@/lib/admin/customer-recovery';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { getAdminReleases } from '@/lib/admin/releases';
import { getAdminUsers } from '@/lib/admin/users';
import {
  getAdminWaitlistEntries,
  getWaitlistIntegritySummary,
  getWaitlistMetrics,
} from '@/lib/admin/waitlist';
import { getAdminFeedbackItemsResult } from '@/lib/feedback';
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
  title: 'Admin People',
  description: 'User table, roles, waitlist, creators, and individual actions.',
};

export const runtime = 'nodejs';

const AdminAssetsPageWrapper = dynamic(() =>
  import('@/components/features/admin/admin-assets-table').then(mod => ({
    default: mod.AdminAssetsPageWrapper,
  }))
);

const peopleTabs = adminPeopleViews.map(view => ({
  value: view,
  label: getAdminPeopleViewLabel(view),
}));

function resolvePeopleView(view: string): AdminPeopleView {
  return isAdminPeopleView(view) ? view : 'contacts';
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

function resolveAssetSort(sort: AdminPeopleSort): AdminAssetSort {
  return adminAssetSortFields.includes(sort as AdminAssetSort)
    ? (sort as AdminAssetSort)
    : 'created_desc';
}

async function renderPeopleView(
  view: AdminPeopleView,
  params: Awaited<ReturnType<typeof adminPeopleSearchParams.parse>>
) {
  const pageSize = params.pageSize;
  const page = params.page;
  const search = params.q ?? '';

  switch (view) {
    case 'contacts': {
      const { contacts, metrics, total } = await getCanonicalContacts({
        page,
        pageSize,
        search,
        stage: params.stage,
      });

      return (
        <AdminContactsTable
          rows={contacts.map(contact => ({
            dedupeKey: contact.dedupeKey,
            stage: contact.stage,
            overrideStage: contact.overrideStage,
            displayName: contact.displayName,
            email: contact.email,
            handle: contact.handle,
            avatarUrl: contact.avatarUrl,
            sources: contact.sources,
            certifiedAt: contact.certifiedAt?.toISOString() ?? null,
            stageAt: contact.stageAt?.toISOString() ?? null,
            activityAt: contact.activityAt?.toISOString() ?? null,
            firstSeenAt: contact.firstSeenAt?.toISOString() ?? null,
            userId: contact.userId,
            creatorProfileId: contact.creatorProfileId,
            leadId: contact.leadId,
            waitlistEntryId: contact.waitlistEntryId,
          }))}
          total={total}
          page={page}
          pageSize={pageSize}
          stage={params.stage ?? null}
          search={search}
          metrics={metrics}
        />
      );
    }
    case 'waitlist': {
      const [
        { entries, pageSize: resolvedPageSize, total },
        metrics,
        integrity,
      ] = await Promise.all([
        getAdminWaitlistEntries({ page: 1, pageSize }),
        getWaitlistMetrics(),
        getWaitlistIntegritySummary(),
      ]);

      return (
        <div className='space-y-4'>
          <WaitlistMetrics metrics={metrics} />
          <WaitlistSettingsPanel />
          <AdminWaitlistTableWithViews
            entries={entries}
            page={1}
            pageSize={resolvedPageSize}
            total={total}
            integrity={integrity}
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
    case 'assets': {
      const sort = resolveAssetSort(params.sort);
      const {
        assets,
        pageSize: resolvedPageSize,
        total,
      } = await getAdminAssets({
        page,
        pageSize,
        search,
        sort,
        type: params.type,
        issues: params.issues,
        verified: params.verified,
      });

      return (
        <AdminAssetsPageWrapper
          assets={assets}
          pageSize={resolvedPageSize}
          total={total}
          search={search}
          sort={sort}
          type={params.type}
          issues={params.issues}
          verified={params.verified}
        />
      );
    }
    case 'recovery': {
      const result = await getCustomerRecovery(search, params.key);
      return <CustomerRecoveryPanel result={result} />;
    }
    case 'feedback':
    default: {
      const { items, error } = await getAdminFeedbackItemsResult(200);

      return (
        <AdminFeedbackTable
          loadError={error}
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
  await requireCurrentAdminPageAccess();

  const params = await adminPeopleSearchParams.parse(searchParams);
  const view = resolvePeopleView(params.view);
  const content = await renderPeopleView(view, params);

  return (
    <AdminPage
      title='People'
      description='User table, roles, waitlist, creators, and individual actions.'
      tabs={{
        param: 'view',
        value: view,
        options: peopleTabs,
        clearOnPrimaryChange: ['type', 'issues', 'verified', 'key'],
      }}
      testId='admin-people-page'
      viewTestId={`admin-people-view-${view}`}
    >
      <AdminPeopleRightPanelProvider>{content}</AdminPeopleRightPanelProvider>
    </AdminPage>
  );
}
