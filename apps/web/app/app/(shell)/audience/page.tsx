import { redirect } from 'next/navigation';
import type { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { DashboardAudienceClient } from '@/features/dashboard/organisms/DashboardAudienceClient';
import { AudienceTableLoadingShell } from '@/features/dashboard/organisms/dashboard-audience-table/AudienceTableLoadingShell';
import type { AudienceSegment } from '@/features/dashboard/organisms/dashboard-audience-table/types';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { buildAppShellSignInUrl } from '@/lib/auth/build-app-shell-signin-url';
import { captureError } from '@/lib/error-tracking';
import { audienceFilters, audienceSearchParams } from '@/lib/nuqs';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
import {
  trimLeadingSlashes,
  trimTrailingSlashes,
} from '@/lib/utils/string-utils';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import {
  loadAppShellRouteContext,
  loadAuthenticatedAppShellUserId,
} from '../app-shell-route-context';
import { getAudienceServerData } from '../dashboard/audience/audience-data';
import { loadUpcomingTourDates } from '../dashboard/tour-dates/actions';

export const runtime = 'nodejs';

/**
 * Audience page — streams instantly after auth gate.
 *
 * The shared early auth helper runs before Suspense so unauthenticated users
 * redirect immediately while the async content keeps the table fallback.
 */
export default async function AudiencePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<SearchParams>;
}>) {
  const userId = await loadAuthenticatedAppShellUserId({
    route: APP_ROUTES.AUDIENCE,
  });

  return (
    <Suspense fallback={<AudienceTableLoadingShell />}>
      <AudienceContent userId={userId} searchParams={searchParams} />
    </Suspense>
  );
}

async function AudienceContent({
  userId,
  searchParams,
}: Readonly<{
  userId: string;
  searchParams: Promise<SearchParams>;
}>) {
  try {
    const isE2E = process.env.NEXT_PUBLIC_E2E_MODE === '1';
    const routeContext = await loadAppShellRouteContext({
      route: APP_ROUTES.AUDIENCE,
      authenticatedUserId: userId,
      dashboardErrorLogMessage: 'Dashboard data load failed on audience page',
      dashboardErrorMessage:
        'Failed to load audience data. Please refresh the page.',
    });
    if (!routeContext.ok) {
      return routeContext.error;
    }

    const { dashboardData } = routeContext;
    if (!dashboardData.user?.id) {
      redirect(buildAppShellSignInUrl(APP_ROUTES.AUDIENCE));
    }

    const artist = dashboardData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
      : null;

    const profileUrl =
      artist?.handle && artist.handle.length > 0
        ? `${trimTrailingSlashes(BASE_URL)}/${trimLeadingSlashes(artist.handle)}`
        : undefined;

    const parsedParams = await audienceSearchParams.parse(searchParams);
    const validSegments = parsedParams.segments.filter(
      (s): s is AudienceSegment =>
        (audienceFilters as readonly string[]).includes(s)
    );

    const [audienceData, tourDates] = await Promise.all([
      getAudienceServerData({
        userId: dashboardData.user.id,
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

    const tourDatesForMatching = tourDates.map(
      (td: { city: string; startDate: string }) => ({
        city: td.city,
        startDate: td.startDate,
      })
    );

    return (
      <DashboardAudienceClient
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
        tourDates={tourDatesForMatching}
      />
    );
  } catch (error) {
    throwIfRedirect(error);
    void captureError('Audience page failed', error, {
      route: APP_ROUTES.AUDIENCE,
    });

    return (
      <PageErrorState message='Failed to load audience data. Please refresh the page.' />
    );
  }
}
