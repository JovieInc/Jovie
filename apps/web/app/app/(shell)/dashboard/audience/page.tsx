import { redirect } from 'next/navigation';
import type { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';
import { DashboardAudienceClient } from '@/components/dashboard/organisms/DashboardAudienceClient';
import { PageErrorState } from '@/components/feedback/PageErrorState';
import { APP_URL } from '@/constants/app';
import { audienceSearchParams } from '@/lib/nuqs';
import { logger } from '@/lib/utils/logger';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
import {
  trimLeadingSlashes,
  trimTrailingSlashes,
} from '@/lib/utils/string-utils';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { getDashboardData } from '../actions';
import { getAudienceServerData } from './audience-data';

// User-specific page - always render fresh
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function AudienceContent({
  searchParams,
}: Readonly<{
  searchParams: Promise<SearchParams>;
}>) {
  try {
    // Fetch dashboard data server-side (handles auth internally)
    const dashboardData = await getDashboardData();

    // Handle unauthenticated users
    if (!dashboardData.user?.id) {
      redirect('/sign-in?redirect_url=/app/dashboard/audience');
    }

    // Handle redirects for users who need onboarding
    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
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

    const audienceData = await getAudienceServerData({
      userId: dashboardData.user.id,
      selectedProfileId: artist?.id ?? null,
      searchParams: {
        page: String(parsedParams.page),
        pageSize: String(parsedParams.pageSize),
        sort: parsedParams.sort,
        direction: parsedParams.direction,
      },
    });

    return (
      <DashboardAudienceClient
        mode={audienceData.mode}
        initialRows={audienceData.rows}
        total={audienceData.total}
        page={audienceData.page}
        pageSize={audienceData.pageSize}
        sort={audienceData.sort}
        direction={audienceData.direction}
        profileUrl={profileUrl}
      />
    );
  } catch (error) {
    throwIfRedirect(error);
    logger.error('[AudiencePage] Failed to load audience data', { error });

    return (
      <PageErrorState message='Failed to load audience data. Please refresh the page.' />
    );
  }
}

function AudienceSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div className='h-8 w-48 animate-pulse rounded bg-surface-1' />
        <div className='h-10 w-32 animate-pulse rounded bg-surface-1' />
      </div>
      <div className='h-96 animate-pulse rounded-lg bg-surface-1' />
    </div>
  );
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
