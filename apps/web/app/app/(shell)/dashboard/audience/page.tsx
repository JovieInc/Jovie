import { redirect } from 'next/navigation';
import type { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';
import { APP_URL } from '@/constants/app';
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
import { getDashboardData } from '../actions';
import { loadUpcomingTourDates } from '../tour-dates/actions';
import { getAudienceServerData } from './audience-data';

export const runtime = 'nodejs';

async function AudienceContent({
  searchParams,
}: Readonly<{
  searchParams: Promise<SearchParams>;
}>) {
  try {
    // Auth check via Clerk JWT (no DB dependency) — ensures unauthenticated
    // users are redirected even during DB outages
    const { userId } = await getCachedAuth();
    if (!userId) {
      redirect(
        `${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.DASHBOARD_AUDIENCE}`
      );
    }

    const isE2E = process.env.NEXT_PUBLIC_E2E_MODE === '1';

    const dashboardData = await getDashboardData();

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
    if (dashboardData.needsOnboarding) {
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
        ? `${trimTrailingSlashes(APP_URL)}/${trimLeadingSlashes(artist.handle)}`
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

function AudienceSkeleton() {
  return <AudienceTableLoadingShell />;
}

export default async function AudiencePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<SearchParams>;
}>) {
  return (
    <Suspense fallback={<AudienceSkeleton />}>
      <AudienceContent searchParams={searchParams} />
    </Suspense>
  );
}
