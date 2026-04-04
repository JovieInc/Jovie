import { redirect } from 'next/navigation';
import type { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { DashboardAudienceClient } from '@/features/dashboard/organisms/DashboardAudienceClient';
import { AudienceTableLoadingShell } from '@/features/dashboard/organisms/dashboard-audience-table/AudienceTableLoadingShell';
import type { AudienceSegment } from '@/features/dashboard/organisms/dashboard-audience-table/types';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { audienceFilters, audienceSearchParams } from '@/lib/nuqs';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
import {
  trimLeadingSlashes,
  trimTrailingSlashes,
} from '@/lib/utils/string-utils';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { getDashboardShellData } from '../actions';
import { loadUpcomingTourDates } from '../tour-dates/actions';
import { getAudienceServerData } from './audience-data';

export const runtime = 'nodejs';

/**
 * Audience page — streams instantly after auth gate.
 *
 * Auth check via getCachedAuth (Clerk JWT, no DB) runs at the page level
 * so unauthenticated users redirect immediately. Uses getDashboardShellData
 * (skips settings/entitlements) for faster shell rendering. Audience data
 * is cached via unstable_cache (5 min TTL) so repeat visits are instant.
 */
export default async function AudiencePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<SearchParams>;
}>) {
  const { userId } = await getCachedAuth();
  if (!userId) {
    redirect(
      `${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.DASHBOARD_AUDIENCE}`
    );
  }

  return (
    <Suspense fallback={<AudienceTableLoadingShell />}>
      <AudienceContent userId={userId} searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Async server component — fetches dashboard shell + audience data.
 * Suspense boundary above shows skeleton instantly while this resolves.
 */
async function AudienceContent({
  userId,
  searchParams,
}: Readonly<{
  userId: string;
  searchParams: Promise<SearchParams>;
}>) {
  try {
    const isE2E = process.env.NEXT_PUBLIC_E2E_MODE === '1';

    // Shell data is faster than essential data (skips settings/entitlements)
    const dashboardData = await getDashboardShellData(userId);

    if (dashboardData.dashboardLoadError) {
      void captureError(
        'Dashboard data load failed on audience page',
        dashboardData.dashboardLoadError,
        { route: APP_ROUTES.DASHBOARD_AUDIENCE }
      );
      return (
        <PageErrorState message='Failed to load audience data. Please refresh the page.' />
      );
    }

    // Onboarding check first — during provisioning, user may be null but
    // needsOnboarding is true. Checking user first would incorrectly redirect
    // authenticated-but-not-yet-provisioned users to signin.
    if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
      redirect(APP_ROUTES.ONBOARDING);
    }

    if (!dashboardData.user?.id) {
      redirect(
        `${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.DASHBOARD_AUDIENCE}`
      );
    }

    const artist = dashboardData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
      : null;

    const profileUrl =
      artist?.handle && artist.handle.length > 0
        ? `${trimTrailingSlashes(BASE_URL)}/${trimLeadingSlashes(artist.handle)}`
        : undefined;

    // Parse search params using nuqs for type-safe URL state
    const parsedParams = await audienceSearchParams.parse(searchParams);

    // Validate segments from URL against known values
    const validSegments = parsedParams.segments.filter(
      (s): s is AudienceSegment =>
        (audienceFilters as readonly string[]).includes(s)
    );

    // Fetch audience data and tour dates in parallel
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

    // Map tour dates to lightweight shape for client-side city matching
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
      route: APP_ROUTES.DASHBOARD_AUDIENCE,
    });

    return (
      <PageErrorState message='Failed to load audience data. Please refresh the page.' />
    );
  }
}
