import type { Metadata } from 'next';
import Link from 'next/link';
import type { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';
import {
  PAGE_TOOLBAR_TAB_ACTIVE_CLASS,
  PAGE_TOOLBAR_TAB_BUTTON_CLASS,
  PageToolbar,
} from '@/components/organisms/table/molecules/PageToolbar';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { AudienceTableLoadingShell } from '@/features/dashboard/organisms/dashboard-audience-table/AudienceTableLoadingShell';
import type { AudienceSegment } from '@/features/dashboard/organisms/dashboard-audience-table/types';
import { LazyDashboardAudienceClient } from '@/features/dashboard/organisms/LazyDashboardAudienceClient';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { captureError } from '@/lib/error-tracking';
import { audienceFilters, audienceSearchParams } from '@/lib/nuqs';
import { cn } from '@/lib/utils';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
import {
  trimLeadingSlashes,
  trimTrailingSlashes,
} from '@/lib/utils/string-utils';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import {
  type AppShellRouteContext,
  loadAppShellRouteContext,
  requireAppShellDashboardUserId,
} from '../app-shell-route-context';
import { getAudienceServerData } from '../dashboard/audience/audience-data';
import { loadUpcomingTourDates } from '../dashboard/tour-dates/actions';
import { ContactsPageClient } from './ContactsPageClient';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Contacts',
  description: 'Manage bookings, management, and press contacts',
};

type ContactsWorkspaceTab = 'contacts' | 'audience';

export function resolveContactsWorkspaceTab(
  value: string | readonly string[] | undefined
): ContactsWorkspaceTab {
  return value === 'audience' ? 'audience' : 'contacts';
}

function buildAudienceWorkspaceHref(searchParams: SearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'tab' || value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      params.append(key, entry);
    }
  }
  params.set('tab', 'audience');
  return `${APP_ROUTES.CONTACTS}?${params.toString()}`;
}

function ContactsWorkspaceTabs({
  activeTab,
  searchParams,
}: Readonly<{
  activeTab: ContactsWorkspaceTab;
  searchParams: SearchParams;
}>) {
  return (
    <PageToolbar
      className='border-b border-subtle'
      start={
        <>
          <Link
            href={APP_ROUTES.CONTACTS}
            className={cn(
              PAGE_TOOLBAR_TAB_BUTTON_CLASS,
              activeTab === 'contacts' && PAGE_TOOLBAR_TAB_ACTIVE_CLASS
            )}
            aria-current={activeTab === 'contacts' ? 'page' : undefined}
          >
            Contacts
          </Link>
          <Link
            href={buildAudienceWorkspaceHref(searchParams)}
            className={cn(
              PAGE_TOOLBAR_TAB_BUTTON_CLASS,
              activeTab === 'audience' && PAGE_TOOLBAR_TAB_ACTIVE_CLASS
            )}
            aria-current={activeTab === 'audience' ? 'page' : undefined}
          >
            Audience
          </Link>
        </>
      }
    />
  );
}

export default async function ContactsPage({
  searchParams = Promise.resolve({}),
}: Readonly<{
  searchParams?: Promise<SearchParams>;
}> = {}) {
  const resolvedSearchParams = await searchParams;
  const activeTab = resolveContactsWorkspaceTab(resolvedSearchParams.tab);
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.CONTACTS,
    dashboardErrorLogMessage: 'Dashboard data load failed on contacts page',
    dashboardErrorMessage: 'Failed to load contacts. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  const profile = routeContext.dashboardData.selectedProfile;
  if (!profile) {
    return (
      <PageErrorState message='Unable to load your artist profile. Please refresh the page.' />
    );
  }

  return (
    <div
      className='flex h-full min-h-0 flex-col'
      data-testid='contacts-workspace'
    >
      <ContactsWorkspaceTabs
        activeTab={activeTab}
        searchParams={resolvedSearchParams}
      />
      <div className='min-h-0 flex-1'>
        {activeTab === 'audience' ? (
          <Suspense fallback={<AudienceTableLoadingShell />}>
            <ContactsAudienceWorkspaceContent
              routeContext={routeContext}
              searchParams={searchParams}
            />
          </Suspense>
        ) : (
          <ContactsPageClient
            profileId={profile.id}
            artistName={profile.displayName?.trim() || profile.username}
            artistHandle={profile.usernameNormalized ?? profile.username}
          />
        )}
      </div>
    </div>
  );
}

async function ContactsAudienceWorkspaceContent({
  routeContext,
  searchParams,
}: Readonly<{
  routeContext: AppShellRouteContext;
  searchParams: Promise<SearchParams>;
}>) {
  try {
    const isE2E = process.env.NEXT_PUBLIC_E2E_MODE === '1';
    const { dashboardData } = routeContext;
    const dashboardUserId = requireAppShellDashboardUserId(
      routeContext,
      APP_ROUTES.CONTACTS
    );
    const artist = dashboardData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
      : null;
    const profileUrl =
      artist?.handle && artist.handle.length > 0
        ? `${trimTrailingSlashes(BASE_URL)}/${trimLeadingSlashes(artist.handle)}`
        : undefined;
    const parsedParams = await audienceSearchParams.parse(searchParams);
    const validSegments = parsedParams.segments.filter(
      (segment): segment is AudienceSegment =>
        (audienceFilters as readonly string[]).includes(segment)
    );
    const [audienceData, tourDates] = await Promise.all([
      getAudienceServerData({
        userId: dashboardUserId,
        selectedProfileId: artist?.id ?? null,
        searchParams: {
          page: String(parsedParams.page),
          pageSize: String(parsedParams.pageSize),
          sort: parsedParams.sort,
          direction: parsedParams.direction,
        },
        view: parsedParams.view,
        includeDetails: !isE2E,
        segments: validSegments,
      }),
      !isE2E && artist?.id
        ? loadUpcomingTourDates(artist.id).catch(() => [])
        : Promise.resolve([]),
    ]);

    return (
      <LazyDashboardAudienceClient
        mode={audienceData.mode}
        view={audienceData.view}
        initialRows={audienceData.rows}
        total={audienceData.total}
        page={audienceData.page}
        pageSize={audienceData.pageSize}
        sort={audienceData.sort}
        direction={audienceData.direction}
        profileUrl={profileUrl}
        profileId={artist?.id ?? undefined}
        subscriberCount={audienceData.subscriberCount}
        totalAudienceCount={audienceData.totalAudienceCount}
        filters={{ segments: validSegments }}
        tourDates={tourDates.map(
          (tourDate: { city: string; startDate: string }) => ({
            city: tourDate.city,
            startDate: tourDate.startDate,
          })
        )}
      />
    );
  } catch (error) {
    throwIfRedirect(error);
    void captureError('Contacts audience workspace failed', error, {
      route: APP_ROUTES.CONTACTS,
    });
    return (
      <PageErrorState message='Failed to load audience data. Please refresh the page.' />
    );
  }
}
